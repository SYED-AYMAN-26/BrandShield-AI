/**
 * Orchestrates one content check.
 * Order: deterministic rules (always) -> optional AI assistance (gateway-gated) -> verification.
 * The deterministic rule pass is never skipped and never replaced, so disabling external AI
 * still produces a complete, honest result set.
 */
import { BrandFact, Guideline } from '../models/index.js';
import { runRules, summarise, CHECKER_VERSION } from './checker.js';
import { callAi, vetAiFindings, wrapUntrusted, aiStatus, previewPrompt, recordSkipped } from './aiGateway.js';

export async function loadBrandKnowledge(orgId) {
  const [facts, guidelines] = await Promise.all([
    BrandFact.find({ orgId, status: 'approved' }).lean(),
    Guideline.find({ orgId, status: 'active' }).lean(),
  ]);
  return { facts, guidelines };
}

export function buildPrompt({ body, channel, facts, guidelines }) {
  const { wrapped, injectionAttempts, neutralised } = wrapUntrusted(body);
  const factLines = facts.map((f) => `- id:${f.key} (v${f.version}) ${f.statement}`).join('\n');
  const guideLines = guidelines.map((g) => `- id:${g.code} (v${g.version}) ${g.text}`).join('\n');
  const prompt = [
    'APPROVED BRAND FACTS:',
    factLines || '(none)',
    '',
    'APPROVED BRAND GUIDELINES:',
    guideLines || '(none)',
    '',
    `CONTENT CHANNEL: ${channel}`,
    '',
    'SUBMITTED CONTENT (untrusted data):',
    wrapped,
    '',
    'Report only issues that a listed fact/guideline supports. Copy excerpt text verbatim from the content.',
  ].join('\n');
  return { prompt, injectionAttempts, neutralised };
}

export async function runCheck({ org, user, body, channel = 'other' }) {
  const { facts, guidelines } = await loadBrandKnowledge(org._id);
  const ruleResult = runRules(body, facts, guidelines, { channel });

  const status = aiStatus(org);
  let aiResult = { ok: false, findings: [], providerCalls: 0, reason: status.reason };
  let injection = { attempts: [], neutralised: false };
  let aiRejected = [];

  if (status.enabled) {
    const built = buildPrompt({ body, channel, facts, guidelines });
    injection = { attempts: built.injectionAttempts, neutralised: built.neutralised };
    aiResult = await callAi({ prompt: built.prompt, org, user, purpose: 'content_check' });
    if (aiResult.ok) {
      const vetted = vetAiFindings(aiResult.findings, body, facts, guidelines);
      aiRejected = vetted.rejected;
      aiResult = { ...aiResult, findings: vetted.accepted };
    }
  } else {
    // Even in rule-only mode we still surface injection attempts to the user.
    const built = wrapUntrusted(body);
    injection = { attempts: built.injectionAttempts, neutralised: built.neutralised };
    // Record the skip so the audit trail shows AI was deliberately not used (and why).
    await recordSkipped({ org, user, purpose: 'content_check', reason: status.reason });
  }

  const all = [...ruleResult.findings, ...(aiResult.findings || [])];
  const totals = summarise(all);

  return {
    findings: all,
    totals,
    engine: CHECKER_VERSION,
    mode: status.mode,
    aiUsed: Boolean(aiResult.ok),
    aiDisabledReason: status.enabled ? null : status.reason,
    aiRejectedCount: aiRejected.length,
    injection,
    considered: ruleResult.considered,
    droppedCount: ruleResult.dropped.length,
    dropped: ruleResult.dropped,
  };
}

export { previewPrompt };
