import { runRules } from '/home/user/brandshield/server/src/services/checker.js';
import { DEMO_FACTS, DEMO_GUIDELINES, SAMPLE_CONTENT_BAD } from '/home/user/brandshield/server/src/lib/demoBrand.js';

const facts = DEMO_FACTS.map((f, i) => ({ ...f, _id: 'f' + i, version: 2, status: 'approved' }));
const guides = DEMO_GUIDELINES.map((g, i) => ({ ...g, _id: 'g' + i, version: 1, status: 'active' }));

const extra = [
  'We hold a SOC 2 Type II certification.',
  'Teams write up to 40% faster with Inkloom AI.',
  'Enterprise plans start at ₹9,999 per seat per month.',
  'Our drafts are better than Jasper.',
];
const seen = new Map();
for (const body of [SAMPLE_CONTENT_BAD, ...extra]) {
  const r = runRules(body, facts, guides, { channel: 'landing_page' });
  for (const f of r.findings) if (!seen.has(f.ruleId)) seen.set(f.ruleId, f);
}
for (const [rule, f] of seen) {
  console.log('═'.repeat(78));
  console.log('RULE:', rule, '| severity:', f.severity, '| type:', f.type);
  console.log('SENTENCE   :', f.excerpt.slice(0, 100));
  console.log('EXPLAINS   :', f.explanation);
  console.log('WHY MATTERS:', f.whyItMatters);
  console.log('HOW TO FIX :', f.suggestedFix);
}
console.log('═'.repeat(78));
console.log('rules covered:', seen.size);
