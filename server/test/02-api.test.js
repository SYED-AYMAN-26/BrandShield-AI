import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, wipe, seedOrg, client, loginAs, DEMO_PASSWORD } from './helpers.js';

let A; // org A seed
let B; // org B seed
let base;

before(async () => {
  base = await startServer();
  await wipe();
  A = await seedOrg({ slug: 'org-a', name: 'Org A' });
  B = await seedOrg({ slug: 'org-b', name: 'Org B' });
});
after(async () => { await wipe(); await stopServer(); });

describe('auth', () => {
  test('registration creates a workspace and signs the user in', async () => {
    const c = client();
    const r = await c.post('/auth/register', { name: 'New Person', email: 'new.person@example.com', password: 'aVeryLongPass1', orgName: 'New Co' });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.role, 'brand_manager');
  });

  test('weak password is rejected with a helpful field message', async () => {
    const c = client();
    const r = await c.post('/auth/register', { name: 'X', email: 'bad', password: 'short', orgName: 'Y' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details, 'expected per-field errors');
    assert.ok(JSON.stringify(r.body.error.details).toLowerCase().includes('email'));
  });

  test('duplicate email is rejected', async () => {
    const c = client();
    const r = await c.post('/auth/register', { name: 'Dup', email: 'creator.org-a@test.local', password: 'aVeryLongPass1', orgName: 'Dup Co' });
    assert.equal(r.status, 409);
  });

  test('wrong password is rejected', async () => {
    const c = client();
    const r = await c.login('creator.org-a@test.local', 'wrong-password');
    assert.equal(r.status, 401);
    assert.match(r.body.error.message, /incorrect/i);
  });

  test('protected routes reject anonymous requests', async () => {
    const c = client();
    const r = await c.get('/dashboard');
    assert.equal(r.status, 401);
  });

  test('a forged token for another organisation is rejected', async () => {
    const cA = await loginAs(A, 'brand_manager', 'org-a');
    const me = await cA.get('/auth/me');
    assert.equal(me.status, 200);
    // Take org A's user but claim org B by tampering with the payload signature.
    const forged = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2YWVhMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJvcmdJZCI6IjZhZWEwMDAwMDAwMDAwMDAwMDAwMDAwMSIsInJvbGUiOiJicmFuZF9tYW5hZ2VyIn0.bad-signature';
    const c2 = client(); c2.setToken(forged);
    const r = await c2.get('/dashboard');
    assert.equal(r.status, 401);
  });
});

describe('organisation data isolation', () => {
  test('org A cannot read org B content by id', async () => {
    const cA = await loginAs(A, 'creator', 'org-a');
    const cB = await loginAs(B, 'creator', 'org-b');
    const created = await cB.post('/content', { title: 'B secret landing page', body: 'Inkloom AI Pro plan costs ₹1,999 per month.', channel: 'landing_page' });
    assert.equal(created.status, 201);
    const bId = created.body.content._id;

    const read = await cA.get(`/content/${bId}`);
    assert.equal(read.status, 404, 'cross-org read must look like not-found, not forbidden');

    const edit = await cA.patch(`/content/${bId}`, { title: 'hijacked' });
    assert.equal(edit.status, 404);

    const check = await cA.post(`/content/${bId}/check`, {});
    assert.equal(check.status, 404);
  });

  test('org A cannot see org B facts or guidelines', async () => {
    const cA = await loginAs(A, 'brand_manager', 'org-a');
    const facts = await cA.get('/brand/facts');
    assert.equal(facts.status, 200);
    assert.ok(facts.body.facts.every((f) => String(f.orgId) === String(A.org._id)));
  });

  test('org A dashboard counts do not include org B records', async () => {
    const cA = await loginAs(A, 'brand_manager', 'org-a');
    const d = await cA.get('/dashboard');
    assert.equal(d.status, 200);
    assert.equal(d.body.totals.facts, A.facts.length);
  });
});

