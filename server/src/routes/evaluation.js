import { Router } from 'express';
import { EvaluationRun, BrandFact, Guideline, Organization } from '../models/index.js';
import { authenticate, requireRole, scoped } from '../middleware/auth.js';
import { asyncRoute } from '../lib/http.js';
import { evaluate, LIMITATIONS } from '../services/evaluation.js';
import { aiStatus, providerStats } from '../services/aiGateway.js';
import { DATASET_VERSION, EVAL_EXAMPLES } from '../data/evalDataset.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate);

async function knowledge(orgId) {
  const [facts, guidelines] = await Promise.all([
    BrandFact.find({ orgId, status: 'approved' }).lean(),
    Guideline.find({ orgId, status: 'active' }).lean(),
  ]);
  return { facts, guidelines };
}

router.get('/', asyncRoute(async (req, res) => {
  const { facts, guidelines } = await knowledge(req.auth.orgId);
  const org = await Organization.findById(req.auth.orgId).lean();
  const ai = aiStatus(org);

  const all = evaluate(facts, guidelines);
  const batch1 = evaluate(facts, guidelines, { batch: 1 });
  const batch2 = evaluate(facts, guidelines, { batch: 2 });

  res.json({
    datasetVersion: DATASET_VERSION,
    datasetSize: EVAL_EXAMPLES.length,
    results: { all, batch1, batch2 },
    aiMode: { mode: ai.mode, reason: ai.reason, providerCalls: providerStats.calls },
    limitations: LIMITATIONS,
    interpretation: {
      precision: 'Of the issues the checker flagged, what share were real. 1.0 = no false alarms.',
      recall: 'Of the real issues in the labelled set, what share the checker found. 1.0 = nothing missed.',
      falseAlarmRateOnClean: 'Share of intentionally clean examples where the checker flagged something anyway.',
    },
  });
}));

router.post('/run', requireRole('brand_manager', 'reviewer'), asyncRoute(async (req, res) => {
  const { facts, guidelines } = await knowledge(req.auth.orgId);
  const result = evaluate(facts, guidelines);
  const run = await EvaluationRun.create({
    orgId: req.auth.orgId, name: `Rule evaluation ${new Date().toISOString().slice(0, 10)}`,
    mode: 'rule', datasetVersion: DATASET_VERSION, metrics: result.metrics,
    perExample: result.perExample.map((p) => ({ id: p.id, expected: p.expected, predicted: p.predicted, tp: p.truePositives.length, fp: p.falseAlarms.length, fn: p.missed.length })),
  });
  await audit(req, 'evaluation.run', { entityType: 'EvaluationRun', entityId: run._id, summary: `Ran evaluation: precision ${result.metrics.precision}, recall ${result.metrics.recall}` });
  res.json({ run, result });
}));

router.get('/runs', asyncRoute(async (req, res) => {
  const runs = await EvaluationRun.find(scoped(req)).sort({ at: -1 }).limit(20).lean();
  res.json({ runs });
}));

export default router;
