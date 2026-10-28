/**
 * Evaluation harness: scores the deterministic checker against the labelled dataset.
 * Rule-family level micro-averaging. Metrics are computed, never asserted.
 */
import { runRules } from './checker.js';
import { EVAL_EXAMPLES, DATASET_VERSION } from '../data/evalDataset.js';

const FAMILIES = {
  'FACT-NUMERIC-CONFLICT': 'Wrong number vs approved fact',
  'GUIDE-FORBIDDEN-PHRASE': 'Banned phrase',
  'GUIDE-ABSOLUTE-CLAIM': 'Unsupported superlative',
  'GUIDE-MISSING-REQUIRED-TEXT': 'Missing required disclosure',
  'CLAIM-GUARANTEE': 'Guarantee without policy',
  'CLAIM-HEDGED-STAT': 'Hedged stat without source',
  'FACT-UNCOVERED-NUMBER': 'Number with no approved fact',
  'FACT-EXPIRED': 'Expired approved fact',
};

export function evaluate(facts, guidelines, { split = 'all', batch = null } = {}) {
  const examples = EVAL_EXAMPLES.filter((e) => (split === 'all' || e.split === split) && (!batch || (e.batch || 1) === batch));
  const perExample = [];
  let tp = 0, fp = 0, fn = 0;

  for (const ex of examples) {
    const result = runRules(ex.body, facts, guidelines, { channel: ex.channel || 'other' });
    const predicted = [...new Set(result.findings.map((f) => f.ruleId))].sort();
    const expected = [...new Set(ex.expected)].sort();
    const hit = expected.filter((e) => predicted.includes(e));
    const falseAlarms = predicted.filter((p) => !expected.includes(p));
    const missed = expected.filter((e) => !predicted.includes(e));
    tp += hit.length; fp += falseAlarms.length; fn += missed.length;
    perExample.push({
      id: ex.id, split: ex.split, batch: ex.batch || 1, note: ex.note, expected, predicted,
      truePositives: hit, falseAlarms, missed,
      exactMatch: falseAlarms.length === 0 && missed.length === 0,
    });
  }

  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null;
  const clean = perExample.filter((p) => p.expected.length === 0);
  const falseAlarmExamples = clean.filter((p) => p.falseAlarms.length > 0);

  const byFamily = {};
  for (const p of perExample) {
    for (const fam of new Set([...p.expected, ...p.predicted])) {
      byFamily[fam] = byFamily[fam] || { tp: 0, fp: 0, fn: 0 };
      if (p.expected.includes(fam) && p.predicted.includes(fam)) byFamily[fam].tp += 1;
      else if (p.predicted.includes(fam)) byFamily[fam].fp += 1;
      else byFamily[fam].fn += 1;
    }
  }

  return {
    datasetVersion: DATASET_VERSION,
    mode: 'rule',
    split,
    batch,
    examples: examples.length,
    holdoutExamples: examples.filter((e) => e.split === 'holdout').length,
    cleanExamples: clean.length,
    metrics: {
      truePositives: tp, falsePositives: fp, falseNegatives: fn,
      precision: precision === null ? null : Number(precision.toFixed(3)),
      recall: recall === null ? null : Number(recall.toFixed(3)),
      f1: f1 === null ? null : Number(f1.toFixed(3)),
      exactMatchRate: Number((perExample.filter((p) => p.exactMatch).length / perExample.length).toFixed(3)),
      falseAlarmExamples: falseAlarmExamples.length,
      falseAlarmRateOnClean: clean.length ? Number((falseAlarmExamples.length / clean.length).toFixed(3)) : null,
      missedTotal: fn,
    },
    byFamily: Object.fromEntries(Object.entries(byFamily).map(([k, v]) => [k, { ...v, label: FAMILIES[k] || k }])),
    perExample,
  };
}

export const LIMITATIONS = [
  'Batch 1 (E01-E27) was used during development, so its scores are optimistic. Batch 2 (E28-E37) was written after the rules were frozen and is the honest measurement. Always read the batch-2 line first.',
  'The dataset is hand-written for the fictional demo brand and is small (37 examples). It is not a representative sample of real marketing copy.',
  'Labels are at rule-family level, not exact character spans, so precision/recall measure "did the checker find the right kind of issue", not perfect sentence alignment.',
  'The expected labels were written by the same author as the rules, which can inflate scores. Held-out examples reduce but do not remove this bias.',
  'Only the deterministic rule engine is scored. AI-assisted mode cannot be scored here because no external AI provider was configured in this environment.',
  'False alarms are counted per rule family per example, so a single example with two wrong families counts as two false positives.',
];
