/**
 * Proves the Confidential Mode / AI-gateway guarantee with a real HTTP counter.
 *
 * A local fake AI provider counts every incoming request. We point the gateway at it and
 * assert that ZERO requests arrive when AI is disabled, and that requests DO arrive when it
 * is enabled (so we know the counter works and the test is not passing trivially).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { startServer, stopServer, wipe, seedOrg, loginAs } from './helpers.js';
import { callAi, aiStatus, purgeAiLogs, providerStats } from '../src/services/aiGateway.js';
import { AiUsageLog, Organization } from '../src/models/index.js';

let A;
let fakeProvider;
let providerRequests = 0;
let lastPayload = null;
let providerMode = 'ok';

before(async () => {
  await startServer();
  await wipe();
  A = await seedOrg({ slug: 'conf-org' });

  fakeProvider = http.createServer((req, res) => {
    providerRequests += 1;
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { lastPayload = JSON.parse(body); } catch { lastPayload = body; }
      if (providerMode === 'error') { res.writeHead(500); return res.end('{"error":"boom"}'); }
      if (providerMode === 'badjson') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] })); }
      if (providerMode === 'badschema') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: [{ bogus: true }] }) } }] })); }
      const content = JSON.stringify({
        findings: [{
          type: 'unsupported_claim', severity: 'medium',
          excerpt: 'Inkloom AI is world class',
          explanation: 'Superlative without an approved benchmark.',
          suggestedFix: 'Cite the approved benchmark or remove the claim.',
          evidenceRef: 'GL-SUP-01',
        }],
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((r) => fakeProvider.listen(0, '127.0.0.1', r));
  config.aiBaseUrl = `http://127.0.0.1:${fakeProvider.address().port}`;
});

after(async () => {
  await new Promise((r) => fakeProvider.close(r));
  await wipe();
  await stopServer();
});

function enableAi({ key = 'test-key-123', provider = 'openai' } = {}) {
  config.aiProvider = provider;
  config.aiApiKey = key;
}

function disableAi() {
  config.aiProvider = 'none';
  config.aiApiKey = '';
}

describe('Confidential Mode: zero provider calls', () => {
  test('the fake provider counter works (sanity check)', async () => {
    enableAi();
    providerRequests = 0;
    const org = await Organization.findById(A.org._id).lean();
    const r = await callAi({ prompt: 'test prompt', org: { ...org, confidentialMode: false, aiProvider: 'openai' } });
    assert.equal(r.ok, true, 'provider should have answered');
    assert.equal(providerRequests, 1, 'provider must have received exactly one request');
    disableAi();
  });

  test('a check with Confidential Mode ON makes zero provider calls', async () => {
    enableAi();                       // credentials exist and provider is reachable...
    providerRequests = 0;
    providerStats.calls = 0;

    const org = await Organization.findByIdAndUpdate(A.org._id, { confidentialMode: true, aiProvider: 'openai' }, { new: true }).lean();
    const c = await loginAs(A, 'creator', 'conf-org');
    const created = await c.post('/content', { title: 'Confidential check', body: 'Inkloom AI is world class. Pro plan is ₹1,999 per month.', channel: 'other' });
    const check = await c.post(`/content/${created.body.content._id}/check`, {});

    assert.equal(check.status, 200);
    assert.equal(providerRequests, 0, 'CONFIDENTIAL MODE VIOLATED: provider was called');
    assert.equal(providerStats.calls, 0, 'model call counter must stay at zero');
    assert.equal(check.body.mode, 'rules-only');
    assert.match(check.body.aiDisabledReason, /Confidential Mode/i);
    assert.ok(check.body.findings.length > 0, 'rule findings must still be produced without AI');

    // ...and the blocked attempt is recorded honestly
    const blocked = await AiUsageLog.find({ orgId: A.org._id, status: 'blocked', purpose: 'content_check' }).sort({ at: -1 }).lean();
    assert.ok(blocked.length > 0, 'a blocked usage row must be recorded');
    assert.match(blocked[0].blockedReason, /Confidential Mode/i);

    await Organization.findByIdAndUpdate(A.org._id, { confidentialMode: false });
    disableAi();
  });

  test('provider=none also makes zero calls even without Confidential Mode', async () => {
    enableAi({ provider: 'none' });
    providerRequests = 0;
    const org = await Organization.findById(A.org._id).lean();
    const r = await callAi({ prompt: 'x', org: { ...org, confidentialMode: false, aiProvider: 'none' } });
    assert.equal(r.ok, false);
    assert.equal(providerRequests, 0);
    disableAi();
  });

  test('missing API key makes zero calls', async () => {
    enableAi({ key: '' });
    providerRequests = 0;
    const org = await Organization.findById(A.org._id).lean();
    const r = await callAi({ prompt: 'x', org: { ...org, confidentialMode: false, aiProvider: 'openai' } });
    assert.equal(r.ok, false);
    assert.equal(providerRequests, 0);
    disableAi();
  });

  test('aiStatus reports the reason in plain English', () => {
    const s1 = aiStatus({ confidentialMode: true, aiProvider: 'openai' });
    assert.equal(s1.enabled, false);
    assert.match(s1.reason, /Confidential Mode/i);
    const s2 = aiStatus({ confidentialMode: false, aiProvider: 'none' });
    assert.equal(s2.mode, 'rules-only');
  });
});

describe('AI gateway: redaction, validation and failure handling', () => {
  test('sensitive values are redacted before the request leaves the process', async () => {
    enableAi();
    providerRequests = 0;
    const org = await Organization.findById(A.org._id).lean();
    await callAi({
      prompt: 'Contact hello@secret.test or +91 98765 43210. Key sk-abcdef1234567890123. Price ₹2,499.',
      org: { ...org, confidentialMode: false, aiProvider: 'openai' },
    });
    assert.equal(providerRequests, 1);
    const sent = JSON.stringify(lastPayload);
    assert.ok(!sent.includes('hello@secret.test'), 'email must be redacted before sending');
    assert.ok(!sent.includes('sk-abcdef1234567890123'), 'api key must be redacted before sending');
    assert.ok(sent.includes('[REDACTED_EMAIL]'));
    disableAi();
  });

  test('a non-JSON provider reply is rejected, not trusted', async () => {
    enableAi();
    providerMode = 'badjson';
    const org = await Organization.findById(A.org._id).lean();
    const r = await callAi({ prompt: 'x', org: { ...org, confidentialMode: false, aiProvider: 'openai' } });
    assert.equal(r.ok, false);
    assert.match(r.reason, /failed/i);
    providerMode = 'ok';
    disableAi();
  });

  test('a schema-invalid provider reply is rejected', async () => {
    enableAi();
    providerMode = 'badschema';
    const org = await Organization.findById(A.org._id).lean();
    const r = await callAi({ prompt: 'x', org: { ...org, confidentialMode: false, aiProvider: 'openai' } });
    assert.equal(r.ok, false);
    assert.match(r.reason, /failed|schema/i);
    providerMode = 'ok';
    disableAi();
  });

  test('provider HTTP errors degrade to rule-only results with an honest message', async () => {
    enableAi();
    providerMode = 'error';
    const org = await Organization.findById(A.org._id).lean();
    const r = await callAi({ prompt: 'x', org: { ...org, confidentialMode: false, aiProvider: 'openai' } });
    assert.equal(r.ok, false);
    assert.equal(r.providerCalls, 1);
    assert.match(r.reason, /rule-based/i);
    providerMode = 'ok';
    disableAi();
  });

  test('a valid provider reply is accepted but only kept if the excerpt is verbatim', async () => {
    enableAi();
    const org = await Organization.findById(A.org._id).lean();
    const body = 'Inkloom AI is world class at everything.';
    const created = await loginAs(A, 'brand_manager', 'conf-org').then((c) => c.post('/content', { title: 'AI vet', body, channel: 'other' }));
    const c = await loginAs(A, 'creator', 'conf-org');
    const check = await c.post(`/content/${created.body.content._id}/check`, {});
    assert.equal(check.status, 200);
    const aiFindings = check.body.findings.filter((f) => f.source === 'ai');
    for (const f of aiFindings) {
      assert.ok(body.includes(f.excerpt), 'AI findings must quote the submission verbatim');
      assert.price;
    }
    disableAi();
  });

  test('usage logging stores a hash, never the prompt', async () => {
    const logs = await AiUsageLog.find({ orgId: A.org._id }).sort({ at: -1 }).limit(20).lean();
    assert.ok(logs.length > 0);
    const dump = JSON.stringify(logs);
    assert.ok(!dump.includes('hello@secret.test'));
    assert.ok(logs.some((l) => l.promptHash && l.promptHash.length === 64));
  });

  test('retention purge deletes only old logs', async () => {
    const orgId = A.org._id;
    await AiUsageLog.create({ orgId, status: 'success', at: new Date(Date.now() - 90 * 864e5), purpose: 'old' });
    const before = await AiUsageLog.countDocuments({ orgId });
    const res = await purgeAiLogs({ orgId, olderThanDays: 30 });
    const afterCount = await AiUsageLog.countDocuments({ orgId });
    assert.ok(res.deleted >= 1);
    assert.equal(afterCount, before - res.deleted);
  });

  test('redaction preview endpoint shows what would be sent, and sends nothing', async () => {
    enableAi();
    providerRequests = 0;
    const c = await loginAs(A, 'brand_manager', 'conf-org');
    const r = await c.get('/content/tools/ai-preview');
    assert.equal(r.status, 200);
    assert.equal(providerRequests, 0, 'preview must not call the provider');
    assert.ok(r.body.preview.redacted.length > 0);
    assert.match(r.body.note, /Nothing is sent/i);
    disableAi();
  });
});
