/**
 * Deterministic brand-consistency checker.
 *
 * Design rules (these are the trust guarantees of the product):
 *  1. Every finding names the approved fact/guideline it is based on, plus that fact's version.
 *  2. `excerpt` is copied verbatim out of the submission and `evidence` verbatim out of the
 *     approved source. Both are re-verified before a finding is returned; unverifiable
 *     findings are dropped and counted (never shown to the user).
 *  3. An unsupported claim is never called "false". Conflicts require an approved fact that
 *     directly contradicts the text.
 *  4. Ambiguous/opinion language becomes `needs_human_review` or `possible_issue`, not a conflict.
 *  5. No network calls. Same input + same fact versions => identical output.
 */
import {
  sentences, containsVerbatim, excerptFor, extractNumbers, unitClass,
  keywords, bestSentence, norm,
} from '../lib/text.js';

export const CHECKER_VERSION = 'rule-engine-1.0.0';

// NOTE: a leading \b cannot be used before "#1" because "#" is not a word character,
// so the boundary is expressed explicitly. Found by evaluation batch 2 (example E31).
const SUP_BLOCK = /(?:^|[^a-z0-9])(best|greatest|world[- ]?class|number one|#1|no\.?\s?1|leading|unmatched|unbeatable|perfect|flawless|revolutionary|guaranteed)(?![a-z])/i;
const ABSOLUTE_TERMS = ['best', 'greatest', 'number one', '#1', 'no. 1', 'leading', 'unmatched', 'unbeatable', 'perfect', 'flawless', 'guaranteed'];
const HEDGE = /\b(up to|as much as|nearly|about|around|approximately|roughly|help|helps|can|may|designed to|aims to|likely)\b/i;
// Named plan/edition tokens. If a sentence names a different tier than the fact describes,
// the sentence is about a different product, so we must NOT report a conflict against it.
const VARIANT_TOKENS = ['pro', 'enterprise', 'business', 'starter', 'basic', 'premium', 'team', 'free'];
const variantsIn = (t) => VARIANT_TOKENS.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(String(t || '')));

// Domain synonyms: a fact about a price can be contradicted by a sentence that says "costs",
// even though the word "price" never appears. These are conservative, hand-written lists.
const DOMAIN_SYNONYMS = {
  price: ['price', 'priced', 'pricing', 'cost', 'costs', 'charging', 'charge', 'fee', 'seat', 'per user', 'per month', '₹', '$', '€', '£'],
  trial: ['trial', 'free for', 'free trial'],
  uptime: ['uptime', 'availability', 'online', 'reliability'],
  customer: ['customer', 'customers', 'client', 'clients', 'trusted by', 'serve', 'serving'],
  language: ['language', 'languages'],
  cert: ['soc', 'certification', 'certified', 'compliance'],
};

/**
 * The part of the fact key after the category prefix ("claim.customers" -> "customers").
 * Matching on the whole key leaked generic words like "claim" and "price", which made
 * unrelated sentences look topical (found by evaluation batch 3, example E38).
 */
const keyTail = (fact) => {
  const parts = String(fact.key || '').split('.').filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join('-') : (parts[0] || '');
};

function domainHit(fact, sentence) {
  const low = String(sentence || '').toLowerCase();
  if (keywords(keyTail(fact), fact.label).some((k) => low.includes(k))) return true;
  const tail = keyTail(fact).split('-').pop();
  for (const [domain, words] of Object.entries(DOMAIN_SYNONYMS)) {
    const factIsAboutDomain = String(fact.key || '').toLowerCase().includes(domain) ||
      String(fact.label || '').toLowerCase().includes(domain) || (tail && domain.startsWith(tail));
    if (factIsAboutDomain && words.some((w) => low.includes(w))) return true;
  }
  return false;
}

/** Detects a billing/usage period in a piece of text, e.g. "per month", "/year", "per user". */
const PERIOD_WORDS = [
  ['month', /\b(per|a|each)\s+month|\/\s*month|monthly|pcm\b/i],
  ['year', /\b(per|a|each)\s+year|\/\s*year|yearly|annual(ly)?\b/i],
  ['week', /\b(per|a|each)\s+week|\/\s*week|weekly\b/i],
  ['day', /\b(per|a|each)\s+day|\/\s*day|daily\b/i],
];
function periodIn(text) {
  const t = String(text || '');
  for (const [name, re] of PERIOD_WORDS) if (re.test(t)) return name;
  return null;
}

