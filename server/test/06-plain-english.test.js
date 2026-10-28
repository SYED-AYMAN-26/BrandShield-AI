/**
 * Guards the plain-English rule for AI-generated checking text.
 *
 * Requirement: "Why it matters" and "How to fix it" must use short, everyday sentences,
 * avoid jargon, never call a claim false just because proof is missing, and offer a
 * practical example sentence where possible.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runRules, SEVERITY_HELP, TYPE_HELP } from '../src/services/checker.js';
import { DEMO_FACTS, DEMO_GUIDELINES, SAMPLE_CONTENT_BAD } from '../src/lib/demoBrand.js';

const facts = DEMO_FACTS.map((f, i) => ({ ...f, _id: 'f' + i, version: 2, status: 'approved' }));
const guides = DEMO_GUIDELINES.map((g, i) => ({ ...g, _id: 'g' + i, version: 1, status: 'active' }));

/** Every finding the engine can produce, across several samples and channels. */
function allFindings() {
  const bodies = [
    SAMPLE_CONTENT_BAD,
    'Teams write up to 40% faster with Inkloom AI.',
    'Enterprise plans start at ₹9,999 per seat per month.',
    'We hold a SOC 2 Type II certification.',
    'Our drafts are better than Jasper.',
  ];
  const out = [];
  for (const body of bodies) {
    for (const channel of ['landing_page', 'email']) {
      out.push(...runRules(body, facts, guides, { channel }).findings);
    }
  }
  const byRule = new Map();
  for (const f of out) if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, f);
  return [...byRule.values()];
}

const BANNED_JARGON = [
  'compliance', 'mandated', 'legal obligation', 'superlative', 'traceable',
  'benchmark', 'disclosure', 'obligations', 'publishable', 'qualification',
  'contradicts', 'unverified', 'advertising complaints', 'guardrail',
];

const findJargon = (text) => BANNED_JARGON.filter((w) => String(text || '').toLowerCase().includes(w));

describe('plain-English checking text', () => {
  test('the engine produces findings for several different rules', () => {
    const found = allFindings();
    assert.ok(found.length >= 6, `expected several rule types, got ${found.length}`);
  });

  test('no jargon in "why it matters" or "how to fix it"', () => {
    for (const f of allFindings()) {
      const jargon = [...findJargon(f.whyItMatters), ...findJargon(f.suggestedFix)];
      assert.deepEqual(jargon, [], `jargon found in ${f.ruleId}: ${jargon.join(', ')}`);
    }
  });

  test('sentences are short: no wall of text', () => {
    for (const f of allFindings()) {
      for (const [label, text] of [['whyItMatters', f.whyItMatters], ['suggestedFix', f.suggestedFix]]) {
        const sentences = String(text).split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
        const longest = Math.max(...sentences.map((s) => s.split(/\s+/).length));
        assert.ok(longest <= 28, `${f.ruleId} ${label} has a ${longest}-word sentence`);
      }
    }
  });

  test('"how to fix it" always gives an action, not just a description', () => {
    for (const f of allFindings()) {
      assert.match(
        f.suggestedFix,
        /\b(change|add|delete|remove|ask|show|describe|take|say|keep|put|replace|check)\b/i,
        `${f.ruleId} fix gives no action`,
      );
    }
  });

  test('a claim is never called false or wrong just because proof is missing', () => {
    for (const f of allFindings()) {
      const text = `${f.explanation} ${f.whyItMatters} ${f.suggestedFix}`.toLowerCase();
      const sentences = text.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const accuses = /\bis false\b|\bis untrue\b|\bis a lie\b|\bis wrong\b|\bnot true\b/.test(sentence);
        if (!accuses) continue;
        // A sentence that explicitly denies falseness ("does not mean the number is wrong")
        // is the honest phrasing we want, so it must not be flagged.
        const negated = /\b(not|cannot|can't|never|no|whether)\b/.test(sentence);
        assert.ok(negated, `${f.ruleId} calls the claim false without proof: "${sentence.trim()}"`);
      }
    }
  });

  test('unsupported-but-maybe-true findings say proof is missing instead', () => {
    const hedged = allFindings().find((f) => f.ruleId === 'CLAIM-HEDGED-STAT');
    assert.ok(hedged, 'expected the hedged-stat finding');
    assert.match(hedged.explanation, /does not mean the number is wrong|proof/i);
  });

  test('the numeric conflict offers a concrete better sentence', () => {
    const numeric = allFindings().find((f) => f.ruleId === 'FACT-NUMERIC-CONFLICT');
    assert.ok(numeric);
    assert.match(numeric.suggestedFix, /Better sentence:/i);
    assert.match(numeric.suggestedFix, /₹2,499|99\.9%|8,400/, 'example must use the approved fact value');
  });

  test('the example sentence is built only from the approved fact, never a new number', () => {
    const numeric = allFindings().find((f) => f.ruleId === 'FACT-NUMERIC-CONFLICT');
    const example = numeric.suggestedFix.split('Better sentence:')[1] || '';
    assert.ok(example.includes('99.9%'), 'example must quote the approved value');
    assert.ok(!example.includes('99.99%'), 'example must not keep the rejected value');
  });

  test('a suggested example sentence never contains a number we flagged as wrong', () => {
    const body = 'Our Pro plan is just ₹1,999 per user per month, and every plan includes a 30 day free trial with no credit card.';
    const findings = runRules(body, facts, guides, { channel: 'landing_page' })
      .findings.filter((f) => f.ruleId === 'FACT-NUMERIC-CONFLICT');
    assert.ok(findings.length >= 2, 'this sentence breaks two facts at once');

    const rejected = findings.map((f) => f.autoFix?.find).filter(Boolean);
    for (const f of findings) {
      const example = (f.suggestedFix.split('Better sentence:')[1] || '').trim();
      assert.ok(example.length > 0, 'each conflict should offer an example');
      for (const bad of rejected) {
        assert.ok(!example.includes(bad), `example still contains the rejected value ${bad}: ${example}`);
      }
    }
    // And it must use the approved values instead.
    assert.match(findings[0].suggestedFix, /₹2,499/);
    assert.match(findings[0].suggestedFix, /14 day/);
  });

  test('findings still keep their meaning: severity, type and evidence are unchanged', () => {
    const f = allFindings().find((x) => x.ruleId === 'GUIDE-ABSOLUTE-CLAIM');
    assert.equal(f.severity, 'high');
    assert.equal(f.type, 'unsupported_claim');
    assert.ok(f.evidence.length > 0);
    assert.equal(f.evidenceVerified, true);
  });

  test('severity and type helpers shown in the UI are plain English too', () => {
    for (const [k, v] of Object.entries(SEVERITY_HELP)) {
      assert.deepEqual(findJargon(v), [], `jargon in severity help "${k}"`);
    }
    for (const [k, v] of Object.entries(TYPE_HELP)) {
      assert.deepEqual(findJargon(v), [], `jargon in type help "${k}"`);
    }
  });
});
