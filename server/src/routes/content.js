import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import multer from 'multer';
import { Content, Review, BrandFact, Guideline } from '../models/index.js';
import { authenticate, requireRole, scoped } from '../middleware/auth.js';
import { asyncRoute, badRequest, notFound, forbidden, conflict } from '../lib/http.js';
import { validate, str } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { runCheck, previewPrompt, buildPrompt } from '../services/checkService.js';
import { extractFromUpload, fetchPublicUrl } from '../services/extract.js';
import { summarizeFreshness } from '../services/freshness.js';
import { assertTransition, label, STATUS_HELP } from '../services/workflow.js';
import { aiStatus } from '../services/aiGateway.js';
import { SEVERITY_HELP, TYPE_HELP } from '../services/checker.js';
import { Organization } from '../models/index.js';

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const contentSchema = z.object({
  title: str(z, { min: 3, max: 200, label: 'Title' }),
  body: str(z, { min: 10, max: 20000, label: 'Content' }),
  channel: z.enum(['landing_page', 'email', 'social', 'ad', 'blog', 'other']).optional().default('other'),
});

async function orgOf(req) {
  return Organization.findById(req.auth.orgId).lean();
}

/* --------------------------- Create / list --------------------------- */
router.post('/', validate(contentSchema), asyncRoute(async (req, res) => {
  const c = await Content.create({
    ...scoped(req), ...req.valid,
    authorId: req.auth.userId,
    versions: [{ version: 1, body: req.valid.body, title: req.valid.title, by: req.auth.userId, note: 'Created' }],
  });
  await audit(req, 'content.created', { entityType: 'Content', entityId: c._id, summary: `Created "${c.title}"` });
  res.status(201).json({ content: c });
}));

router.get('/', asyncRoute(async (req, res) => {
  const filter = scoped(req);
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.mine === '1' && ['creator', 'brand_manager'].includes(req.auth.role)) filter.authorId = req.auth.userId;
  const items = await Content.find(filter)
    .select('title channel status version updatedAt authorId lastCheck isDemo approvedAt rejectedReason createdAt')
    .populate('authorId', 'name role')
    .sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ items });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id })).populate('authorId', 'name role').lean();
  if (!c) throw notFound('That content no longer exists.');
  const review = c.reviewId ? await Review.findById(c.reviewId).lean() : null;
  const org = await orgOf(req);
  res.json({
    content: c,
    review,
    statusHelp: STATUS_HELP[c.status],
    ai: aiStatus(org),
    help: { severity: SEVERITY_HELP, types: TYPE_HELP },
  });
}));

/* ------------------------------ Editing ------------------------------ */
router.patch('/:id', validate(contentSchema.partial()), asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  if (!['creator', 'brand_manager'].includes(req.auth.role)) throw forbidden('Only a Creator or Brand Manager can edit content.');
  if (['draft', 'changes_requested', 'rejected'].includes(c.status) === false) {
    throw badRequest(`You cannot edit content while it is "${label(c.status)}". Ask the reviewer to respond first.`);
  }
  if (String(c.authorId) !== req.auth.userId && req.auth.role !== 'brand_manager') {
    throw forbidden('You can only edit content you created.');
  }
  if (req.valid.body && req.valid.body !== c.body) {
    c.versions.push({ version: c.version + 1, body: req.valid.body, title: req.valid.title || c.title, by: req.auth.userId, note: 'Edited' });
    c.version += 1;
  }
  Object.assign(c, req.valid);
  await c.save();
  await audit(req, 'content.edited', { entityType: 'Content', entityId: c._id, summary: `Edited "${c.title}" (v${c.version})` });
  res.json({ content: c });
}));

/* ------------------------------- Checking ---------------------------- */
router.post('/:id/check', asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  if (!['creator', 'brand_manager'].includes(req.auth.role)) throw forbidden('Only a Creator or Brand Manager can run a check.');
  if (!['draft', 'changes_requested', 'rejected'].includes(c.status)) {
    throw badRequest(`You cannot re-check content while it is "${label(c.status)}".`);
  }
  const org = await orgOf(req);
  const result = await runCheck({ org, user: req.auth.user, body: c.body, channel: c.channel });

  c.findings = result.findings.map((f) => ({ ...f, status: 'open' }));
  c.lastCheck = {
    at: new Date(), mode: result.mode, engine: result.engine, aiUsed: result.aiUsed,
    totals: result.totals, factsConsidered: result.considered.facts, guidelinesConsidered: result.considered.guidelines,
  };
  await c.save();

  await audit(req, 'content.checked', {
    entityType: 'Content', entityId: c._id,
    summary: `Checked "${c.title}": ${result.totals.total} finding(s), ${result.mode}`,
    meta: { totals: result.totals, mode: result.mode, injection: result.injection },
  });

  res.json({
    findings: c.findings,
    totals: result.totals,
    mode: result.mode,
    aiUsed: result.aiUsed,
    aiDisabledReason: result.aiDisabledReason,
    aiRejectedCount: result.aiRejectedCount,
    injection: result.injection,
    considered: result.considered,
    droppedCount: result.droppedCount,
    checkedAt: c.lastCheck.at,
    help: { severity: SEVERITY_HELP, types: TYPE_HELP },
  });
}));