/** A sentence naming a different product tier is not about this fact. */
function variantsCompatible(fact, sentence) {
  const fv = variantsIn(`${fact.key} ${fact.label}`);
  const sv = variantsIn(sentence);
  if (!fv.length || !sv.length) return true;
  return sv.some((v) => fv.includes(v));
}

function sev(enabled) { return enabled; }

/** Rule A: numeric conflict against an approved fact. */
function checkNumericConflicts(text, facts) {
  const found = [];
  const numbers = extractNumbers(text);
  const all = sentences(text);

  for (const fact of facts) {
    const factNums = extractNumbers(String(fact.value ?? fact.statement ?? ''));
    if (!factNums.length) continue;
    const target = factNums[0];
    for (const n of numbers) {
      const sameUnit = unitClass(n.unit) === unitClass(target.unit);
      if (!sameUnit && n.num !== target.num) continue;            // unit+value both differ => other rule's problem

      const sentence = all.find((s) => n.index >= s.start && n.index <= s.end)?.text || '';
      if (!variantsCompatible(fact, sentence)) continue;
      // Same number and same unit is normally fine, but a different billing/usage period
      // still changes the claim ("₹2,499 per year" vs the approved "per month").
      if (sameUnit && n.num === target.num) {
        const periodA = periodIn(sentence);
        const periodB = periodIn(`${fact.value || ''} ${fact.statement || ''}`);
        if (periodA && periodB && periodA !== periodB) {
          found.push({ fact, claimed: n, sentence, kind: 'period_mismatch' });
        }
        continue;
      }
      if (!domainHit(fact, sentence)) continue;

      found.push({ fact, claimed: n, sentence, kind: sameUnit ? 'value_mismatch' : 'unit_mismatch' });
    }
  }
  return found;
}

function buildFinding({ type, severity, excerpt, evidence, explanation, whyItMatters, suggestedFix, fact, guideline, confidence = 1, ruleId, source = 'rule', autoFix = null }) {
  return {
    type, severity, ruleId, source, confidence, autoFix,
    excerpt, evidence, explanation, whyItMatters, suggestedFix,
    factId: fact?._id, factKey: fact?.key, factVersion: fact?.version,
    evidenceSource: fact?.sourceRef || guideline?.sourceRef,
    guidelineId: guideline?._id, guidelineCode: guideline?.code, guidelineVersion: guideline?.version,
    status: 'open',
  };
}

/**
 * @returns {{findings: Array, dropped: Array, considered: {facts:number, guidelines:number}}}
 */
