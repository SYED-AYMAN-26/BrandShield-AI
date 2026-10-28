import { Router } from 'express';
import { Content, Review, AuditEvent, BrandFact, Guideline, AiUsageLog } from '../models/index.js';
import { authenticate, scoped } from '../middleware/auth.js';
import { asyncRoute } from '../lib/http.js';
import { summarizeFreshness } from '../services/freshness.js';
import { aiStatus } from '../services/aiGateway.js';
import { Organization } from '../models/index.js';

const router = Router();
router.use(authenticate);

/** All numbers below come from stored records for this organisation only. */
router.get('/', asyncRoute(async (req, res) => {
  const orgId = req.auth.orgId;
  const base = scoped(req);
  const [contents, facts, guidelines, org, recentAudit] = await Promise.all([
    Content.find(base).select('title status channel findings lastCheck updatedAt isDemo authorId').populate('authorId', 'name').lean(),
    BrandFact.find(base).lean(),
    Guideline.find(base).lean(),
    Organization.findById(orgId).lean(),
    AuditEvent.find(base).sort({ at: -1 }).limit(12).lean(),
  ]);

  const byStatus = { draft: 0, in_review: 0, changes_requested: 0, approved: 0, rejected: 0 };
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  const byType = { conflict: 0, unsupported_claim: 0, possible_issue: 0, needs_human_review: 0 };
  let findingsTotal = 0;
  let checkedCount = 0;
  let demoCount = 0;

  for (const c of contents) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (c.isDemo) demoCount += 1;
    if (c.lastCheck?.at) checkedCount += 1;
    for (const f of c.findings || []) {
      findingsTotal += 1;
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      byType[f.type] = (byType[f.type] || 0) + 1;
    }
  }

  const fresh = summarizeFreshness(facts);
  const guideFresh = summarizeFreshness(guidelines);

  const pendingForMe = {
    creator: contents.filter((c) => ['draft', 'changes_requested'].includes(c.status) && String(c.authorId?._id) === req.auth.userId).length,
    reviewer: contents.filter((c) => c.status === 'in_review').length,
    approver: contents.filter((c) => c.status === 'in_review').length,
    brand_manager: contents.filter((c) => c.status === 'in_review').length,
  }[req.auth.role] ?? 0;

  res.json({
    totals: {
      content: contents.length, checked: checkedCount, demoContent: demoCount,
      realContent: contents.length - demoCount,
      facts: facts.length, guidelines: guidelines.length,
      findings: findingsTotal,
      openHighSeverity: contents.reduce((acc, c) => acc + (c.findings || []).filter((f) => ['high', 'critical'].includes(f.severity) && !['dismissed', 'accepted'].includes(f.status)).length, 0),
    },
    byStatus, bySeverity, byType,
    pendingForMe,
    freshness: { facts: fresh.counts, guidelines: guideFresh.counts },
    recentAudit: recentAudit.map((a) => ({ action: a.action, summary: a.summary, actorName: a.actorName, role: a.actorRole, at: a.at })),
    workQueue: contents
      .filter((c) => ['in_review', 'changes_requested', 'draft'].includes(c.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6)
      .map((c) => ({ id: c._id, title: c.title, status: c.status, channel: c.channel, author: c.authorId?.name, updatedAt: c.updatedAt, isDemo: c.isDemo })),
    ai: aiStatus(org),
    isDemoOrg: !!org?.isDemo,
  });
}));

router.get('/audit', asyncRoute(async (req, res) => {
  const q = scoped(req);
  if (req.query.action) q.action = String(req.query.action).slice(0, 80);
  const events = await AuditEvent.find(q).sort({ at: -1 }).limit(200).lean();
  res.json({ events });
}));

router.get('/ai-usage', asyncRoute(async (req, res) => {
  const logs = await AiUsageLog.find(scoped(req)).sort({ at: -1 }).limit(100).lean();
  const counts = { success: 0, error: 0, blocked: 0, skipped: 0 };
  for (const l of logs) counts[l.status] = (counts[l.status] || 0) + 1;
  res.json({
    logs: logs.map((l) => ({ ...l, promptHash: l.promptHash ? `${l.promptHash.slice(0, 12)}…` : undefined })),
    counts,
    note: 'Only a hash of the redacted prompt is stored. Raw content is never logged here.',
  });
}));

export default router;
