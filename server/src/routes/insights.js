import { Router } from 'express';
import { z } from 'zod';
import { Guideline, GuidelineSuggestion, BrandFact } from '../models/index.js';
import { authenticate, requireRole, scoped } from '../middleware/auth.js';
import { asyncRoute, notFound, badRequest } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { refreshSuggestions, analyseGuideline, outcomeSignals } from '../services/ambiguity.js';
import { summarizeFreshness } from '../services/freshness.js';

const router = Router();
router.use(authenticate);

/* --------------------- Guideline Ambiguity Detector ------------------ */
router.get('/ambiguity', asyncRoute(async (req, res) => {
  const analyses = await refreshSuggestions(req.auth.orgId);
  const saved = await GuidelineSuggestion.find(scoped(req)).sort({ updatedAt: -1 }).limit(50).lean();
  res.json({
    analyses: analyses.sort((a, b) => b.score - a.score),
    proposals: saved,
    method: 'Text signals come from the guideline wording. Disagreement signals come only from real accepted/dismissed findings recorded by reviewers in this workspace. Guidelines with fewer than 3 decisions are reported as "no data" and never flagged on disagreement.',
  });
}));

router.post('/ambiguity/:id/decide', requireRole('brand_manager'), validate(z.object({
  action: z.enum(['accepted', 'edited', 'rejected']),
  finalText: z.string().max(3000).optional(),
  note: z.string().max(1000).optional().default(''),
})), asyncRoute(async (req, res) => {
  const s = await GuidelineSuggestion.findOne(scoped(req, { _id: req.params.id }));
  if (!s) throw notFound('That proposal no longer exists.');
  if (s.status !== 'open') throw badRequest('That proposal has already been decided.');

  if (req.valid.action === 'accepted' || req.valid.action === 'edited') {
    const guide = await Guideline.findOne(scoped(req, { _id: s.guidelineId }));
    if (!guide) throw notFound('That guideline no longer exists.');
    const newText = req.valid.action === 'edited' ? (req.valid.finalText || '').trim() : s.proposedText;
    if (!newText) throw badRequest('Provide the wording you want to keep.');
    guide.history.push({
      version: guide.version, title: guide.title, text: guide.text, severity: guide.severity,
      sourceRef: guide.sourceRef, changedBy: req.auth.userId,
      changeNote: `Ambiguity proposal ${req.valid.action}: ${req.valid.note || 'no note'}`,
    });
    guide.text = newText;
    guide.version += 1;
    await guide.save();
    s.finalText = newText;
  }

  s.status = req.valid.action;
  s.decidedBy = req.auth.userId;
  s.decidedAt = new Date();
  s.decisionNote = req.valid.note;
  await s.save();
  await audit(req, `ambiguity.${req.valid.action}`, {
    entityType: 'GuidelineSuggestion', entityId: s._id,
    summary: `Ambiguity proposal ${req.valid.action} for guideline`, meta: { note: req.valid.note },
  });
  res.json({ proposal: s });
}));

/* ------------------------- Fact / guideline freshness ---------------- */
router.get('/freshness', asyncRoute(async (req, res) => {
  const facts = await BrandFact.find(scoped(req, { status: 'approved' })).lean();
  const guides = await Guideline.find(scoped(req, { status: 'active' })).lean();
  const f = summarizeFreshness(facts);
  const g = summarizeFreshness(guides);
  res.json({
    facts: f.rows.map((r) => ({ id: r._id, key: r.key, label: r.label, statement: r.statement, sourceRef: r.sourceRef, version: r.version, freshness: r.freshness })),
    guidelines: g.rows.map((r) => ({ id: r._id, code: r.code, title: r.title, version: r.version, freshness: r.freshness })),
    counts: {
      facts: f.counts, guidelines: g.counts,
      attentionNeeded: f.counts.expired + f.counts.expiring + f.counts.overdue_review + g.counts.expired + g.counts.expiring + g.counts.overdue_review,
    },
    checkedAt: f.checkedAt,
    note: 'All statuses are calculated from the stored effective/expiry/review dates and the current server date. Nothing is cached.',
  });
}));

export default router;
