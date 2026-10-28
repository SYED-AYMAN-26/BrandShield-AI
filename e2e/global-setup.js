/**
 * Puts the demo workspace into a known state before the browser tests:
 *   1. rebuilds the seeded demo org,
 *   2. creates and submits one piece of content so reviewer/approver screens have real work.
 * This keeps the E2E run repeatable instead of depending on whatever ran before.
 */
const API = process.env.E2E_API_URL || 'http://127.0.0.1:4000/api';

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const { token } = await res.json();
  return (path, opts = {}) => fetch(`${API}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

export default async function globalSetup() {
  const creator = await login('creator@demo.inkloom.test', 'DemoPass!2026');

  const created = await creator('/content', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Review-ready demo draft',
      channel: 'landing_page',
      body: 'Inkloom AI is the best writing assistant. Our Pro plan is ₹1,999 per user per month. We guarantee faster launches.',
    }),
  });
  if (!created.ok) throw new Error(`could not create demo content: ${created.status}`);
  const { content } = await created.json();

  const checked = await creator(`/content/${content._id}/check`, { method: 'POST', body: '{}' });
  if (!checked.ok) throw new Error(`check failed: ${checked.status}`);

  const submitted = await creator(`/content/${content._id}/submit`, { method: 'POST', body: '{}' });
  if (!submitted.ok) throw new Error(`submit failed: ${submitted.status}`);
}
