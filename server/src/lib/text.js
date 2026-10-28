import { createHash } from 'node:crypto';

/** Text utilities shared by the checker. Everything here is deterministic. */

export const norm = (s = '') => String(s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();

export function sentences(text = '') {
  const src = String(text).replace(/\r\n/g, '\n');
  const out = [];
  // A boundary is [.!?] followed by whitespace/end, NOT preceded by a digit (so 99.99% stays whole).
  const boundary = /(?<!\d)[.!?]+(?=\s|\n|$)/g;
  let start = 0;
  let m;
  while ((m = boundary.exec(src)) !== null) {
    const end = m.index + m[0].length;
    const raw = src.slice(start, end);
    if (raw.trim()) out.push({ text: raw.trim(), start, end });
    start = end;
  }
  if (start < src.length) {
    const raw = src.slice(start);
    if (raw.trim()) out.push({ text: raw.trim(), start, end: src.length });
  }
  return out;
}

/** True when `needle` appears verbatim (whitespace-insensitive) inside `haystack`. */
export function containsVerbatim(haystack = '', needle = '') {
  const h = norm(haystack).toLowerCase();
  const n = norm(needle).toLowerCase();
  if (!n) return false;
  return h.includes(n);
}

/** Returns the smallest sentence of `text` containing `needle`, or null. */
export function excerptFor(text, needle) {
  const target = norm(needle).toLowerCase();
  for (const s of sentences(text)) {
    if (norm(s.text).toLowerCase().includes(target)) return s.text;
  }
  return null;
}

const UNIT_WORDS = [
  'percent', 'users', 'user', 'customers', 'customer', 'companies', 'company', 'teams', 'team',
  'countries', 'country', 'languages', 'minutes', 'minute', 'seconds', 'second', 'hours', 'hour',
  'days', 'day', 'weeks', 'week', 'months', 'month', 'years', 'year',
  'x', 'times', 'million', 'billion', 'thousand', 'k',
];
const SINGULARISE = { users: 'user', customers: 'customer', companies: 'company', teams: 'team',
  countries: 'country', languages: 'language', minutes: 'minute', seconds: 'second', hours: 'hour',
  days: 'day', weeks: 'week', months: 'month', years: 'year', times: 'time' };

/** Extracts numeric claims with units, e.g. "99.99%", "$29", "₹2,499", "10,000 customers". */
export function extractNumbers(text = '') {
  const results = [];
  const src = String(text);
  const re = /(₹|\$|€|£|USD\s?|INR\s?)?\s?(\d[\d,]*(?:\.\d+)?)\s?(%|percent\b|(?:million|billion|thousand|k)\b)?/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [raw, cur, digits, pct] = m;
    if (!digits) continue;
    const num = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    let unit = null;
    if (pct) unit = pct.toLowerCase().replace('percent', '%');
    else if (cur) unit = cur.trim().toUpperCase().replace('USD', '$');
    // look ahead for a bare unit word ("10,000 customers")
    if (!unit) {
      const ahead = src.slice(m.index + raw.length, m.index + raw.length + 22).trim().toLowerCase();
      const w = UNIT_WORDS.find((u) => new RegExp(`^${u}\\b`).test(ahead));
      if (w) unit = w;
    }
    results.push({ raw: raw.trim(), num, unit, index: m.index });
  }
  return results;
}

/** Canonical unit class so "%"/"percent" compare, and "$"/"USD" compare. */
export function unitClass(unit) {
  if (!unit) return null;
  const u = String(unit).toLowerCase().replace('percent', '%');
  if (u === '%') return 'percent';
  if (['$', '€', '£', '₹', 'usd', 'inr'].includes(u)) return `currency:${u === '₹' ? 'inr' : u === '$' ? 'usd' : u}`;
  if (['million', 'billion', 'thousand', 'k'].includes(u)) return `magnitude:${u}`;
  return SINGULARISE[u] || u;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'our', 'your', 'with', 'is', 'are', 'be', 'we', 'it', 'that', 'this', 'by', 'at', 'as', 'per', 'all', 'any']);

export function keywords(...parts) {
  const words = parts.filter(Boolean).join(' ').toLowerCase().match(/[a-z0-9%$₹€£]+/g) || [];
  return [...new Set(words.filter((w) => w.length > 2 && !STOP.has(w)))];
}

/** Finds the sentence in `text` that mentions the most of `kws`. */
export function bestSentence(text, kws = []) {
  let best = null;
  let bestScore = 0;
  for (const s of sentences(text)) {
    const low = s.text.toLowerCase();
    const score = kws.reduce((acc, k) => acc + (low.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { best = s.text; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

export function sha256Hex(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}