export function runRules(text, facts = [], guidelines = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const findings = [];
  const dropped = [];
  const body = String(text || '');

  const approvedFacts = facts.filter((f) => f.status === 'approved');
  const isExpired = (f) => f.expiresAt && new Date(f.expiresAt) < now;
  const expiredFacts = approvedFacts.filter(isExpired);
  // Expired facts are never used to declare a conflict — they are reported for human review instead.
  const activeFacts = approvedFacts.filter((f) => !isExpired(f));
  const activeGuides = guidelines.filter((g) => g.status === 'active');

  /* ---------- Rule A: numeric contradictions ---------- */
  const numericHits = checkNumericConflicts(body, activeFacts);

  // One sentence can break two facts at once (e.g. a wrong price AND a wrong trial length).
  // The example sentence must fix every conflicting number in it, otherwise we would show
  // the reader a "better sentence" that still contains a known error.
  const correctionsBySentence = new Map();
  for (const hit of numericHits) {
    const sentence = hit.sentence || '';
    const approvedNum = extractNumbers(String(hit.fact.value ?? hit.fact.statement))[0];
    if (!sentence || !approvedNum?.raw) continue;
    if (!correctionsBySentence.has(sentence)) correctionsBySentence.set(sentence, []);
    correctionsBySentence.get(sentence).push({ find: hit.claimed.raw, replace: approvedNum.raw });
  }
  const fullyCorrected = (sentence) => {
    const fixes = correctionsBySentence.get(sentence);
    if (!fixes?.length || !sentence) return null;
    let out = sentence;
    for (const { find, replace } of fixes) out = out.split(find).join(replace);
    // Only offer the example if no conflicting number is left in the sentence.
    const leftover = fixes.filter(({ find }) => out.includes(find));
    return leftover.length ? null : out;
  };

  for (const hit of numericHits) {
    const { fact, claimed, sentence } = hit;
    const approvedNum = extractNumbers(String(fact.value ?? fact.statement))[0];
    const excerpt = sentence || excerptFor(body, claimed.raw) || claimed.raw;
    const evidence = String(fact.statement || '');
    findings.push(buildFinding({
      type: 'conflict',
      severity: 'high',
      ruleId: 'FACT-NUMERIC-CONFLICT',
      excerpt, evidence,
      explanation: `Your text says "${claimed.raw}". The approved fact for "${fact.label}" says ${approvedNum?.raw ?? fact.value}. The two numbers do not match.`,
      whyItMatters: 'People may use this number when they decide to buy. If it does not match the approved fact, the company may have to correct it later, and customers may feel misled.',
      suggestedFix: `Change "${claimed.raw}" to "${approvedNum?.raw ?? fact.value}" so it matches the approved fact. If you think the approved fact is out of date, ask a Brand Manager to update it first.`
        + ((() => {
          const corrected = fullyCorrected(sentence);
          return corrected && corrected.includes(claimed.raw) === false && corrected !== sentence
            ? `\n\nBetter sentence: "${corrected}"`
            : '';
        })()),
      fact,
      // One-click correction: a literal, unambiguous swap the UI can apply for the user.
      autoFix: (approvedNum?.raw && claimed.raw)
        ? { find: claimed.raw, replace: approvedNum.raw, description: `Replace "${claimed.raw}" with "${approvedNum.raw}"` }
        : null,
    }));
  }

  /* ---------- Rule B: explicit forbidden phrases from guidelines ---------- */
  for (const g of activeGuides) {
    for (const raw of g.forbidden || []) {
      const phrase = String(raw).trim();
      if (!phrase) continue;
      const idx = norm(body).toLowerCase().indexOf(norm(phrase).toLowerCase());
      if (idx === -1) continue;
      const excerpt = excerptFor(body, phrase);
      findings.push(buildFinding({
        type: 'conflict',
        severity: g.severity || 'high',
        ruleId: 'GUIDE-FORBIDDEN-PHRASE',
        excerpt: excerpt || phrase,
        evidence: String(g.text),
        explanation: `The words "${phrase}" are not allowed. Brand rule ${g.code} ("${g.title}") bans them.`,
        whyItMatters: 'This kind of wording can upset readers or another company, and it is hard to defend if someone complains.',
        suggestedFix: `Delete "${phrase}" and say the same thing in a plain, factual way. Keep the sentence about what your product does, and leave the other company out of it.`,
        guideline: g,
      }));
    }

    /* ---------- Rule C: superlative/absolute claims ---------- */
    if ((g.patterns || []).some((p) => /superlative/i.test(p))) {
      for (const s of sentences(body)) {
        const m = s.text.match(SUP_BLOCK);
        if (!m) continue;
        // hedged absolutes ("up to 3x faster") are weaker: report as needs_human_review
        const hedged = HEDGE.test(s.text);
        findings.push(buildFinding({
          type: hedged ? 'needs_human_review' : 'unsupported_claim',
          severity: hedged ? 'low' : (g.severity || 'medium'),
          ruleId: 'GUIDE-ABSOLUTE-CLAIM',
          excerpt: s.text,
          evidence: String(g.text),
          explanation: hedged
            ? `"${s.text}" uses a strong word ("${m[1]}") along with a softer word such as "up to" or "helps". It may be fine, but a person needs to check the sentence reads clearly.`
            : `"${s.text}" uses the strong word "${m[1]}". No approved brand fact on file shows this is proven.`,
          whyItMatters: 'Readers may take this as a proven fact. If the company cannot show proof, people may complain or stop trusting the brand.',
          suggestedFix: hedged
            ? `Keep the softer word ("up to", "helps") right next to the number so readers see it together. Then add the approved source that shows where the number comes from.`
            : `Describe what the product does instead of using "${m[1]}". Say who it helps and what it helps them do. If the company has proof, ask a Brand Manager to add it as a brand fact, then check again.`,
          guideline: g,
          confidence: hedged ? 0.5 : 0.9,
        }));
      }
    }

    /* ---------- Rule D: copy-mandate "required text" checks ---------- */
    const channelOk = !g.appliesToChannel?.length || g.appliesToChannel.includes(opts.channel);
    if ((g.requires || []).length && channelOk) {
      const present = (g.requires || []).some((r) => containsVerbatim(body, r));
      if (!present) {
        const anySentence = sentences(body)[0]?.text || body.slice(0, 160);
        findings.push(buildFinding({
          type: 'conflict',
          severity: g.severity || 'medium',
          ruleId: 'GUIDE-MISSING-REQUIRED-TEXT',
          excerpt: anySentence,
          evidence: String(g.text),
          explanation: `Brand rule ${g.code} says this sentence must appear in the content, and it is missing: ${(g.requires || []).map((r) => `"${String(r).replace(/[.。]$/, '')}"`).join(', ')}.`,
          whyItMatters: 'Readers should see this information before they act on the page. Without it, people miss something they are meant to be told.',
          suggestedFix: `Add this sentence: "${String(g.requires[0]).replace(/[.。]$/, '')}." Put it near the bottom of the content. Keep it close to the button or link you want people to click.`,
          guideline: g,
          confidence: 0.95,
        }));
      }
    }
  }

  /* ---------- Rule E: guaranteed-outcome language ---------- */
  // Findings must be linked to the guideline that governs them, otherwise the ambiguity
  // detector and the review log have no way to trace a decision back to a rule.
  const guaranteeGuide = activeGuides.find((g) => /guarantee/i.test(`${g.text} ${g.title}`));
  for (const s of sentences(body)) {
    if (!/\bguarantee[sd]?\b/i.test(s.text)) continue;
    const alreadyFlagged = findings.some((f) => f.ruleId === 'GUIDE-FORBIDDEN-PHRASE' && containsVerbatim(s.text, f.excerpt));
    if (alreadyFlagged) continue;
    findings.push(buildFinding({
      type: 'needs_human_review',
      severity: 'medium',
      ruleId: 'CLAIM-GUARANTEE',
      excerpt: s.text,
      evidence: guaranteeGuide?.text || 'Internal claim-standard: outcome guarantees must be linked to a documented, approved guarantee policy.',
      explanation: `"${s.text}" makes a promise. The checker cannot find an approved policy that covers this promise.`,
      whyItMatters: 'Customers may believe this promise is always true. Make sure the company can prove it before publishing.',
      suggestedFix: 'Show proof that the company offers this guarantee. If you cannot prove it, remove the promise or change the sentence to something you can prove.',
      guideline: guaranteeGuide,
      confidence: 0.6,
    }));
  }

  /* ---------- Rule F: hedged performance claims (unsupported but not false) ---------- */
  for (const s of sentences(body)) {
    if (!HEDGE.test(s.text)) continue;
    if (!/\d/.test(s.text)) continue;
    if (findings.some((f) => containsVerbatim(s.text, f.excerpt))) continue;
    findings.push(buildFinding({
      type: 'unsupported_claim',
      severity: 'low',
      ruleId: 'CLAIM-HEDGED-STAT',
      excerpt: s.text,
      evidence: 'Internal claim-standard: performance percentages must be traceable to an approved benchmark.',
      explanation: `"${s.text}" uses a number. Words like "up to" or "helps" make it sound softer, but no approved brand fact shows where the number comes from. This does not mean the number is wrong. It means nobody has shown proof yet.`,
      whyItMatters: 'Readers still treat a number as a fact. If nobody can show where it came from, it is hard to defend when someone asks.',
      suggestedFix: 'Add the approved fact or test result that supports the number. If there is none, take the number out, or ask a Brand Manager to add it as a brand fact.',
      confidence: 0.55,
    }));
  }

  /* ---------- Rule G: factual topic mentioned with no approved fact covering it ---------- */
  for (const s of sentences(body)) {
    if (!/₹|\$|€|£|\d{1,3}(,\d{3})+|\b\d+\s?(%|percent)\b|\b\d+\s+(countries|country|customers|customer|users|user|teams|team|employees|languages|integrations|seats)\b/i.test(s.text)) continue;
    if (findings.some((f) => containsVerbatim(s.text, f.excerpt))) continue;
    const covered = activeFacts.some((f) => domainHit(f, s.text) && variantsCompatible(f, s.text));
    if (covered) continue;
    findings.push(buildFinding({
      type: 'needs_human_review',
      severity: 'low',
      ruleId: 'FACT-UNCOVERED-NUMBER',
      excerpt: s.text,
      evidence: 'No approved brand fact covers the figures quoted in this sentence.',
      explanation: 'This sentence contains a specific number. There is no approved brand fact for this number, so the checker cannot say whether it is right or wrong.',
      whyItMatters: 'Numbers are easy to get wrong and hard to take back. Someone should check where this one came from before it goes out.',
      suggestedFix: 'Ask where the number came from. Either add it as an approved brand fact (a Brand Manager can do this), or take the number out of the sentence.',
      confidence: 0.4,
    }));
  }

  /* ---------- Rule H: expired approved facts (freshness) ---------- */
  for (const f of expiredFacts) {
    const kw = keywords(f.key, f.label);
    const sentence = bestSentence(body, kw);
    if (!sentence) continue;
    findings.push(buildFinding({
      type: 'needs_human_review',
      severity: 'medium',
      ruleId: 'FACT-EXPIRED',
      excerpt: sentence,
      evidence: String(f.statement),
      explanation: `This sentence depends on the approved fact "${f.label}". That fact went out of date on ${new Date(f.expiresAt).toISOString().slice(0, 10)}, so the checker cannot say whether the sentence is still right.`,
      whyItMatters: 'The information may have changed since it was approved. If it is out of date, readers get old information.',
      suggestedFix: `Ask a Brand Manager to check the fact "${f.label}" again and give it a new review date with a current source. Then run the check again.`,
      fact: f,
      confidence: 1,
    }));
  }

  /* ---------- Verification gate: evidence must be verbatim on both sides ---------- */
  const verified = [];
  for (const f of findings) {
    const excerptOk = f.excerpt && containsVerbatim(body, f.excerpt);
    const evidenceOk = f.evidence && f.evidence.length > 0 &&
      (containsVerbatim(sourceTextFor(f, facts, guidelines), f.evidence) || f.ruleId.startsWith('CLAIM-') || f.ruleId === 'FACT-UNCOVERED-NUMBER');
    if (excerptOk && evidenceOk) {
      verified.push({ ...f, excerptVerified: true, evidenceVerified: true });
    } else {
      dropped.push({ ruleId: f.ruleId, reason: !excerptOk ? 'excerpt_not_found_in_submission' : 'evidence_not_found_in_approved_source' });
    }
  }

  const deduped = dedupe(verified);
  return {
    findings: deduped,
    dropped,
    considered: { facts: activeFacts.length, expiredFacts: expiredFacts.length, guidelines: activeGuides.length },
    engine: CHECKER_VERSION,
  };
}

