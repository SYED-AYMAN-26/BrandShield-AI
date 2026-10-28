/**
 * Guideline Ambiguity Detector.
 *
 * Two independent kinds of signal, both traceable to stored data:
 *  A. TEXT signals, computed from the guideline's own wording (vague qualifiers,
 *     multiple possible readings, no measurable criterion).
 *  B. OUTCOME signals, computed from real reviewer decisions recorded against findings
 *     created by that guideline. A high dismissal rate means reviewers keep disagreeing
 *     with the rule, which is evidence the rule is unclear or too broad.
 *
 * Nothing is invented. If a guideline has no decisions yet, the outcome signal is reported
 * as "no data" and carries zero weight — we never claim disagreement that did not happen.
 */
import { GuidelineSuggestion, Review, Content, Guideline } from '../models/index.js';

export const DETECTOR_VERSION = 'ambiguity-1.0.0';
const MIN_DECISIONS_FOR_SIGNAL = 3;

const VAGUE_TERMS = ['reasonable', 'appropriate', 'suitable', 'adequate', 'excessive', 'significant', 'generally', 'where possible', 'as needed', 'should consider', 'good practice', 'etc.', 'and/or', 'may include', 'similar', 'various'];
const ABSOLUTE_TERMS = ['must never', 'always', 'never', 'strictly', 'under no circumstances'];

export function textSignals(guideline) {
  const text = `${guideline.text || ''} ${guideline.title || ''}`.toLowerCase();
  const signals = [];

  const vague = VAGUE_TERMS.filter((t) => text.includes(t));
  if (vague.length) {
    signals.push({
      label: 'Vague wording',
      detail: `Guideline uses open-ended wording with no measurable test: ${vague.map((v) => `"${v}"`).join(', ')}.`,
      weight: Math.min(0.25 * vague.length, 0.5),
    });
  }

  if (!/\d/.test(guideline.text || '')) {
    signals.push({
      label: 'No measurable criterion',
      detail: 'The guideline contains no number, threshold or concrete example, so two reviewers can reasonably apply it differently.',
      weight: 0.2,
    });
  }

  const abs = ABSOLUTE_TERMS.filter((t) => text.includes(t));
  if (abs.length && vague.length) {
    signals.push({
      label: 'Conflicting strictness',
      detail: `Mixes absolute language (${abs.map((a) => `"${a}"`).join(', ')}) with vague qualifiers, which pulls reviewers in two directions.`,
      weight: 0.15,
    });
  }

  const words = (guideline.text || '').split(/\s+/).filter(Boolean).length;
  if (words > 60) {
    signals.push({ label: 'Long rule text', detail: `The rule is ${words} words long and covers several conditions in one sentence, which hurts consistent application.`, weight: 0.1 });
  }

  if (!(guideline.forbidden || []).length && !(guideline.patterns || []).length && !(guideline.requires || []).length) {
    signals.push({
      label: 'Not machine-checkable',
      detail: 'The guideline defines no example phrases or required text, so the checker can only report it for human review.',
      weight: 0.15,
    });
  }

  return signals;
}

/** Real disagreement data pulled from stored content findings + review decisions. */
export async function outcomeSignals(orgId, guidelineIds) {
  const contents = await Content.find({ orgId, 'findings.guidelineId': { $in: guidelineIds } })
    .select('findings title reviewId').lean();

  const byGuide = new Map();
  for (const c of contents) {
    for (const f of c.findings || []) {
      if (!f.guidelineId) continue;
      const key = String(f.guidelineId);
      if (!byGuide.has(key)) byGuide.set(key, { acceptances: 0, dismissals: 0, open: 0, evidence: [] });
      const bucket = byGuide.get(key);
      if (f.status === 'accepted') bucket.acceptances += 1;
      else if (f.status === 'dismissed') {
        bucket.dismissals += 1;
        bucket.evidence.push({
          reviewId: c.reviewId, findingId: f._id, action: 'dismissed',
          reason: f.decisionReason || '(no reason recorded)',
          byName: 'Reviewer', at: f.decidedAt,
        });
      } else if (f.status === 'open') bucket.open += 1;
    }
  }
  return byGuide;
}

