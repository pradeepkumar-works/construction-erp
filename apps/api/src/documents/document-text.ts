/**
 * Ask the contract (AI item 75): reading a PDF's text page by page, and turning a question into a Postgres full-text
 * query. Pure functions apart from the PDF reader, so they are tested without a database or a model
 * (src/scripts/contract-search-test.ts).
 */

/** Pages read from one PDF at most; a longer file is read up to here. */
export const MAX_PDF_PAGES = 500;
/** Files larger than this are not read (bytes). */
export const MAX_PDF_BYTES = 30 * 1024 * 1024;

interface TextItem {
  str?: string;
  hasEOL?: boolean;
}

/** Stands in for the browser's DOMMatrix, which pdf.js needs to load but not to read text. */
class TextOnlyMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  constructor(init?: ArrayLike<number>) {
    if (init?.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(init);
  }
  multiplySelf() { return this; }
  preMultiplySelf() { return this; }
  scaleSelf() { return this; }
  translateSelf() { return this; }
  invertSelf() { return this; }
  multiply() { return this; }
  scale() { return this; }
  translate() { return this; }
  inverse() { return this; }
}

type PdfJs = { getDocument(src: object): { promise: Promise<PdfDoc> } };
type PdfDoc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; cleanup(): void }>; destroy(): Promise<void> };
let pdfjsLoad: Promise<PdfJs> | null = null;

/**
 * pdf.js' legacy build, which runs in Node. It is an ES module: Node 22.12 and later require it, earlier versions
 * import it. The worker runs in this thread; the literal requires also let the deploy's file tracing find both files.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsLoad ??= (async () => {
    const g = globalThis as { pdfjsWorker?: unknown; DOMMatrix?: unknown };
    // pdf.js makes a DOMMatrix when it loads and takes one from @napi-rs/canvas when Node has none, but the deploy
    // leaves that native package out. Reading text never draws, so an identity matrix that ignores changes will do.
    g.DOMMatrix ??= TextOnlyMatrix;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs') as PdfJs;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      g.pdfjsWorker ??= require('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return pdfjs;
    } catch (e) {
      if ((e as { code?: string }).code !== 'ERR_REQUIRE_ESM') throw e;
      // A real import(), which TypeScript would otherwise turn into require().
      const load = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
      g.pdfjsWorker ??= await load('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return (await load('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJs;
    }
  })().catch((e) => {
    pdfjsLoad = null;
    throw e;
  });
  return pdfjsLoad;
}

/** The text of each page of a PDF, in order (an empty string for a page with no text, such as a scan). */
export async function readPdfPages(data: Uint8Array, maxPages = MAX_PDF_PAGES): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageText(content.items as TextItem[]));
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

/** pdf.js text items as lines: a line break where the item ends a line, words split at a line-end hyphen joined. */
export function pageText(items: TextItem[]): string {
  const raw = items.map((i) => `${i.str ?? ''}${i.hasEOL ? '\n' : ''}`).join('');
  return raw
    .replace(/(\w)-\n(\p{Ll})/gu, '$1$2')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Words a question uses for what a contract spells out, so "LD cap" finds "liquidated damages ... shall not exceed".
 * Keys are lower case words of the question; values are added to the search.
 */
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  ld: ['liquidated', 'damages', 'compensation', 'delay'],
  lds: ['liquidated', 'damages'],
  cap: ['maximum', 'exceed', 'limit'],
  capped: ['maximum', 'exceed'],
  pv: ['price', 'adjustment', 'escalation', 'variation'],
  escalation: ['price', 'adjustment', 'escalation'],
  variation: ['adjustment', 'escalation', 'deviation', 'change'],
  dlp: ['defects', 'liability', 'period'],
  defect: ['defects', 'liability'],
  bg: ['bank', 'guarantee'],
  eot: ['extension', 'time'],
  extension: ['extension', 'time'],
  row: ['right', 'way', 'encroachment'],
  land: ['right', 'way', 'row', 'encroachment', 'acquisition', 'handed', 'hindrance'],
  om: ['operation', 'maintenance'],
  sd: ['security', 'deposit'],
  pg: ['performance', 'guarantee', 'security'],
  mobilization: ['mobilisation'],
  mob: ['mobilisation', 'advance'],
  notify: ['notice', 'hindrance'],
  notified: ['notice'],
  pay: ['payment', 'paid'],
  paid: ['payment'],
  bill: ['payment', 'statement', 'running'],
  arbitrator: ['arbitration', 'arbitrator'],
  disputes: ['dispute', 'arbitration'],
  percentage: ['per', 'cent'],
  interest: ['interest', 'annum'],
  index: ['index', 'adjusted'],
  recovered: ['recovered', 'deducting', 'recovery'],
  hindrance: ['hindrance', 'notice'],
  encroachment: ['encroachment', 'hindrance'],
};

