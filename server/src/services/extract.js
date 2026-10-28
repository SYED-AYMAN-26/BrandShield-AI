/**
 * Text extraction for pasted text, TXT, PDF, DOCX, images (OCR) and public URLs.
 *
 * Safety notes:
 *  - Uploads are size-limited and type-checked by BOTH extension and magic bytes.
 *  - Extracted text is treated as untrusted input everywhere downstream.
 *  - URL fetching is SSRF-guarded: scheme allowlist, DNS resolution + private-range blocking,
 *    no embedded credentials, port allowlist, manual redirect handling with re-validation,
 *    streamed size cap and a hard timeout.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config.js';
import { AppError, badRequest } from '../lib/http.js';

/* ------------------------------------------------------------------ */
/* SSRF protection                                                     */
/* ------------------------------------------------------------------ */

const PRIVATE_V4 = [
  ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['0.0.0.0', 8], ['100.64.0.0', 10], ['192.0.0.0', 24],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const v = ipv4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (v & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true;   // link-local + unique-local
    if (l.startsWith('::ffff:')) return isPrivateIp(l.replace('::ffff:', ''));           // v4-mapped
    return false;
  }
  return true; // unknown => treat as unsafe
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

export async function assertSafeUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '').trim()); }
  catch { throw badRequest('That does not look like a web address. Use the full address, e.g. https://example.com/page.'); }

  if (!/^https?:$/.test(u.protocol)) throw badRequest('Only http and https web addresses are supported.');
  if (u.username || u.password) throw badRequest('Web addresses containing a username or password are not allowed.');
  if (u.port && !ALLOWED_PORTS.has(Number(u.port))) throw badRequest(`Port ${u.port} is not allowed. Use 80, 443, 8080 or 8443.`);
  if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.internal')) {
    throw badRequest('Internal or local addresses cannot be fetched.');
  }

  if (net.isIP(u.hostname)) {
    if (isPrivateIp(u.hostname) && !config.allowPrivateUrlTargets) {
      throw badRequest('That address is on a private network, so it cannot be fetched.');
    }
    return u;
  }

  let records;
  try { records = await dns.lookup(u.hostname, { all: true, verbatim: true }); }
  catch { throw badRequest('That website could not be found. Check the address and try again.'); }

  const bad = records.filter((r) => isPrivateIp(r.address));
  if (bad.length && !config.allowPrivateUrlTargets) {
    throw badRequest('That website resolves to a private network address, so it cannot be fetched.');
  }
  return u;
}

const TEXTY_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml', 'text/markdown'];

/** Fetches a public URL as plain text with SSRF guards, redirect re-validation and a size cap. */
export async function fetchPublicUrl(rawUrl, { maxRedirects = 3 } = {}) {
  let current = await assertSafeUrl(rawUrl);
  const warnings = [];

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.urlFetchTimeoutMs);
    let res;
    try {
      res = await fetch(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'BrandShieldBot/1.0 (+brand-content-checker)', accept: 'text/html,text/plain;q=0.9' },
      });
    } catch (e) {
      clearTimeout(timer);
      throw badRequest(e.name === 'AbortError'
        ? 'That website took too long to respond. Try again or paste the text instead.'
        : 'That website could not be reached. Try again or paste the text instead.');
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw badRequest('That website redirected without telling us where. Paste the text instead.');
      if (hop === maxRedirects) throw badRequest('That website redirected too many times.');
      current = await assertSafeUrl(new URL(loc, current).href); // re-validate every hop
      continue;
    }
    if (!res.ok) throw badRequest(`That website returned an error (HTTP ${res.status}). Paste the text instead.`);

    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type && !TEXTY_TYPES.includes(type)) {
      throw badRequest(`That link is ${type}, which cannot be read as text. Upload the file instead.`);
    }

    // Stream with a hard cap so a huge page cannot exhaust memory.
    const chunks = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) throw badRequest('That website returned no readable content.');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > config.urlFetchMaxBytes) {
        await reader.cancel().catch(() => {});
        warnings.push(`Page was larger than ${Math.round(config.urlFetchMaxBytes / 1024)} KB and was truncated.`);
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    const text = htmlToText(html);
    if (!text.trim()) throw badRequest('No readable text was found on that page. It may need JavaScript to load.');
    return { text, finalUrl: current.href, bytes: total, truncated: warnings.length > 0, warnings };
  }
  throw badRequest('That website redirected too many times.');
}

