import { Router } from 'express';
import { z } from 'zod';
import { BrandFact, Guideline } from '../models/index.js';
import { authenticate, requireRole, scoped } from '../middleware/auth.js';
import { asyncRoute, notFound, badRequest } from '../lib/http.js';
import { validate, str } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { freshness } from '../services/freshness.js';

const router = Router();
router.use(authenticate);

const canEdit = requireRole('brand_manager');

/* ------------------------------ Facts ------------------------------ */
const factSchema = z.object({
  key: str(z, { min: 2, max: 80, label: 'Fact key' }).regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, numbers, dots or dashes only (e.g. price.pro).'),
  label: str(z, { min: 2, max: 200, label: 'Label' }),
  statement: str(z, { min: 5, max: 2000, label: 'Approved statement' }),
  value: z.string().max(500).optional().default(''),
  category: z.string().max(60).optional().default('general'),
  sourceRef: str(z, { min: 3, max: 1000, label: 'Source reference' }),
  expiresAt: z.coerce.date().optional().nullable(),
  reviewBy: z.coerce.date().optional().nullable(),
  aliases: z.array(z.string().max(200)).max(20).optional().default([]),
});

router.get('/facts', asyncRoute(async (req, res) => {
  const facts = await BrandFact.find(scoped(req)).sort({ key: 1 }).lean();
  res.json({ facts: facts.map((f) => ({ ...f, freshness: freshness(f) })) });
}));

router.post('/facts', canEdit, validate(factSchema), asyncRoute(async (req, res) => {
  const exists = await BrandFact.findOne(scoped(req, { key: req.valid.key }));
  if (exists) throw badRequest('A fact with that key already exists. Edit the existing fact instead.');
  const fact = await BrandFact.create({ ...scoped(req), ...req.valid, createdBy: req.auth.userId, version: 1 });
  await audit(req, 'fact.created', { entityType: 'BrandFact', entityId: fact._id, summary: `Created fact ${fact.key}` });
  res.status(201).json({ fact: { ...fact.toObject(), freshness: freshness(fact) } });
}));

router.put('/facts/:id', canEdit, validate(factSchema), asyncRoute(async (req, res) => {
  const fact = await BrandFact.findOne(scoped(req, { _id: req.params.id }));
  if (!fact) throw notFound('That brand fact no longer exists.');
  fact.history.push({
    version: fact.version, statement: fact.statement, value: fact.value, sourceRef: fact.sourceRef,
    effectiveFrom: fact.effectiveFrom, expiresAt: fact.expiresAt, reviewBy: fact.reviewBy,
    status: fact.status, changedBy: req.auth.userId, changeNote: 'Superseded by edit',
  });
  Object.assign(fact, req.valid);
  fact.version += 1;
  await fact.save();
  await audit(req, 'fact.updated', { entityType: 'BrandFact', entityId: fact._id, summary: `Updated fact ${fact.key} to v${fact.version}` });
  res.json({ fact: { ...fact.toObject(), freshness: freshness(fact) } });
}));

router.delete('/facts/:id', canEdit, asyncRoute(async (req, res) => {
  const fact = await BrandFact.findOne(scoped(req, { _id: req.params.id }));
  if (!fact) throw notFound('That brand fact no longer exists.');
  fact.status = 'retired'; // never hard-delete: findings reference past versions
  fact.history.push({ version: fact.version, statement: fact.statement, status: 'retired', changedBy: req.auth.userId, changeNote: 'Retired' });
  fact.version += 1;
  await fact.save();
  await audit(req, 'fact.retired', { entityType: 'BrandFact', entityId: fact._id, summary: `Retired fact ${fact.key}` });
  res.json({ ok: true });
}));

/* --------------------------- Guidelines ---------------------------- */
const guideSchema = z.object({
  code: str(z, { min: 3, max: 40, label: 'Guideline code' }).regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, numbers and dashes (e.g. GL-SUP-01).'),
  title: str(z, { min: 3, max: 200, label: 'Title' }),
  text: str(z, { min: 10, max: 3000, label: 'Rule text' }),
  category: z.string().max(60).optional().default('claims'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  sourceRef: str(z, { min: 3, max: 1000, label: 'Source reference' }),
  patterns: z.array(z.string().max(200)).max(20).optional().default([]),
  forbidden: z.array(z.string().max(200)).max(50).optional().default([]),
  requires: z.array(z.string().max(300)).max(20).optional().default([]),
  appliesToChannel: z.array(z.enum(['landing_page', 'email', 'social', 'ad', 'blog', 'other'])).max(6).optional().default([]),
  reviewBy: z.coerce.date().optional().nullable(),
});

router.get('/guidelines', asyncRoute(async (req, res) => {
  const guides = await Guideline.find(scoped(req)).sort({ code: 1 }).lean();
  res.json({ guidelines: guides.map((g) => ({ ...g, freshness: freshness(g) })) });
}));

router.post('/guidelines', canEdit, validate(guideSchema), asyncRoute(async (req, res) => {
  const exists = await Guideline.findOne(scoped(req, { code: req.valid.code }));
  if (exists) throw badRequest('A guideline with that code already exists.');
  const g = await Guideline.create({ ...scoped(req), ...req.valid, createdBy: req.auth.userId });
  await audit(req, 'guideline.created', { entityType: 'Guideline', entityId: g._id, summary: `Created guideline ${g.code}` });
  res.status(201).json({ guideline: g });
}));

router.put('/guidelines/:id', canEdit, validate(guideSchema), asyncRoute(async (req, res) => {
  const g = await Guideline.findOne(scoped(req, { _id: req.params.id }));
  if (!g) throw notFound('That guideline no longer exists.');
  g.history.push({
    version: g.version, title: g.title, text: g.text, severity: g.severity, sourceRef: g.sourceRef,
    changedBy: req.auth.userId, changeNote: req.body.changeNote || 'Superseded by edit',
  });
  Object.assign(g, req.valid);
  g.version += 1;
  await g.save();
  await audit(req, 'guideline.updated', { entityType: 'Guideline', entityId: g._id, summary: `Updated guideline ${g.code} to v${g.version}` });
  res.json({ guideline: g });
}));

router.delete('/guidelines/:id', canEdit, asyncRoute(async (req, res) => {
  const g = await Guideline.findOne(scoped(req, { _id: req.params.id }));
  if (!g) throw notFound('That guideline no longer exists.');
  g.status = 'retired';
  g.history.push({ version: g.version, title: g.title, text: g.text, changedBy: req.auth.userId, changeNote: 'Retired' });
  g.version += 1;
  await g.save();
  await audit(req, 'guideline.retired', { entityType: 'Guideline', entityId: g._id, summary: `Retired guideline ${g.code}` });
  res.json({ ok: true });
}));

/* --------------------- Change history per item --------------------- */
router.get('/facts/:id/history', asyncRoute(async (req, res) => {
  const f = await BrandFact.findOne(scoped(req, { _id: req.params.id })).lean();
  if (!f) throw notFound('That brand fact no longer exists.');
  res.json({ current: { version: f.version, statement: f.statement, value: f.value, sourceRef: f.sourceRef, status: f.status, expiresAt: f.expiresAt, reviewBy: f.reviewBy }, history: [...(f.history || [])].reverse() });
}));

router.get('/guidelines/:id/history', asyncRoute(async (req, res) => {
  const g = await Guideline.findOne(scoped(req, { _id: req.params.id })).lean();
  if (!g) throw notFound('That guideline no longer exists.');
  res.json({ current: { version: g.version, title: g.title, text: g.text, severity: g.severity, status: g.status }, history: [...(g.history || [])].reverse() });
}));

export default router;
