import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { unauthorized, forbidden } from '../lib/http.js';

export const COOKIE = 'bs_token';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), orgId: String(user.orgId), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry },
  );
}

export function publicUser(u) {
  return { id: String(u._id), name: u.name, email: u.email, role: u.role, orgId: String(u.orgId), isDemo: !!u.isDemo };
}

function readToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies?.[COOKIE]) return req.cookies[COOKIE];
  return null;
}

/** Authenticates and pins req.auth.orgId — the ONLY source of org scoping used by routes. */
export async function authenticate(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) return next(unauthorized());
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { return next(unauthorized('Your session expired. Please sign in again.')); }
    if (!mongoose.isValidObjectId(payload.sub)) return next(unauthorized());

    const user = await User.findById(payload.sub).lean();
    if (!user || !user.active) return next(unauthorized('This account is not active.'));

    // The token's orgId must match the user's real orgId — prevents forged cross-tenant tokens.
    if (String(user.orgId) !== String(payload.orgId)) return next(unauthorized('Invalid session.'));

    req.auth = { userId: String(user._id), orgId: String(user.orgId), role: user.role, user: publicUser(user) };
    next();
  } catch (e) { next(e); }
}

/** Role gate. Backend-enforced; the frontend only mirrors this. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(forbidden(`This action needs one of these roles: ${roles.join(', ')}. You are signed in as ${req.auth.role}.`));
    }
    next();
  };
}

/** Scoped filter helper — every tenant-owned query must go through this. */
export function scoped(req, extra = {}) {
  return { orgId: new mongoose.Types.ObjectId(req.auth.orgId), ...extra };
}