describe('roles and permissions (backend-enforced)', () => {
  test('only brand_manager can create brand facts', async () => {
    const payload = { key: 'price.test', label: 'Test price', statement: 'The test price is ₹100 per month.', value: '₹100', sourceRef: 'Test source' };
    for (const role of ['creator', 'reviewer', 'approver']) {
      const c = await loginAs(A, role, 'org-a');
      const r = await c.post('/brand/facts', payload);
      assert.equal(r.status, 403, `${role} must not create facts`);
      assert.match(r.body.error.message, /needs one of these roles/i);
    }
    const cm = await loginAs(A, 'brand_manager', 'org-a');
    const ok = await cm.post('/brand/facts', payload);
    assert.equal(ok.status, 201);
  });

  test('creator cannot approve content', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Approve test', body: 'Inkloom AI Pro plan costs ₹2,499 per month.', channel: 'other' });
    const id = created.body.content._id;
    await cCreator.post(`/content/${id}/check`, {});
    await cCreator.post(`/content/${id}/submit`, {});
    const r = await cCreator.post(`/content/${id}/approve`, {});
    assert.equal(r.status, 403);
  });

  test('reviewer cannot approve but can request changes', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Review test', body: 'Inkloom AI is the best tool in the world.', channel: 'other' });
    const id = created.body.content._id;
    await cCreator.post(`/content/${id}/check`, {});
    await cCreator.post(`/content/${id}/submit`, {});

    const cRev = await loginAs(A, 'reviewer', 'org-a');
    const approve = await cRev.post(`/content/${id}/approve`, {});
    assert.equal(approve.status, 403);

    const comment = await cRev.post(`/content/${id}/review/comment`, { body: 'Please remove the superlative claim.' });
    assert.equal(comment.status, 200);

    const changes = await cRev.post(`/content/${id}/review/request-changes`, { note: 'Remove "the best" and add the approved fact.' });
    assert.equal(changes.status, 200);
    assert.equal(changes.body.content.status, 'changes_requested');
  });

  test('creator cannot edit content while it is in review', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Locked edit test', body: 'Inkloom AI supports 12 languages for drafting.', channel: 'other' });
    const id = created.body.content._id;
    await cCreator.post(`/content/${id}/check`, {});
    await cCreator.post(`/content/${id}/submit`, {});
    const edit = await cCreator.patch(`/content/${id}`, { body: 'changed while in review' });
    assert.equal(edit.status, 400);
    assert.match(edit.body.error.message, /in_review|cannot edit/i);
  });

  test('creator cannot submit someone else\'s content', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const cManager = await loginAs(A, 'brand_manager', 'org-a');
    const created = await cManager.post('/content', { title: 'Manager content', body: 'Inkloom AI supports 12 languages.', channel: 'other' });
    const id = created.body.content._id;
    await cManager.post(`/content/${id}/check`, {});
    const r = await cCreator.post(`/content/${id}/submit`, {});
    assert.equal(r.status, 403);
  });

  test('only reviewer/brand_manager can decide on findings', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Decision perms', body: 'Inkloom AI is the best tool.', channel: 'other' });
    const id = created.body.content._id;
    const check = await cCreator.post(`/content/${id}/check`, {});
    const fid = check.body.findings[0]?._id;
    assert.ok(fid, 'expected at least one finding');
    const r = await cCreator.post(`/content/${id}/findings/${fid}/decision`, { action: 'dismissed', reason: 'nope' });
    assert.equal(r.status, 403);
  });
});

