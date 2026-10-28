import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Organization, User } from '../models/index.js';
import { signToken, publicUser, authenticate, COOKIE } from '../middleware/auth.js';
import { asyncRoute, badRequest, unauthorized, conflict } from '../lib/http.js';
import { validate, str } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { isProd } from '../config.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  // Only failed attempts count: a busy but legitimate user must not lock themselves out.
  skipSuccessfulRequests: true,
  message: { error: { message: 'Too many sign-in attempts. Please wait 10 minutes and try again.' } },
});
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20 });

const registerSchema = z.object({
  name: str(z, { min: 2, max: 120, label: 'Your name' }),
  email: str(z, { min: 5, max: 200, label: 'Email' }).email('Enter a valid email address.').toLowerCase(),
  password: z.string().min(10, 'Use at least 10 characters.').max(200, 'That password is too long.'),
  orgName: str(z, { min: 2, max: 120, label: 'Company name' }),
});

const loginSchema = z.object({
  email: str(z, { label: 'Email' }).email('Enter a valid email address.').toLowerCase(),
  password: z.string().min(1, 'Enter your password.'),
});

function setCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 864e5, path: '/',
  });
}

router.post('/register', registerLimiter, validate(registerSchema), asyncRoute(async (req, res) => {
  const { name, email, password, orgName } = req.valid;
  if (await User.findOne({ email })) throw conflict('An account with that email already exists. Try signing in instead.');

  const slug = `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${Date.now().toString(36)}`;
  const org = await Organization.create({ name: orgName, slug });
  const user = await User.create({
    orgId: org._id, name, email, role: 'brand_manager', // first user of an org manages the brand
    passwordHash: await bcrypt.hash(password, 12),
  });

  const token = signToken(user);
  setCookie(res, token);
  req.auth = { userId: String(user._id), orgId: String(org._id), role: user.role, user: publicUser(user) };
  await audit(req, 'user.registered', { entityType: 'User', entityId: user._id, summary: `${name} created the workspace ${orgName}` });
  res.status(201).json({ token, user: publicUser(user), org: { id: String(org._id), name: org.name } });
}));

router.post('/login', loginLimiter, validate(loginSchema), asyncRoute(async (req, res) => {
  const { email, password } = req.valid;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !user.active) throw unauthorized('Email or password is incorrect.');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw unauthorized('This account is temporarily locked. Try again in a few minutes.');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    if (user.failedLogins >= 8) user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    throw unauthorized('Email or password is incorrect.');
  }
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  setCookie(res, token);
  const org = await Organization.findById(user.orgId).lean();
  req.auth = { userId: String(user._id), orgId: String(user.orgId), role: user.role, user: publicUser(user) };
  await audit(req, 'user.login', { entityType: 'User', entityId: user._id, summary: `${user.name} signed in` });
  res.json({ token, user: publicUser(user), org: { id: String(org._id), name: org.name, isDemo: !!org.isDemo } });
}));

router.post('/logout', authenticate, asyncRoute(async (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  await audit(req, 'user.logout', { summary: 'Signed out' });
  res.json({ ok: true });
}));

router.get('/me', authenticate, asyncRoute(async (req, res) => {
  const org = await Organization.findById(req.auth.orgId).lean();
  res.json({
    user: req.auth.user,
    org: { id: String(org._id), name: org.name, isDemo: !!org.isDemo, confidentialMode: !!org.confidentialMode, aiProvider: org.aiProvider },
  });
}));

router.patch('/me', authenticate, validate(z.object({ name: str(z, { min: 2, max: 120, label: 'Your name' }) })), asyncRoute(async (req, res) => {
  const u = await User.findOneAndUpdate({ _id: req.auth.userId, orgId: req.auth.orgId }, { name: req.valid.name }, { new: true });
  if (!u) throw badRequest('Profile not found.');
  await audit(req, 'user.profile_updated', { entityType: 'User', entityId: u._id, summary: 'Updated display name' });
  res.json({ user: publicUser(u) });
}));

router.post('/change-password', authenticate, validate(z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(10, 'Use at least 10 characters.'),
})), asyncRoute(async (req, res) => {
  const u = await User.findOne({ _id: req.auth.userId, orgId: req.auth.orgId }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(req.valid.currentPassword, u.passwordHash))) {
    throw unauthorized('Your current password is not correct.');
  }
  u.passwordHash = await bcrypt.hash(req.valid.newPassword, 12);
  await u.save();
  await audit(req, 'user.password_changed', { entityType: 'User', entityId: u._id, summary: 'Changed password' });
  res.json({ ok: true });
}));

export default router;
