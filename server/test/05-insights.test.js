import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startServer, stopServer, wipe, seedOrg, loginAs } from './helpers.js';
import { freshness, summarizeFreshness } from '../src/services/freshness.js';
import { analyseGuideline, textSignals } from '../src/services/ambiguity.js';
import { evaluate } from '../src/services/evaluation.js';
import { Content, Review, Guideline } from '../src/models/index.js';
import { DEMO_FACTS, DEMO_GUIDELINES } from '../src/lib/demoBrand.js';
import { EVAL_EXAMPLES } from '../src/data/evalDataset.js';

let A;
before(async () => { await startServer(); await wipe(); A = await seedOrg({ slug: 'ins-org' }); });
after(async () => { await wipe(); await stopServer(); });

const DAY = 864e5;

describe('fact freshness uses real dates', () => {
  test('status is computed from the stored expiry date and the current clock', () => {
    const now = new Date('2026-10-27T00:00:00Z');
    assert.equal(freshness({ expiresAt: new Date('2026-12-31') }, now).status, 'ok');
    assert.equal(freshness({ expiresAt: new Date('2026-11-10') }, now).status, 'expiring');
    assert.equal(freshness({ expiresAt: new Date('2026-10-01') }, now).status, 'expired');
    assert.equal(freshness({ reviewBy: new Date('2026-09-01') }, now).status, 'overdue_review');
  });

  test('the label is human readable', () => {
    const f = freshness({ expiresAt: new Date(Date.now() - 5 * DAY) });
    assert.match(f.label, /Expired 5 days ago/);
  });

  test('summariseFreshness counts each bucket', () => {
    const now = new Date('2026-10-27T00:00:00Z');
    const s = summarizeFreshness([
      { expiresAt: new Date('2027-01-01') },
      { expiresAt: new Date('2026-11-01') },
      { expiresAt: new Date('2026-01-01') },
      { reviewBy: new Date('2026-01-01') },
    ], now);
    assert.deepEqual(s.counts, { ok: 1, expiring: 1, expired: 1, overdue_review: 1 });
  });

  test('the API reports expired demo facts honestly', async () => {
    const c = await loginAs(A, 'brand_manager', 'ins-org');
    const r = await c.get('/insights/freshness');
    assert.equal(r.status, 200);
    assert.ok(r.body.facts.length === DEMO_FACTS.length);
    const expired = r.body.facts.filter((f) => f.freshness.status === 'expired');
    assert.ok(expired.length >= 1, 'the deliberately expired demo fact must be reported');
    assert.ok(r.body.counts.attentionNeeded >= 1);
    assert.ok(new Date(r.body.checkedAt) <= new Date());
  });
});

