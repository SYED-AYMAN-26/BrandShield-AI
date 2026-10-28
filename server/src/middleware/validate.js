import { badRequest } from '../lib/http.js';

export const validate = (schema, part = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[part]);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'body';
      if (!details[path]) details[path] = issue.message;
    }
    return next(badRequest('Please fix the highlighted fields and try again.', details));
  }
  req[part === 'body' ? 'valid' : `${part}Query`] = result.data;
  next();
};

export const str = (z, { min = 1, max = 5000, label = 'This field' } = {}) =>
  z.string({ required_error: `${label} is required.`, invalid_type_error: `${label} must be text.` })
    .trim().min(min, `${label} must be at least ${min} character(s).`)
    .max(max, `${label} must be under ${max} characters.`);