describe('full workflow', () => {
  test('submit -> comment -> request changes -> revise -> approve, with history and audit', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', {
      title: 'Full workflow test', channel: 'landing_page',
      body: 'Meet Inkloom AI, the best writing assistant. Our Pro plan is ₹1,999 per user per month.',
    });
    assert.equal(created.status, 201);
    const id = created.body.content._id;

    // 1. check
    const check = await cCreator.post(`/content/${id}/check`, {});
    assert.equal(check.status, 200);
    assert.ok(check.body.findings.length >= 2);
    assert.equal(check.body.mode, 'rules-only');

    // 2. submit
    const submit = await cCreator.post(`/content/${id}/submit`, {});
    assert.equal(submit.status, 200);
    assert.equal(submit.body.content.status, 'in_review');

    // 3. reviewer comments and dismisses with a reason
    const cRev = await loginAs(A, 'reviewer', 'org-a');
    const comment = await cRev.post(`/content/${id}/review/comment`, { body: 'Price looks wrong against the brand book.' });
    assert.equal(comment.status, 200);

    const superlative = check.body.findings.find((f) => f.ruleId === 'GUIDE-ABSOLUTE-CLAIM');
    const dismissWithoutReason = await cRev.post(`/content/${id}/findings/${superlative._id}/decision`, { action: 'dismissed', reason: '' });
    assert.equal(dismissWithoutReason.status, 400, 'dismissal requires a reason');

    const dismiss = await cRev.post(`/content/${id}/findings/${superlative._id}/decision`, { action: 'dismissed', reason: 'Headline is a tagline approved by legal in the brand book.' });
    assert.equal(dismiss.status, 200);
    const dismissed = dismiss.body.content.findings.find((f) => String(f._id) === String(superlative._id));
    assert.equal(dismissed.status, 'dismissed');
    assert.ok(dismissed.decisionReason.length > 3);

    // 4. approve blocked while high severity findings unresolved
    const cApp = await loginAs(A, 'approver', 'org-a');
    const blocked = await cApp.post(`/content/${id}/approve`, {});
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error.message, /high-severity/i);

    // 5. reviewer resolves every remaining high/critical finding (a real reviewer would)
    const stillBlocking = check.body.findings.filter(
      (f) => ['high', 'critical'].includes(f.severity) && String(f._id) !== String(superlative._id),
    );
    assert.ok(stillBlocking.length >= 1, 'the price conflict must still be blocking');
    for (const f of stillBlocking) {
      const accept = await cRev.post(`/content/${id}/findings/${f._id}/decision`, { action: 'accepted', reason: 'Confirmed against the approved brand source.' });
      assert.equal(accept.status, 200, `could not resolve ${f.ruleId}`);
    }

    // 6. approver approves
    const approved = await cApp.post(`/content/${id}/approve`, { note: 'Checked against brand book v2.' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.content.status, 'approved');

    // 7. history + audit
    const history = await cCreator.get(`/content/${id}/history`);
    assert.equal(history.status, 200);
    assert.ok(history.body.versions.length >= 2, 'revision history must contain multiple versions');
    assert.ok(history.body.reviews.length >= 1);
    assert.equal(history.body.reviews[0].comments.length >= 1, true);
    assert.ok(history.body.reviews[0].decisions.length >= 2, 'decisions must be recorded');

    const audit = await cCreator.get('/dashboard/audit');
    const actions = audit.body.events.map((e) => e.action);
    for (const expected of ['content.created', 'content.checked', 'content.submitted', 'review.commented', 'finding.dismissed', 'finding.accepted', 'content.approved']) {
      assert.ok(actions.includes(expected), `audit log missing ${expected}`);
    }
  });

  test('creation -> submission with issue -> reject keeps a reason', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Reject flow', body: 'Inkloom AI guarantees a 50% time saving.', channel: 'other' });
    const id = created.body.content._id;
    await cCreator.post(`/content/${id}/check`, {});
    await cCreator.post(`/content/${id}/submit`, {});
    const cApp = await loginAs(A, 'approver', 'org-a');
    const r = await cApp.post(`/content/${id}/reject`, { reason: 'Unsupported guarantee claim.' });
    assert.equal(r.status, 200);
    assert.equal(r.body.content.status, 'rejected');
    assert.equal(r.body.content.rejectedReason, 'Unsupported guarantee claim.');
    // rejected content can be resubmitted after revision
    const edit = await cCreator.patch(`/content/${id}`, { body: 'Inkloom AI helps teams write faster, according to our published benchmark.' });
    assert.equal(edit.status, 200);
  });

  test('cannot submit without checking first', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'No check submit', body: 'Inkloom AI supports 12 languages.', channel: 'other' });
    const r = await cCreator.post(`/content/${created.body.content._id}/submit`, {});
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /Check Content/i);
  });

  test('cannot approve content that is not in review', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Draft approve', body: 'Inkloom AI supports 12 languages.', channel: 'other' });
    const cApp = await loginAs(A, 'approver', 'org-a');
    const r = await cApp.post(`/content/${created.body.content._id}/approve`, {});
    assert.equal(r.status, 400);
  });

  test('double submission is rejected by the state machine', async () => {
    const cCreator = await loginAs(A, 'creator', 'org-a');
    const created = await cCreator.post('/content', { title: 'Double submit', body: 'Inkloom AI supports 12 languages.', channel: 'other' });
    const id = created.body.content._id;
    await cCreator.post(`/content/${id}/check`, {});
    assert.equal((await cCreator.post(`/content/${id}/submit`, {})).status, 200);
    const second = await cCreator.post(`/content/${id}/submit`, {});
    assert.equal(second.status, 400);
  });
});

describe('input validation', () => {
  test('too-short content is rejected with a field error', async () => {
    const c = await loginAs(A, 'creator', 'org-a');
    const r = await c.post('/content', { title: 'ab', body: 'short', channel: 'other' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details);
  });

  test('invalid channel is rejected', async () => {
    const c = await loginAs(A, 'creator', 'org-a');
    const r = await c.post('/content', { title: 'Valid title', body: 'A valid body of content.', channel: 'not_a_channel' });
    assert.equal(r.status, 400);
  });

  test('invalid id format returns 400 not 500', async () => {
    const c = await loginAs(A, 'creator', 'org-a');
    const r = await c.get('/content/not-an-object-id');
    assert.equal(r.status, 400);
  });

  test('unknown API route returns a clear 404', async () => {
    const c = await loginAs(A, 'creator', 'org-a');
    const r = await c.get('/does-not-exist');
    assert.equal(r.status, 404);
    assert.ok(r.body.error.message);
  });

  test('script tags in content are stored as text, not executed', async () => {
    const c = await loginAs(A, 'creator', 'org-a');
    const payload = '<script>alert(1)</script> Inkloom AI supports 12 languages.';
    const r = await c.post('/content', { title: 'XSS check', body: payload, channel: 'other' });
    assert.equal(r.status, 201);
    assert.equal(r.body.content.body, payload, 'stored verbatim; the client must escape it');
  });
});
