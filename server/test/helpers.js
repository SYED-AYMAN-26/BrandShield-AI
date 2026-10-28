import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Organization, User, BrandFact, Guideline, Content, Review, AuditEvent, AiUsageLog, GuidelineSuggestion, EvaluationRun } from '../src/models/index.js';
import { DEMO_FACTS, DEMO_GUIDELINES, DEMO_USERS, DEMO_PASSWORD, SAMPLE_CONTENT_BAD, SAMPLE_CONTENT_FIXED } from '../src/lib/demoBrand.js';
import bcrypt from 'bcryptjs';

export const TEST_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/brandshield_test';

let server;
let base;

export async function startServer() {
  if (server) return base;
  await mongoose.connect(TEST_URI);
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

export async function stopServer() {
  if (server) { await new Promise((r) => server.close(r)); server = null; }
  if (mongoose.connection.readyState) await mongoose.disconnect();
}

export async function wipe() {
  await Promise.all([
    User.deleteMany({}), Organization.deleteMany({}), BrandFact.deleteMany({}), Guideline.deleteMany({}),
    Content.deleteMany({}), Review.deleteMany({}), AuditEvent.deleteMany({}), AiUsageLog.deleteMany({}),
    GuidelineSuggestion.deleteMany({}), EvaluationRun.deleteMany({}),
  ]);
}

/** Creates an org with the 4 demo roles + approved facts/guidelines. */
export async function seedOrg({ slug = 'test-org', name = 'Test Org', confidentialMode = false } = {}) {
  const org = await Organization.create({ name, slug, confidentialMode });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 4);
  const users = {};
  for (const u of DEMO_USERS) {
    users[u.role] = await User.create({ orgId: org._id, name: u.name, email: `${u.role}.${slug}@test.local`, role: u.role, passwordHash: hash });
  }
  const facts = [];
  for (const f of DEMO_FACTS) {
    facts.push(await BrandFact.create({ ...f, orgId: org._id, status: 'approved', createdBy: users.brand_manager._id }));
  }
  const guidelines = [];
  for (const g of DEMO_GUIDELINES) {
    guidelines.push(await Guideline.create({ ...g, orgId: org._id, status: 'active', createdBy: users.brand_manager._id }));
  }
  return { org, users, facts, guidelines };
}

/** Lightweight API client that keeps a cookie jar per role. */
export function client() {
  let cookie = '';
  let token = '';
  async function call(method, path, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/api${path}`, {
      method, headers, body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const c of setCookie) if (c.startsWith('bs_token=')) cookie = c.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, body: json };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b, h) => call('POST', p, b, h),
    patch: (p, b) => call('PATCH', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
    async login(email, password = DEMO_PASSWORD) {
      const r = await call('POST', '/auth/login', { email, password });
      if (r.body.token) token = r.body.token;
      return r;
    },
    setToken(t) { token = t; },
    raw: (p, opts = {}) => fetch(`${base}${p}`, opts),
  };
}

export async function loginAs(seed, role, slug = 'test-org') {
  const c = client();
  await c.login(`${role}.${slug}@test.local`);
  return c;
}

export { SAMPLE_CONTENT_BAD, SAMPLE_CONTENT_FIXED, DEMO_PASSWORD };
