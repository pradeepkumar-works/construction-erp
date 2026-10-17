/**
 * Grades reading invoices, challans and drawings (AI item 70) on the test pack (scripts/doc-read-pack.ts) through a
 * running API, as admin@demo.com: GSTIN, invoice or challan number and totals (pass bar 98%), line items (90%),
 * drawing number and revision, and matching to the demo vendor and order. Each read costs a model call, so run it
 * against a deployment with the real model:
 *
 *   DOC_READ_API=https://nirmaan-api.cogitrex.ai/api npx tsx scripts/doc-read-eval.ts [--only inv-01,dc-03] [--report file.md]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocReadField, DocReadResultDto } from '@erp/shared';
import { itemSimilarity } from '@erp/shared';
import { PACK, type ChallanDoc, type DrawingDoc, type InvoiceDoc, type PackDoc, invoiceTotals, renderPack, vendorOf } from './doc-read-pack';

const API = process.env.DOC_READ_API ?? 'http://localhost:4000/api';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
const packDir = join(__dirname, '.doc-read-pack');

interface Grade {
  group: 'gstin' | 'number' | 'date' | 'totals' | 'line' | 'drawing' | 'vendor' | 'order';
  name: string;
  ok: boolean;
  /** A wrong value the reading did not mark for checking: the case that costs money */
  silent?: boolean;
  got?: unknown;
  want?: unknown;
}

const normNo = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const near = (a: unknown, b: number, tol = 1) => typeof a === 'number' && Math.abs(a - b) <= tol;
const v = (f: DocReadField | undefined) => f?.value ?? null;
const lowOn = (f: DocReadField | undefined) => f?.confidence === 'low';

function check(group: Grade['group'], name: string, f: DocReadField | undefined, ok: boolean, want: unknown): Grade {
  return { group, name, ok, silent: !ok && !lowOn(f), got: v(f), want };
}

function gradeInvoice(d: InvoiceDoc, r: DocReadResultDto): Grade[] {
  const t = invoiceTotals(d);
  const f = r.fields;
  const tax = ['cgst', 'sgst', 'igst'].reduce((s, k) => s + (typeof v(f[k]) === 'number' ? (v(f[k]) as number) : 0), 0);
  const out: Grade[] = [
    check('gstin', 'GSTIN', f.gstin, v(f.gstin) === vendorOf(d).gstin, vendorOf(d).gstin),
    check('number', 'invoice no.', f.invoiceNo, normNo(v(f.invoiceNo)) === normNo(d.invoiceNo), d.invoiceNo),
    check('date', 'date', f.invoiceDate, v(f.invoiceDate) === d.date, d.date),
    check('totals', 'total', f.total, near(v(f.total), t.total), t.total),
    check('totals', 'taxable value', f.subtotal, near(v(f.subtotal), t.subtotal), t.subtotal),
    { group: 'totals', name: 'GST', ok: Math.abs(tax - (t.cgst + t.sgst + t.igst)) <= 1, got: tax, want: t.cgst + t.sgst + t.igst },
  ];
  const used = new Set<number>();
  t.lines.forEach((l, i) => {
    const j = r.lines.findIndex((x, k) => !used.has(k) && near(v(x.quantity), l.qty, 0.001) && near(v(x.rate), l.rate, 0.01) && (l.noDescription || itemSimilarity(String(v(x.description) ?? ''), l.description) >= 0.5));
    if (j >= 0) used.add(j);
    const x = j >= 0 ? r.lines[j] : undefined;
    const ok = !!x && near(v(x.amount), l.amount, 1);
    out.push({ group: 'line', name: `line ${i + 1}`, ok, silent: !ok && (!x || !lowOn(x.amount)), got: x ? `${v(x.description)} ${v(x.quantity)} × ${v(x.rate)} = ${v(x.amount)}` : null, want: `${l.description} ${l.qty} × ${l.rate} = ${l.amount}` });
  });
  if (r.lines.length > t.lines.length) out.push({ group: 'line', name: 'extra lines', ok: false, got: r.lines.length, want: t.lines.length });
  out.push({ group: 'vendor', name: 'vendor', ok: r.match?.vendor?.name === vendorOf(d).name, got: r.match?.vendor?.name ?? r.match?.note, want: vendorOf(d).name });
  if (d.expectPo) out.push({ group: 'order', name: 'order', ok: r.match?.purchaseOrder?.poNo === d.expectPo, got: r.match?.purchaseOrder?.poNo ?? r.match?.note, want: d.expectPo });
  return out;
}

function gradeChallan(d: ChallanDoc, r: DocReadResultDto): Grade[] {
  const f = r.fields;
  const out: Grade[] = [
    check('gstin', 'GSTIN', f.gstin, v(f.gstin) === vendorOf(d).gstin, vendorOf(d).gstin),
    check('number', 'challan no.', f.challanNo, normNo(v(f.challanNo)) === normNo(d.challanNo), d.challanNo),
    check('date', 'date', f.date, v(f.date) === d.date, d.date),
    check('number', 'vehicle no.', f.vehicleNo, normNo(v(f.vehicleNo)) === normNo(d.vehicleNo), d.vehicleNo),
  ];
  const used = new Set<number>();
  d.lines.forEach((l, i) => {
    const j = r.lines.findIndex((x, k) => !used.has(k) && near(v(x.quantity), l.qty, 0.001) && (l.noDescription || itemSimilarity(String(v(x.description) ?? ''), l.description) >= 0.5));
    if (j >= 0) used.add(j);
    out.push({ group: 'line', name: `line ${i + 1}`, ok: j >= 0, silent: j < 0, got: j >= 0 ? `${v(r.lines[j].description)} ${v(r.lines[j].quantity)}` : r.lines.map((x) => `${v(x.description)} ${v(x.quantity)}`).join('; '), want: `${l.description} ${l.qty}` });
  });
  return out;
}