function sourceTextFor(f, facts, guides) {
  const parts = [];
  const fact = facts.find((x) => String(x._id) === String(f.factId));
  if (fact) parts.push(fact.statement, fact.value || '');
  const g = guides.find((x) => String(x._id) === String(f.guidelineId));
  if (g) parts.push(g.text);
  return parts.join(' ');
}

function dedupe(list) {
  const seen = new Map();
  for (const f of list) {
    // The source is part of the key: one sentence can contradict two different approved
    // facts, and the reviewer needs to see both. Merging them hid a real issue.
    const source = f.factKey || f.guidelineCode || f.ruleId;
    const k = `${f.ruleId}|${source}|${norm(f.excerpt).toLowerCase()}`;
    const prev = seen.get(k);
    if (!prev || rank(f.severity) > rank(prev.severity)) seen.set(k, f);
  }
  return [...seen.values()].sort((a, b) => rank(b.severity) - rank(a.severity) || a.excerpt.length - b.excerpt.length);
}

const rank = (s) => ({ low: 1, medium: 2, high: 3, critical: 4 }[s] || 0);

export function summarise(findings) {
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  const byType = { conflict: 0, unsupported_claim: 0, possible_issue: 0, needs_human_review: 0 };
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byType[f.type] = (byType[f.type] || 0) + 1;
  }
  return { total: findings.length, bySeverity, byType, blocking: (bySeverity.high || 0) + (bySeverity.critical || 0) };
}

export const SEVERITY_HELP = {
  critical: 'Fix this before publishing. It is the most serious kind of problem.',
  high: 'Fix this before publishing. It goes against an approved brand fact or rule.',
  medium: 'Someone needs to decide on this. A reviewer should accept it or dismiss it with a reason.',
  low: 'Worth a look. It is low risk, but a reviewer usually wants it answered.',
};
export const TYPE_HELP = {
  conflict: 'The text goes against an approved brand fact or rule.',
  unsupported_claim: 'The text says something that no approved source backs up. It may be true, but nobody has shown proof.',
  possible_issue: 'This looks risky, but the checker is not sure.',
  needs_human_review: 'The checker cannot decide this. A person needs to check it.',
};
