/**
 * FICTIONAL demo brand: "Inkloom AI" is a made-up writing-assistant product.
 * Everything here is invented for the demo and is labelled isDemo:true everywhere it is stored.
 * No real company, price, statistic or case study is represented.
 */
export const DEMO_BRAND = 'Inkloom AI (fictional demo brand)';

const DAY = 24 * 60 * 60 * 1000;
const from = (days) => new Date(Date.now() + days * DAY);

export const DEMO_FACTS = [
  {
    key: 'price.pro', label: 'Pro plan price (monthly)', category: 'pricing',
    statement: 'The approved price of the Inkloom AI Pro plan is ₹2,499 per user per month, billed monthly.',
    value: '₹2,499 per user per month',
    aliases: ['₹2,499', 'INR 2,499'],
    sourceRef: 'Demo Brand Book §3 Pricing (fictional), page 12, approved 2026-08-01',
    effectiveFrom: from(-90), reviewBy: from(180), expiresAt: from(270),
  },
  {
    key: 'claim.uptime', label: 'Platform uptime commitment', category: 'claims',
    statement: 'Inkloom AI commits to an approved platform uptime of 99.9% measured monthly.',
    value: '99.9%',
    sourceRef: 'Demo Service Level Agreement (fictional) §2.1, approved 2026-07-15',
    effectiveFrom: from(-120), reviewBy: from(60), expiresAt: from(150),
  },
  {
    key: 'claim.free-trial', label: 'Free trial length', category: 'pricing',
    statement: 'The Inkloom AI free trial lasts 14 days and does not require a credit card.',
    value: '14 days',
    sourceRef: 'Demo Brand Book §3.2 Trials (fictional), approved 2026-08-01',
    effectiveFrom: from(-90), reviewBy: from(120),
  },
  {
    key: 'claim.customers', label: 'Number of customers', category: 'claims',
    statement: 'As of the approved Q2 2026 review, Inkloom AI has 8,400 customers.',
    value: '8,400 customers',
    sourceRef: 'Demo Quarterly Business Review Q2 2026 (fictional), approved 2026-07-01',
    effectiveFrom: from(-150), reviewBy: from(30), expiresAt: from(90),
  },
  {
    key: 'claim.languages', label: 'Supported languages', category: 'product',
    statement: 'Inkloom AI supports 12 languages for drafting and editing.',
    value: '12 languages',
    sourceRef: 'Demo Product Specification v4 (fictional), approved 2026-08-20',
    effectiveFrom: from(-80), reviewBy: from(200),
  },
  {
    // Deliberately expired so the freshness feature has real data to show.
    key: 'claim.security-cert', label: 'Security certification', category: 'security',
    statement: 'Inkloom AI holds a SOC 2 Type II certification.',
    value: 'SOC 2 Type II',
    sourceRef: 'Demo Security Page (fictional), approved 2025-09-01',
    effectiveFrom: from(-400), reviewBy: from(-20), expiresAt: from(-10),
    changeNote: 'Expired on purpose so Fact Freshness has something real to display.',
  },
];

export const DEMO_GUIDELINES = [
  {
    code: 'GL-SUP-01', title: 'No unsupported superlatives', category: 'claims', severity: 'high',
    text: 'Marketing content must not describe Inkloom AI as "the best", "number one", "#1", "world-class" or similar absolute superlatives unless an approved third-party benchmark is cited in the same paragraph.',
    sourceRef: 'Demo Brand Voice Guide §5.1 (fictional), approved 2026-08-01',
    patterns: ['superlative'], forbidden: [],
  },
  {
    code: 'GL-CMP-01', title: 'No competitor disparagement', category: 'claims', severity: 'critical',
    text: 'Content must not name or disparage a named competitor. Comparative statements must be factual, sourced and reviewed by legal.',
    sourceRef: 'Demo Legal Playbook §7 (fictional), approved 2026-06-10',
    patterns: [], forbidden: ['outdated than Grammarly', 'better than Jasper', 'crush the competition'],
  },
  {
    code: 'GL-DSC-01', title: 'AI disclosure on published pages', category: 'compliance', severity: 'medium',
    text: 'Any published landing page describing AI-generated output must include the sentence "Outputs are AI-generated and should be reviewed by a human." near the call to action.',
    sourceRef: 'Demo Compliance Policy §4.3 (fictional), approved 2026-05-02',
    patterns: [],
    requires: ['Outputs are AI-generated and should be reviewed by a human.'],
    appliesToChannel: ['landing_page'],
  },
  {
    code: 'GL-PRC-01', title: 'Prices must match the approved price list', category: 'pricing', severity: 'high',
    text: 'Any price quoted in marketing content must match the approved price list exactly, including currency, amount and billing period.',
    sourceRef: 'Demo Pricing Policy §1 (fictional), approved 2026-08-01',
    patterns: [], forbidden: [],
  },
  {
    code: 'GL-CLF-01', title: 'Guarantees need an approved policy', category: 'claims', severity: 'high',
    text: 'Words such as "guaranteed" may only be used when the sentence links to an approved guarantee policy.',
    sourceRef: 'Demo Legal Playbook §9 (fictional), approved 2026-06-10',
    patterns: [], forbidden: [],
  },
];

/** Sample marketing copy with exactly the issues we want the demo to surface. */
export const SAMPLE_CONTENT_BAD = `Meet Inkloom AI — the best writing assistant for busy marketing teams.

Our Pro plan is just ₹1,999 per user per month, and every plan includes a 30 day free trial with no credit card.

We are trusted by 12,000 customers in 40 countries, and we guarantee you will cut drafting time in half.

Inkloom AI keeps your work online with 99.99% uptime, and it is clearly outdated than Grammarly.

Start your trial today.`;

export const SAMPLE_CONTENT_FIXED = `Meet Inkloom AI, a fast writing assistant for busy marketing teams.

Our Pro plan is ₹2,499 per user per month, and every plan includes a 14 day free trial with no credit card.

We are trusted by 8,400 customers, and customers report they save time on drafting in our published benchmark.

Inkloom AI keeps your work online with 99.9% uptime.

Start your trial today. Outputs are AI-generated and should be reviewed by a human.`;

export const DEMO_USERS = [
  { name: 'Aarav Menon', email: 'creator@demo.inkloom.test', role: 'creator' },
  { name: 'Priya Raghavan', email: 'reviewer@demo.inkloom.test', role: 'reviewer' },
  { name: 'Daniel Ortiz', email: 'approver@demo.inkloom.test', role: 'approver' },
  { name: 'Meera Iyer', email: 'brand@demo.inkloom.test', role: 'brand_manager' },
];
export const DEMO_PASSWORD = 'DemoPass!2026';