describe('brand knowledge versioning', () => {
  test('editing a fact creates a new version and keeps history', async () => {
    const cm = await loginAs(A, 'brand_manager', 'ins-org');
    const facts = await cm.get('/brand/facts');
    const fact = facts.body.facts.find((f) => f.key === 'price.pro');
    assert.equal(fact.version, 1);

    const upd = await cm.put(`/brand/facts/${fact._id}`, {
      key: 'price.pro', label: 'Pro plan price (monthly)', statement: 'The approved price is ₹2,999 per user per month.',
      value: '₹2,999 per user per month', sourceRef: 'Demo Brand Book §3 (fictional), revised',
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.fact.version, 2);

    const hist = await cm.get(`/brand/facts/${fact._id}/history`);
    assert.equal(hist.body.current.version, 2);
    assert.equal(hist.body.history.length, 1);
    assert.match(hist.body.history[0].statement, /2,499/);
  });

  test('findings record the fact version that was used at check time', async () => {
    const cc = await loginAs(A, 'creator', 'ins-org');
    const created = await cc.post('/content', { title: 'Versioned fact check', body: 'Our Pro plan costs ₹1,999 per user per month.', channel: 'other' });
    const check = await cc.post(`/content/${created.body.content._id}/check`, {});
    const f = check.body.findings.find((x) => x.ruleId === 'FACT-NUMERIC-CONFLICT');
    assert.ok(f);
    assert.equal(f.factVersion, 2, 'must reference the current approved version');
    assert.match(f.evidence, /₹2,999/, 'evidence must quote the new approved statement');
  });

  test('retiring a fact keeps it out of new checks but preserves the record', async () => {
    const cm = await loginAs(A, 'brand_manager', 'ins-org');
    const facts = await cm.get('/brand/facts');
    const target = facts.body.facts.find((f) => f.key === 'claim.languages');
    await cm.del(`/brand/facts/${target._id}`);
    const after = await cm.get('/brand/facts');
    const retired = after.body.facts.find((f) => f.key === 'claim.languages');
    assert.equal(retired.status, 'retired');
    assert.equal(retired.version, target.version + 1);
    assert.ok(retired.history.length >= 1);
  });

  test('guideline edits are versioned too', async () => {
    const cm = await loginAs(A, 'brand_manager', 'ins-org');
    const g = (await cm.get('/brand/guidelines')).body.guidelines.find((x) => x.code === 'GL-SUP-01');
    const upd = await cm.put(`/brand/guidelines/${g._id}`, {
      code: 'GL-SUP-01', title: g.title, text: `${g.text} Reviewed 2026-10.`, category: 'claims',
      severity: 'high', sourceRef: g.sourceRef, patterns: ['superlative'],
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.guideline.version, g.version + 1);
    const hist = await cm.get(`/brand/guidelines/${g._id}/history`);
    assert.equal(hist.body.history.length, 1);
  });
});

describe('guideline ambiguity detector uses real decisions', () => {
  test('text signals are derived from the guideline wording', () => {
    const vague = textSignals({ title: 'Be reasonable', text: 'Content should generally be appropriate and reasonable where possible.', version: 1 });
    assert.ok(vague.some((s) => s.label === 'Vague wording'));
    assert.ok(vague.some((s) => s.label === 'No measurable criterion'));
    const precise = textSignals({ title: 'Price rule', text: 'Any quoted price must equal the price in the approved price list, including currency and billing period.', forbidden: ['free'], version: 1 });
    assert.ok(!precise.some((s) => s.label === 'Vague wording'));
  });

  test('with no decisions, the detector says "no data" and does not invent disagreement', async () => {
    const g = await Guideline.findOne({ orgId: A.org._id, code: 'GL-PRC-01' }).lean();
    const analysis = await analyseGuideline(A.org._id, g, undefined);
    const noData = analysis.signals.find((s) => s.label === 'No decision data yet');
    assert.ok(noData, 'must report missing data explicitly');
    assert.equal(noData.weight, 0, 'no data must carry zero weight');
    assert.ok(!analysis.signals.some((s) => s.label.includes('dismissing')), 'must not claim disagreement without data');
  });

  test('with real dismissals recorded, the detector surfaces them as evidence', async () => {
    const cm = await loginAs(A, 'brand_manager', 'ins-org');
    const g = (await cm.get('/brand/guidelines')).body.guidelines.find((x) => x.code === 'GL-CLF-01');
    const cc = await loginAs(A, 'creator', 'ins-org');
    const cRev = await loginAs(A, 'reviewer', 'ins-org');

    // Create three checked submissions containing a guarantee claim, then dismiss all three.
    for (let i = 0; i < 3; i += 1) {
      const created = await cc.post('/content', { title: `Guarantee sample ${i}`, body: `We guarantee you will love sample ${i} of the product.`, channel: 'other' });
      const check = await cc.post(`/content/${created.body.content._id}/check`, {});
      const fid = check.body.findings.find((f) => f.ruleId === 'CLAIM-GUARANTEE')?._id;
      assert.ok(fid, 'expected a guarantee finding');
      const d = await cRev.post(`/content/${created.body.content._id}/findings/${fid}/decision`, {
        action: 'dismissed', reason: 'Approved guarantee policy exists; the rule does not cover this wording.',
      });
      assert.equal(d.status, 200);
    }

    const r = await cm.get('/insights/ambiguity');
    assert.equal(r.status, 200);
    const flagged = r.body.analyses.find((a) => a.code === 'GL-CLF-01');
    assert.ok(flagged, 'the guideline must appear in analysis');
    assert.equal(flagged.stats.dismissals, 3, 'must count the real recorded dismissals');
    assert.ok(flagged.decisionEvidence.length >= 3, 'must show the evidence behind the claim');
    assert.ok(flagged.decisionEvidence[0].reason.includes('guarantee policy'));
    assert.ok(flagged.signals.some((s) => s.label.includes('dismissing')), 'must flag the disagreement');
    assert.ok(flagged.proposedText.length > 0, 'must propose a rewrite');
  });

  test('a brand manager can edit and accept the proposal, creating a new guideline version', async () => {
    const cm = await loginAs(A, 'brand_manager', 'ins-org');
    const r = await cm.get('/insights/ambiguity');
    const proposal = r.body.proposals.find((p) => p.status === 'open');
    assert.ok(proposal, 'expected an open proposal');
    const before = (await cm.get('/brand/guidelines')).body.guidelines.find((g) => String(g._id) === String(proposal.guidelineId));

    const decide = await cm.post(`/insights/ambiguity/${proposal._id}/decide`, {
      action: 'edited', finalText: 'Guarantee wording is allowed when the sentence names an approved guarantee policy ID.', note: 'Narrowed to the real cases.',
    });
    assert.equal(decide.status, 200);

    const after = (await cm.get('/brand/guidelines')).body.guidelines.find((g) => String(g._id) === String(proposal.guidelineId));
    assert.equal(after.version, before.version + 1);
    assert.match(after.text, /approved guarantee policy ID/);
    assert.ok(after.history.some((h) => /Ambiguity proposal/.test(h.changeNote || '')), 'audit note must be kept');
  });

  test('only a brand manager can decide proposals', async () => {
    const cm = await loginAs(A, 'brand_manager', 'ins-org');
    const r = await cm.get('/insights/ambiguity');
    const proposal = r.body.proposals[0];
    if (!proposal) return;
    for (const role of ['creator', 'reviewer', 'approver']) {
      const c = await loginAs(A, role, 'ins-org');
      const d = await c.post(`/insights/ambiguity/${proposal._id}/decide`, { action: 'rejected' });
      assert.equal(d.status, 403, `${role} must not decide proposals`);
    }
  });
});

describe('evaluation metrics are computed from a labelled dataset', () => {
  test('metrics are real numbers from the dataset, not constants', () => {
    const facts = DEMO_FACTS.map((f, i) => ({ ...f, _id: `f${i}`, version: 1, status: 'approved' }));
    const guides = DEMO_GUIDELINES.map((g, i) => ({ ...g, _id: `g${i}`, version: 1, status: 'active' }));
    const r = evaluate(facts, guides);
    assert.equal(r.examples, EVAL_EXAMPLES.length);
    assert.equal(r.holdoutExamples >= 7, true);
    assert.equal(typeof r.metrics.precision, 'number');
    assert.equal(r.metrics.truePositives + r.metrics.falseNegatives, r.perExample.reduce((a, p) => a + p.expected.length, 0));

    // A deliberately degraded knowledge base must lower recall: proves the metric reacts.
    const missing = evaluate([], guides, { batch: 2 });
    assert.ok(missing.metrics.recall < r.metrics.recall, 'with no facts, factual recall must drop');
  });

  test('the evaluation API returns honest limitations and both batches', async () => {
    const c = await loginAs(A, 'brand_manager', 'ins-org');
    const r = await c.get('/evaluation');
    assert.equal(r.status, 200);
    assert.equal(r.body.datasetSize, EVAL_EXAMPLES.length);
    assert.ok(r.body.limitations.length >= 4);
    assert.ok(r.body.limitations.join(' ').includes('optimistic'));
    assert.ok(r.body.results.batch2.perExample.length >= 10);
    assert.equal(r.body.aiMode.mode, 'rules-only');
  });

  test('running an evaluation stores a record', async () => {
    const c = await loginAs(A, 'brand_manager', 'ins-org');
    const run = await c.post('/evaluation/run', {});
    assert.equal(run.status, 200);
    assert.ok(run.body.run.metrics.precision !== undefined);
    const list = await c.get('/evaluation/runs');
    assert.ok(list.body.runs.length >= 1);
  });

  test('only reviewer/brand_manager can run an evaluation', async () => {
    for (const role of ['creator', 'approver']) {
      const c = await loginAs(A, role, 'ins-org');
      const r = await c.post('/evaluation/run', {});
      assert.equal(r.status, 403);
    }
  });
});