/* ------------------- Accept / dismiss findings ----------------------- */
router.post('/:id/findings/:findingId/decision', validate(z.object({
  action: z.enum(['accepted', 'dismissed']),
  reason: z.string().max(1000).optional().default(''),
})), asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  if (!['reviewer', 'brand_manager'].includes(req.auth.role)) {
    throw forbidden('Only a Reviewer or Brand Manager can accept or dismiss findings.');
  }
  const f = c.findings.id(req.params.findingId);
  if (!f) throw notFound('That finding no longer exists. Re-run the check.');
  if (req.valid.action === 'dismissed' && !req.valid.reason.trim()) {
    throw badRequest('Please give a short reason when dismissing a finding, so the decision is on record.');
  }
  f.status = req.valid.action;
  f.decidedBy = req.auth.userId;
  f.decidedAt = new Date();
  f.decisionReason = req.valid.reason;
  await c.save();

  // Keep the decision log on the review record too, so the audit trail survives
  // even if the finding list is regenerated by a later re-check.
  if (c.reviewId) {
    await Review.updateOne(
      { _id: c.reviewId, orgId: req.auth.orgId },
      {
        $push: {
          decisions: {
            findingId: f._id, action: req.valid.action, reason: req.valid.reason,
            by: req.auth.userId, byName: req.auth.user.name, at: new Date(),
          },
        },
      },
    );
  }
  await audit(req, `finding.${req.valid.action}`, {
    entityType: 'Content', entityId: c._id,
    summary: `${req.auth.user.name} ${req.valid.action} "${f.ruleId}" finding`, meta: { reason: req.valid.reason },
  });
  res.json({ content: c });
}));

/* --------------------- Submit / review / approve --------------------- */
router.post('/:id/submit', asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  if (String(c.authorId) !== req.auth.userId && req.auth.role !== 'brand_manager') {
    throw forbidden('You can only submit your own content for review.');
  }
  if (!c.lastCheck?.at) {
    throw badRequest('Run "Check Content" at least once before submitting for review, so the reviewer can see the findings.');
  }
  const t = assertTransition(c.status, 'in_review', req.auth.role);
  if (!t.ok) throw badRequest(t.message);

  const review = await Review.create({
    ...scoped(req), contentId: c._id, contentVersion: c.version,
    requestedBy: req.auth.userId, status: 'pending',
  });
  c.status = 'in_review';
  c.reviewId = review._id;
  c.versions.push({ version: c.version, body: c.body, title: c.title, by: req.auth.userId, note: 'Submitted for review' });
  await c.save();
  await audit(req, 'content.submitted', { entityType: 'Content', entityId: c._id, summary: `Submitted "${c.title}" for review` });
  res.json({ content: c, review });
}));

router.post('/:id/review/comment', requireRole('reviewer', 'brand_manager'), validate(z.object({
  body: str(z, { min: 2, max: 2000, label: 'Comment' }),
  findingId: z.string().optional(),
})), asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  if (c.status !== 'in_review') throw badRequest('You can only comment while the content is in review.');
  const review = await Review.findOne(scoped(req, { _id: c.reviewId }));
  if (!review) throw notFound('No review is open for this content.');
  review.comments.push({ by: req.auth.userId, byName: req.auth.user.name, body: req.valid.body, findingId: req.valid.findingId });
  review.reviewerId = req.auth.userId;
  review.status = 'in_progress';
  await review.save();
  await audit(req, 'review.commented', { entityType: 'Review', entityId: review._id, summary: `Commented on "${c.title}"` });
  res.json({ review });
}));

router.post('/:id/review/request-changes', requireRole('reviewer', 'brand_manager'), validate(z.object({
  note: str(z, { min: 3, max: 2000, label: 'What needs to change' }),
})), asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  const t = assertTransition(c.status, 'changes_requested', req.auth.role);
  if (!t.ok) throw badRequest(t.message);
  const review = await Review.findOne(scoped(req, { _id: c.reviewId }));
  if (!review) throw notFound('No review is open for this content.');
  review.status = 'changes_requested';
  review.reviewerId = req.auth.userId;
  review.decisionNote = req.valid.note;
  review.comments.push({ by: req.auth.userId, byName: req.auth.user.name, body: `Changes requested: ${req.valid.note}` });
  await review.save();
  c.status = 'changes_requested';
  await c.save();
  await audit(req, 'review.changes_requested', { entityType: 'Content', entityId: c._id, summary: `Requested changes on "${c.title}"` });
  res.json({ content: c, review });
}));