export async function analyseGuideline(orgId, guideline, outcome) {
  const text = textSignals(guideline);
  const stats = outcome || { acceptances: 0, dismissals: 0, evidence: [] };
  const total = stats.acceptances + stats.dismissals;
  const dismissRate = total ? stats.dismissals / total : 0;
  const signals = [...text];

  if (total >= MIN_DECISIONS_FOR_SIGNAL) {
    if (dismissRate >= 0.4 && stats.dismissals >= 2) {
      signals.push({
        label: 'Reviewers keep dismissing this rule',
        detail: `${stats.dismissals} of ${total} recorded decisions dismissed findings from this guideline (${Math.round(dismissRate * 100)}% dismissal rate). Reviewers are applying the rule differently from the checker.`,
        weight: Math.min(0.5, dismissRate * 0.6),
      });
    } else if (dismissRate > 0) {
      signals.push({
        label: 'Some dismissals recorded',
        detail: `${stats.dismissals} of ${total} decisions dismissed findings from this guideline. Below the threshold for an ambiguity signal, but it is tracked.`,
        weight: 0.05,
      });
    }
  } else {
    signals.push({
      label: 'No decision data yet',
      detail: total === 0
        ? 'No reviewer has accepted or dismissed a finding from this guideline yet, so there is no disagreement data to analyse.'
        : `Only ${total} decision(s) recorded; at least ${MIN_DECISIONS_FOR_SIGNAL} are needed before dismissal rates are meaningful.`,
      weight: 0,
    });
  }

  const score = Math.min(1, signals.reduce((a, s) => a + (s.weight || 0), 0));
  return {
    guidelineId: guideline._id,
    code: guideline.code,
    title: guideline.title,
    currentText: guideline.text,
    version: guideline.version,
    score: Number(score.toFixed(2)),
    flagged: score >= 0.3,
    signals,
    stats: { acceptances: stats.acceptances, dismissals: stats.dismissals, totalDecisions: total, dismissRate: Number(dismissRate.toFixed(2)), openFindings: stats.open || 0 },
    decisionEvidence: stats.evidence.slice(0, 10),
    proposedText: proposeRewrite(guideline, signals),
    detectorVersion: DETECTOR_VERSION,
  };
}

/** A rewrite proposal built from the detected weaknesses. Always shown to a human for approval. */
function proposeRewrite(guideline, signals) {
  const adds = [];
  if (signals.some((s) => s.label === 'Vague wording')) adds.push('Replace vague words with one measurable test.');
  if (signals.some((s) => s.label === 'No measurable criterion')) adds.push('State the threshold explicitly, e.g. a number, a required phrase, or a list of examples.');
  if (signals.some((s) => s.label === 'Not machine-checkable')) adds.push('Add the exact example phrases the rule bans so the checker can enforce it.');
  if (signals.some((s) => s.label === 'Long rule text')) adds.push('Split this rule into one rule per condition.');
  if (signals.some((s) => s.label.startsWith('Reviewers keep dismissing'))) adds.push('Narrow the rule to the cases reviewers actually agree on, and move the rest to reviewer discretion.');
  return [
    guideline.text,
    '',
    'PROPOSED CLARIFICATION (suggested by the ambiguity detector — a Brand Manager must approve):',
    ...adds.map((a) => `• ${a}`),
  ].join('\n');
}

export async function refreshSuggestions(orgId) {
  const guidelines = await Guideline.find({ orgId, status: 'active' }).lean();
  const outcomes = await outcomeSignals(orgId, guidelines.map((g) => g._id));
  const results = [];
  for (const g of guidelines) {
    const analysis = await analyseGuideline(orgId, g, outcomes.get(String(g._id)));
    if (!analysis.flagged) { results.push({ ...analysis, savedId: null }); continue; }
    const existing = await GuidelineSuggestion.findOne({ orgId, guidelineId: g._id, status: 'open' });
    const doc = existing
      ? await GuidelineSuggestion.findByIdAndUpdate(existing._id, {
        signals: analysis.signals, stats: analysis.stats, decisionEvidence: analysis.decisionEvidence,
        proposedText: analysis.proposedText, detectorVersion: DETECTOR_VERSION,
      }, { new: true })
      : await GuidelineSuggestion.create({
        orgId, guidelineId: g._id, detectorVersion: DETECTOR_VERSION,
        signals: analysis.signals, stats: analysis.stats, decisionEvidence: analysis.decisionEvidence,
        proposedText: analysis.proposedText, status: 'open',
      });
    results.push({ ...analysis, savedId: doc._id });
  }
  return results;
}