export function htmlToText(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

const MAGIC = {
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  docx: (b) => b[0] === 0x50 && b[1] === 0x4b, // PK zip container
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(8, 12).toString('latin1') === 'WEBP',
  gif: (b) => b.subarray(0, 3).toString('latin1') === 'GIF',
  txt: () => true,
};

export function detectFileKind(filename = '', buffer) {
  const ext = String(filename).toLowerCase().split('.').pop();
  if (ext === 'pdf') return MAGIC.pdf(buffer) ? 'pdf' : null;
  if (ext === 'docx') return MAGIC.docx(buffer) ? 'docx' : null;
  if (ext === 'doc') return 'unsupported_doc'; // legacy binary .doc is intentionally not parsed
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const k = ext === 'jpeg' ? 'jpg' : ext;
    return MAGIC[k](buffer) ? `image:${k}` : null;
  }
  if (['txt', 'md'].includes(ext)) return 'txt';
  return null;
}

export async function extractFromUpload({ filename, buffer }) {
  if (!buffer?.length) throw badRequest('The file is empty.');
  if (buffer.length > config.uploadMaxBytes) {
    throw badRequest(`That file is larger than ${Math.round(config.uploadMaxBytes / 1024 / 1024)} MB.`);
  }
  const kind = detectFileKind(filename, buffer);
  if (!kind) {
    if (String(filename).toLowerCase().endsWith('.doc')) {
      throw badRequest('Legacy .doc files are not supported. Save as .docx or PDF and try again.');
    }
    throw badRequest('That file type is not supported. Upload a PDF, DOCX, PNG, JPG or TXT file.');
  }

  if (kind === 'txt') {
    const text = buffer.toString('utf8');
    if (!text.trim()) throw badRequest('That file contains no readable text.');
    return { kind, text, warnings: [] };
  }

  if (kind === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
    let out = '';
    const warnings = [];
    const maxPages = Math.min(doc.numPages, 40);
    for (let p = 1; p <= maxPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += `${content.items.map((i) => i.str).join(' ')}\n\n`;
    }
    if (doc.numPages > maxPages) warnings.push(`Only the first ${maxPages} pages were read.`);
    if (!out.trim()) warnings.push('No selectable text found. This PDF may be a scan — try a screenshot instead.');
    return { kind, text: out.trim(), warnings, pages: doc.numPages };
  }

  if (kind === 'docx') {
    const mammoth = (await import('mammoth')).default;
    const { value, messages } = await mammoth.extractRawText({ buffer });
    const warnings = messages.filter((m) => m.type === 'warning').slice(0, 5).map((m) => m.message);
    if (!value.trim()) throw badRequest('That document contains no readable text.');
    return { kind, text: value.trim(), warnings };
  }

  if (kind.startsWith('image:')) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });
    try {
      const { data } = await worker.recognize(buffer);
      const text = (data?.text || '').trim();
      const warnings = [];
      if (typeof data?.confidence === 'number' && data.confidence < 60) {
        warnings.push(`OCR confidence was low (${Math.round(data.confidence)}%). Please check the extracted text carefully.`);
      }
      if (!text) throw badRequest('No text could be read from that image. Try a clearer screenshot.');
      return { kind, text, warnings, confidence: data?.confidence };
    } finally { await worker.terminate().catch(() => {}); }
  }

  throw new AppError(400, 'Unsupported file.');
}
