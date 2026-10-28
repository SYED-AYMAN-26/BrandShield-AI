/** Small fetch wrapper: cookies included, JSON parsed, friendly errors surfaced. */
export class ApiError extends Error {
  constructor(message, status, details) { super(message); this.status = status; this.details = details; }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, credentials: 'include', headers: { ...headers } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }

  let res;
  try { res = await fetch(`/api${path}`, opts); }
  catch { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
  // A 401 on the session probe is the normal "not signed in yet" case, not an error worth
  // logging in the browser console.

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) throw new ApiError(data?.error?.message || 'Something went wrong. Please try again.', res.status, data?.error?.details);
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b }),
  patch: (p, b) => request(p, { method: 'PATCH', body: b }),
  put: (p, b) => request(p, { method: 'PUT', body: b }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, formData) => request(p, { method: 'POST', body: formData }),
};