/** Words that carry no meaning in a question about a document. Postgres drops its own stop words as well. */
const QUESTION_WORDS = new Set([
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'we',
  'our', 'us', 'you', 'they', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'any', 'can', 'get', 'have',
  'has', 'must', 'much', 'many', 'long', 'there', 'this', 'that', 'it', 'its', 'be', 'by', 'at', 'up', 'as', 'with',
  'contract', 'agreement', 'clause', 'say', 'says', 'tell', 'me', 'about', 'per', 'whose', 'give', 'need', 'quickly',
  'happens', 'if', 'not',
]);

/** The words of a question worth searching for, with their synonyms: lower case, letters and digits only. */
export function searchWords(question: string): string[] {
  const words = (question.toLowerCase().replace(/o&m/g, 'om').match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? []).filter((w) => !QUESTION_WORDS.has(w) && (w.length > 1 || /\d/.test(w)));
  const out: string[] = [];
  for (const w of words) for (const x of [w, ...(SEARCH_SYNONYMS[w] ?? [])]) if (!out.includes(x)) out.push(x);
  return out.slice(0, 24);
}

/** A `to_tsquery('english', …)` text matching any of the words (ranked by how many and how close), or null. */
export function tsQueryText(question: string): string | null {
  const words = searchWords(question);
  return words.length ? words.join(' | ') : null;
}

/**
 * Up to `max` characters of a page around where the question's words are thickest, cut at line ends, with "…" where
 * text was left out. A short page is returned whole.
 */
export function excerpt(text: string, question: string, max = 2400): string {
  if (text.length <= max) return text;
  const words = searchWords(question).filter((w) => w.length > 2);
  const lower = text.toLowerCase();
  const hits: number[] = [];
  for (const w of words) for (let i = lower.indexOf(w); i >= 0 && hits.length < 400; i = lower.indexOf(w, i + w.length)) hits.push(i);
  let best = 0;
  let bestCount = -1;
  for (const h of hits) {
    const start = Math.max(0, h - max / 3);
    const count = hits.filter((x) => x >= start && x < start + max).length;
    if (count > bestCount) [best, bestCount] = [start, count];
  }
  let start = best === 0 ? 0 : text.lastIndexOf('\n', best) + 1;
  if (start < 0) start = 0;
  let end = Math.min(text.length, start + max);
  if (end < text.length) {
    const cut = text.lastIndexOf('\n', end);
    if (cut > start + max / 2) end = cut;
  }
  return `${start > 0 ? '… ' : ''}${text.slice(start, end).trim()}${end < text.length ? ' …' : ''}`;
}

/** Quotation marks around a passage in an answer: straight or curly double quotes. */
const QUOTE = /["“]([^"”\n]{20,400})["”]/g;
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9%.']+/g, ' ').trim();

/**
 * Quoted passages in an answer that are not in the text the tools returned (ignoring case, punctuation and line
 * breaks; "…" inside a quote splits it into parts that must each be found). An answer may quote only what it read.
 */
export function unverifiedQuotes(answer: string, sourceTexts: string[]): string[] {
  const haystack = norm(sourceTexts.join(' \n '));
  const out: string[] = [];
  for (const m of answer.matchAll(QUOTE)) {
    const parts = m[1].split(/…|\.\.\./).map(norm).filter((p) => p.length >= 8);
    if (parts.some((p) => !haystack.includes(p))) out.push(`“${m[1].trim()}”`);
  }
  return out.slice(0, 5);
}
