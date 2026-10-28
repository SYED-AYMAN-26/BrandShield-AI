export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new AppError(400, m, d);
export const unauthorized = (m = 'Please sign in to continue.') => new AppError(401, m);
export const forbidden = (m = 'You do not have permission to do that.') => new AppError(403, m);
export const notFound = (m = 'Not found.') => new AppError(404, m);
export const conflict = (m, d) => new AppError(409, m, d);

export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong.';
  let details = err.details;
  if (err.name === 'ValidationError') { status = 400; message = 'Some fields are invalid.'; details = Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v.message])); }
  if (err.name === 'CastError') { status = 400; message = 'Invalid identifier.'; }
  if (err.code === 11000) { status = 409; message = 'That item already exists.'; }
  if (status >= 500) { console.error('[error]', err); message = 'Something went wrong on our side. Please try again.'; }
  res.status(status).json({ error: { message, details, status } });
}