router.post('/:id/approve', requireRole('approver', 'brand_manager'), validate(z.object({
  note: z.string().max(2000).optional().default(''),
})), asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  const t = assertTransition(c.status, 'approved', req.auth.role);
  if (!t.ok) throw badRequest(t.message);
  const blocking = c.findings.filter((f) => ['high', 'critical'].includes(f.severity) && !['fixed', 'dismissed', 'accepted'].includes(f.status));
  if (blocking.length) {
    throw conflict(`This content still has ${blocking.length} high-severity finding(s) that a reviewer has not resolved. Ask the reviewer to accept or dismiss them first.`);
  }
  const review = await Review.findOne(scoped(req, { _id: c.reviewId }));
  if (review) {
    review.status = 'approved';
    review.decidedBy = req.auth.userId;
    review.decidedAt = new Date();
    review.decisionNote = req.valid.note;
    await review.save();
  }
  c.status = 'approved';
  c.approvedBy = req.auth.userId;
  c.approvedAt = new Date();
  await c.save();
  await audit(req, 'content.approved', { entityType: 'Content', entityId: c._id, summary: `Approved "${c.title}"` });
  res.json({ content: c, review });
}));

router.post('/:id/reject', requireRole('approver', 'brand_manager'), validate(z.object({
  reason: str(z, { min: 3, max: 2000, label: 'Reason for rejection' }),
})), asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id }));
  if (!c) throw notFound('That content no longer exists.');
  const t = assertTransition(c.status, 'rejected', req.auth.role);
  if (!t.ok) throw badRequest(t.message);
  const review = await Review.findOne(scoped(req, { _id: c.reviewId }));
  if (review) {
    review.status = 'rejected';
    review.decidedBy = req.auth.userId;
    review.decidedAt = new Date();
    review.decisionNote = req.valid.reason;
    await review.save();
  }
  c.status = 'rejected';
  c.rejectedReason = req.valid.reason;
  await c.save();
  await audit(req, 'content.rejected', { entityType: 'Content', entityId: c._id, summary: `Rejected "${c.title}"`, meta: { reason: req.valid.reason } });
  res.json({ content: c, review });
}));

/* --------------------------- Version history ------------------------ */
router.get('/:id/history', asyncRoute(async (req, res) => {
  const c = await Content.findOne(scoped(req, { _id: req.params.id })).populate('versions.by', 'name role').lean();
  if (!c) throw notFound('That content no longer exists.');
  const reviews = await Review.find(scoped(req, { contentId: c._id })).sort({ createdAt: 1 }).lean();
  res.json({ versions: [...(c.versions || [])].reverse(), reviews });
}));

/* ------------------- Inputs: upload / URL / preview ----------------- */
router.post('/extract/upload', upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to upload first.');
  const out = await extractFromUpload({ filename: req.file.originalname, buffer: req.file.buffer });
  await audit(req, 'input.file_extracted', { summary: `Extracted ${out.kind} (${out.text.length} chars) from "${req.file.originalname}"` });
  res.json({
    text: out.text, kind: out.kind, warnings: out.warnings || [],
    filename: req.file.originalname, chars: out.text.length,
    note: 'This text is treated as untrusted content. Review and edit it before checking.',
  });
}));

router.post('/extract/url', validate(z.object({
  url: str(z, { min: 8, max: 2000, label: 'Web address' }),
})), asyncRoute(async (req, res) => {
  const out = await fetchPublicUrl(req.valid.url);
  await audit(req, 'input.url_fetched', { summary: `Fetched ${out.finalUrl}` });
  res.json({
    text: out.text, finalUrl: out.finalUrl, bytes: out.bytes, truncated: out.truncated,
    warnings: out.warnings, chars: out.text.length,
    note: 'Web pages are untrusted content. Instructions inside a page are never followed.',
  });
}));

/* -------------------- Confidential-mode diagnostics ----------------- */
router.get('/tools/ai-preview', asyncRoute(async (req, res) => {
  const org = await orgOf(req);
  const status = aiStatus(org);
  const facts = await BrandFact.find({ orgId: req.auth.orgId, status: 'approved' }).lean();
  const guidelines = await Guideline.find({ orgId: req.auth.orgId, status: 'active' }).lean();
  const sample = (req.query.text || 'Sample content: your Pro plan is ₹2,499 per month. Contact us at hello@example.com.').toString().slice(0, 4000);
  const built = buildPrompt({ body: sample, channel: 'other', facts, guidelines });
  const preview = previewPrompt(built.prompt);
  res.json({
    status,
    preview: { redacted: preview.redacted.slice(0, 4000), redactions: preview.redactions, chars: preview.chars },
    injection: { attempts: built.injectionAttempts, neutralised: built.neutralised },
    note: 'This is exactly what would leave our servers, with sensitive values redacted. Nothing is sent unless AI assistance is enabled.',
  });
}));

export default router;