function gradeDrawing(d: DrawingDoc, r: DocReadResultDto): Grade[] {
  const f = r.fields;
  return [
    check('drawing', 'drawing no.', f.drawingNo, normNo(v(f.drawingNo)) === normNo(d.drawingNo), d.drawingNo),
    check('drawing', 'revision', f.revision, normNo(v(f.revision)) === normNo(d.revision), d.revision),
    check('drawing', 'title', f.title, itemSimilarity(String(v(f.title) ?? ''), d.title) >= 0.8, d.title),
    check('date', 'date', f.date, v(f.date) === d.date, d.date),
  ];
}

async function token(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.com', password: 'password123' }) });
  if (!res.ok) throw new Error(`login: ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function read(tok: string, d: PackDoc): Promise<{ result?: DocReadResultDto; error?: string; ms: number }> {
  const fd = new FormData();
  fd.append('kind', d.kind);
  fd.append('pages', new Blob([readFileSync(join(packDir, `${d.id}.jpg`))], { type: 'image/jpeg' }), `${d.id}.jpg`);
  const started = Date.now();
  const res = await fetch(`${API}/ai/read`, { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: fd });
  const ms = Date.now() - started;
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}`, ms };
  return { result: (await res.json()) as DocReadResultDto, ms };
}

async function main() {
  if (!PACK.every((d) => existsSync(join(packDir, `${d.id}.jpg`)))) await renderPack(packDir);
  const tok = await token();
  const docs = PACK.filter((d) => !only || only.includes(d.id));
  const all: (Grade & { doc: string; style: string })[] = [];
  const lines: string[] = [];
  let cost = 0;
  const times: number[] = [];
  for (const d of docs) {
    const { result, error, ms } = await read(tok, d);
    times.push(ms);
    if (!result) {
      console.log(`✗ ${d.id} (${d.style}): ${error}`);
      lines.push(`| ${d.id} | ${d.style} | error: ${error} |`);
      continue;
    }
    cost += result.costInr;
    const grades = d.kind === 'invoice' ? gradeInvoice(d, result) : d.kind === 'challan' ? gradeChallan(d, result) : gradeDrawing(d, result);
    grades.forEach((g) => all.push({ ...g, doc: d.id, style: d.style }));
    const bad = grades.filter((g) => !g.ok);
    console.log(`${bad.length ? '✗' : '✓'} ${d.id} (${d.style}, ${(ms / 1000).toFixed(1)} s, ₹${result.costInr.toFixed(2)})${bad.map((g) => `\n    ${g.name}${g.silent ? ' (not marked)' : ''}: got ${JSON.stringify(g.got)}, want ${JSON.stringify(g.want)}`).join('')}`);
    lines.push(`| ${d.id} | ${d.style} | ${bad.length ? bad.map((g) => `${g.name}${g.silent ? ' (not marked)' : ''}: got ${String(g.got).replace(/\|/g, '/')}`).join('; ') : 'all right'} |`);
  }
  const rate = (group: Grade['group'] | Grade['group'][]) => {
    const gs = all.filter((g) => (Array.isArray(group) ? group : [group]).includes(g.group));
    return gs.length ? { ok: gs.filter((g) => g.ok).length, n: gs.length, pct: (gs.filter((g) => g.ok).length / gs.length) * 100 } : null;
  };
  const rows: [string, Grade['group'] | Grade['group'][], number | null][] = [
    ['GSTIN', 'gstin', 98],
    ['Invoice, challan and vehicle numbers', 'number', 98],
    ['Totals (total, taxable value, GST)', 'totals', 98],
    ['Line items', 'line', 90],
    ['Drawing number, revision and title', 'drawing', null],
    ['Dates', 'date', null],
    ['Vendor matched', 'vendor', null],
    ['Order matched', 'order', null],
  ];
  const summary = rows
    .map(([label, g, bar]) => {
      const r = rate(g);
      return r ? `| ${label} | ${r.ok} of ${r.n} | ${r.pct.toFixed(1)}% | ${bar ? `${bar}%${r.pct >= bar ? ' ✓' : ' ✗'}` : ''} |` : null;
    })
    .filter(Boolean);
  const wrong = all.filter((g) => !g.ok);
  const silent = wrong.filter((g) => g.silent).length;
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const text = [
    `Read ${docs.length} documents through ${API}: ₹${cost.toFixed(2)} in all, ₹${(cost / Math.max(1, docs.length)).toFixed(2)} a document, median ${(median / 1000).toFixed(1)} s.`,
    `${wrong.length} wrong values, ${wrong.length - silent} of them marked for checking.`,
    '',
    '| Measure | Right | Share | Bar |',
    '|---|---|---|---|',
    ...summary,
  ].join('\n');
  console.log(`\n${text}`);
  if (reportPath) writeFileSync(reportPath, `# Reading invoices and challans: test pack results\n\n${text}\n\n| Document | Kind | Result |\n|---|---|---|\n${lines.join('\n')}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
