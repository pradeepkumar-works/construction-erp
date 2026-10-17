/**
 * The test pack for reading invoices, challans and drawings (AI item 70): 30 made-up documents in the shapes site
 * offices get (printed, phone photos, handwritten kachha bills, Hindi), each with the values printed on it.
 * Suppliers are the demo company's vendors (valid GSTINs), so matching to the vendor and its order is tested too.
 * Nothing here is a real invoice: names, numbers and GSTINs are invented.
 *
 *   npx tsx scripts/doc-read-pack.ts [outDir]     renders the pack as JPEGs (default scripts/.doc-read-pack)
 *
 * scripts/doc-read-eval.ts reads them through the API and grades the result.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gstinCheckChar } from '@erp/shared';

const gstin = (first14: string) => `${first14}${gstinCheckChar(first14)}`;

const BUYER = { name: 'Demo Infra Projects Pvt Ltd', gstin: gstin('21AAACD4821K1Z'), address: 'Plot 42, Saheed Nagar, Bhubaneswar, Odisha 751007' };

/** Demo vendors (seed.ts), with the check character the seed now gives them. */
export const VENDORS = {
  utkal: { name: 'Utkal Cement Traders', hi: 'उत्कल सीमेंट ट्रेडर्स', gstin: gstin('21ABCPU7788C1Z'), address: 'Station Square, Cuttack, Odisha 753003' },
  kalinga: { name: 'Kalinga Bitumen & Aggregates', hi: 'कलिंग बिटुमेन एंड एग्रीगेट्स', gstin: gstin('21AAKFK4521B1Z'), address: 'NH-16, Jagatpur, Cuttack, Odisha 754021' },
  sahoo: { name: 'Sahoo Auto Parts', hi: 'साहू ऑटो पार्ट्स', gstin: gstin('21BXRPS6612K1Z'), address: 'Link Road, Cuttack, Odisha 753012' },
  jagannath: { name: 'Jagannath Pipes & Fittings', hi: 'जगन्नाथ पाइप्स एंड फिटिंग्स', gstin: gstin('21AAGFJ3344D1Z'), address: 'Jajpur Road, Odisha 755019' },
  osc: { name: 'Odisha Steel & Cement Depot', hi: 'ओडिशा स्टील एंड सीमेंट डिपो', gstin: gstin('21AAECO5521R1Z'), address: 'Rasulgarh, Bhubaneswar, Odisha 751010' },
  safety: { name: 'Kalinga Safety Store', hi: 'कलिंग सेफ्टी स्टोर', gstin: gstin('21AALFK7720P1Z'), address: 'Unit 4, Bhubaneswar, Odisha 751001' },
} as const;
type VendorKey = keyof typeof VENDORS;

export type Style = 'printed' | 'photo' | 'handwritten' | 'hindi' | 'hindi-photo' | 'hindi-handwritten';

export interface Line {
  description: string;
  hsn?: string;
  qty: number;
  unit: string;
  rate: number;
  gst: number;
  /** Graded on quantity, rate and amount only (an item name written in Hindi) */
  noDescription?: boolean;
}

export interface InvoiceDoc {
  id: string;
  kind: 'invoice';
  style: Style;
  vendor: VendorKey;
  invoiceNo: string;
  date: string;
  /** How the date is printed */
  dateText: string;
  poNo: string | null;
  lines: Line[];
  freight: number;
  /** Inter-state: IGST instead of CGST and SGST */
  igst?: boolean;
  /** The demo order it should match, if the vendor has one */
  expectPo?: string;
}

export interface ChallanDoc {
  id: string;
  kind: 'challan';
  style: Style;
  vendor: VendorKey;
  challanNo: string;
  date: string;
  dateText: string;
  vehicleNo: string;
  poNo: string | null;
  lines: { description: string; qty: number; unit: string; noDescription?: boolean }[];
}

export interface DrawingDoc {
  id: string;
  kind: 'drawing';
  style: 'printed' | 'photo';
  drawingNo: string;
  revision: string;
  title: string;
  date: string;
  dateText: string;
  scale: string;
  issuedBy: string;
  discipline: string;
  project: string;
}

export type PackDoc = InvoiceDoc | ChallanDoc | DrawingDoc;

const L = (description: string, qty: number, unit: string, rate: number, gst: number, hsn?: string, noDescription?: boolean): Line => ({ description, qty, unit, rate, gst, hsn, noDescription });

export const PACK: PackDoc[] = [
  // Printed tax invoices
  { id: 'inv-01', kind: 'invoice', style: 'printed', vendor: 'utkal', invoiceNo: 'UCT/2026/612', date: '2026-10-06', dateText: '06/10/2026', poNo: 'PO-2026-0001', lines: [L('OPC 53 Grade Cement (Ultratech)', 200, 'Bags', 385, 28, '2523')], freight: 0, expectPo: 'PO-2026-0001' },
  { id: 'inv-02', kind: 'invoice', style: 'printed', vendor: 'utkal', invoiceNo: 'UCT/2026/618', date: '2026-10-09', dateText: '09-Oct-2026', poNo: null, lines: [L('OPC 53 Grade Cement', 150, 'Bags', 385, 28, '2523'), L('TMT Fe500D 12mm', 2.5, 'MT', 58500, 18, '7214')], freight: 1800, expectPo: 'PO-2026-0001' },
  { id: 'inv-03', kind: 'invoice', style: 'printed', vendor: 'kalinga', invoiceNo: 'KBA/26-27/0241', date: '2026-10-11', dateText: '11.10.2026', poNo: 'PO-2026-0002', lines: [L('Bitumen VG-30 (bulk)', 12.48, 'MT', 48500, 18, '27132000'), L('Aggregate 20mm', 120, 'Cum', 1150, 5, '2517')], freight: 4500, expectPo: 'PO-2026-0002' },
  { id: 'inv-04', kind: 'invoice', style: 'printed', vendor: 'jagannath', invoiceNo: 'JPF-1187', date: '2026-10-03', dateText: '03/10/2026', poNo: null, lines: [L('HDPE PE100 110mm PN6 pipe', 600, 'Rmt', 212.5, 18, '3917'), L('HDPE electrofusion coupler 110mm', 40, 'Nos', 365, 18, '3917'), L('Ball valve 50mm', 12, 'Nos', 1480, 18, '8481')], freight: 2500, igst: false },
  { id: 'inv-05', kind: 'invoice', style: 'printed', vendor: 'osc', invoiceNo: 'OSCD/2026-27/0098', date: '2026-10-14', dateText: '14 Oct 2026', poNo: null, lines: [L('TMT Fe500D 12mm', 4.2, 'MT', 57900, 18, '7214'), L('Binding wire 18 SWG', 150, 'Kg', 84, 18, '7217'), L('Shuttering plywood 12mm', 40, 'Nos', 1240, 18, '4412')], freight: 0 },
  { id: 'inv-06', kind: 'invoice', style: 'printed', vendor: 'safety', invoiceNo: 'KSS/412', date: '2026-10-01', dateText: '01/10/2026', poNo: null, lines: [L('Safety helmet (ISI) yellow', 60, 'Nos', 245, 18, '6506'), L('Safety shoes size 8', 24, 'Pair', 890, 18, '6403'), L('Reflective jacket', 60, 'Nos', 155, 12, '6211'), L('Full body harness', 10, 'Nos', 2350, 18, '6307')], freight: 350, igst: true },
  // Phone photos of printed invoices
  { id: 'inv-07', kind: 'invoice', style: 'photo', vendor: 'kalinga', invoiceNo: 'KBA/26-27/0252', date: '2026-10-13', dateText: '13/10/2026', poNo: 'PO-2026-0002', lines: [L('Aggregate 20mm', 96, 'Cum', 1150, 5, '2517')], freight: 3200, expectPo: 'PO-2026-0002' },
  { id: 'inv-08', kind: 'invoice', style: 'photo', vendor: 'sahoo', invoiceNo: 'SAP/26-27/0388', date: '2026-10-07', dateText: '07/10/2026', poNo: null, lines: [L('Hydraulic oil 68', 210, 'Ltr', 168, 18, '2710'), L('Engine oil 15W-40', 50, 'Ltr', 295, 18, '2710'), L('Oil filter (EX200)', 4, 'Nos', 1150, 18, '8421'), L('Grease (lithium)', 18, 'Kg', 240, 18, '2710')], freight: 0 },
  { id: 'inv-09', kind: 'invoice', style: 'photo', vendor: 'utkal', invoiceNo: 'UCT/2026/631', date: '2026-10-15', dateText: '15-10-2026', poNo: 'PO-2026-0001', lines: [L('OPC 53 Grade Cement', 300, 'Bags', 385, 28, '2523')], freight: 2400, expectPo: 'PO-2026-0001' },
  { id: 'inv-10', kind: 'invoice', style: 'photo', vendor: 'jagannath', invoiceNo: 'JPF-1203', date: '2026-10-12', dateText: '12/10/2026', poNo: null, lines: [L('DI K9 pipe 400mm', 66, 'Rmt', 6420, 12, '7303')], freight: 12000 },
  { id: 'inv-11', kind: 'invoice', style: 'photo', vendor: 'osc', invoiceNo: 'OSCD/2026-27/0104', date: '2026-10-16', dateText: '16.10.26', poNo: null, lines: [L('OPC 53 Grade Cement', 400, 'Bags', 372, 28, '2523'), L('Binding wire 18 SWG', 75, 'Kg', 84, 18, '7217')], freight: 1500 },
  // Handwritten kachha bills
  { id: 'inv-12', kind: 'invoice', style: 'handwritten', vendor: 'sahoo', invoiceNo: '147', date: '2026-10-10', dateText: '10/10/26', poNo: null, lines: [L('Hydraulic hose 1/2" (grader)', 2, 'Nos', 1150, 18), L('Oil filter (EX200)', 2, 'Nos', 1150, 18)], freight: 0 },
  { id: 'inv-13', kind: 'invoice', style: 'handwritten', vendor: 'safety', invoiceNo: '0263', date: '2026-10-05', dateText: '5/10/2026', poNo: null, lines: [L('Safety helmet', 20, 'Nos', 245, 18), L('Hand gloves (cotton)', 50, 'Pair', 38, 12)], freight: 0 },
  { id: 'inv-14', kind: 'invoice', style: 'handwritten', vendor: 'osc', invoiceNo: '88', date: '2026-10-12', dateText: '12-10-2026', poNo: null, lines: [L('Binding wire 18 SWG', 40, 'Kg', 85, 18), L('Cover blocks 25mm', 500, 'Nos', 6.5, 18)], freight: 200 },
  // Hindi
  { id: 'inv-15', kind: 'invoice', style: 'hindi', vendor: 'utkal', invoiceNo: 'UCT/2026/640', date: '2026-10-16', dateText: '16/10/2026', poNo: 'PO-2026-0001', lines: [L('OPC 53 Grade Cement', 120, 'Bags', 385, 28, '2523')], freight: 0, expectPo: 'PO-2026-0001' },
  { id: 'inv-16', kind: 'invoice', style: 'hindi-photo', vendor: 'kalinga', invoiceNo: 'KBA/26-27/0260', date: '2026-10-15', dateText: '15/10/2026', poNo: null, lines: [L('बिटुमेन VG-30', 8.2, 'MT', 48500, 18, '27132000', true), L('गिट्टी 20mm', 60, 'Cum', 1150, 5, '2517', true)], freight: 2800, expectPo: 'PO-2026-0002' },
  { id: 'inv-17', kind: 'invoice', style: 'hindi-handwritten', vendor: 'sahoo', invoiceNo: '152', date: '2026-10-14', dateText: '14/10/26', poNo: null, lines: [L('ग्रीस', 10, 'Kg', 240, 18, undefined, true), L('इंजन ऑयल 15W-40', 20, 'Ltr', 295, 18, undefined, true)], freight: 0 },
  // Delivery challans
  { id: 'dc-01', kind: 'challan', style: 'printed', vendor: 'utkal', challanNo: 'DC/UCT/2291', date: '2026-10-15', dateText: '15/10/2026', vehicleNo: 'OD 05 AB 4471', poNo: 'PO-2026-0001', lines: [{ description: 'OPC 53 Grade Cement', qty: 300, unit: 'Bags' }] },
  { id: 'dc-02', kind: 'challan', style: 'printed', vendor: 'kalinga', challanNo: 'KBA-DC-0877', date: '2026-10-13', dateText: '13.10.2026', vehicleNo: 'OD02 BT 9087', poNo: 'PO-2026-0002', lines: [{ description: 'Aggregate 20mm', qty: 32, unit: 'Cum' }, { description: 'Bitumen VG-30 (bulk tanker)', qty: 12.48, unit: 'MT' }] },
  { id: 'dc-03', kind: 'challan', style: 'printed', vendor: 'jagannath', challanNo: 'JPF/DC/554', date: '2026-10-12', dateText: '12/10/2026', vehicleNo: 'OD 04 G 1120', poNo: null, lines: [{ description: 'HDPE PE100 110mm PN6 pipe', qty: 600, unit: 'Rmt' }, { description: 'HDPE electrofusion coupler 110mm', qty: 40, unit: 'Nos' }] },
  { id: 'dc-04', kind: 'challan', style: 'photo', vendor: 'osc', challanNo: 'OSCD-DN-1452', date: '2026-10-16', dateText: '16/10/2026', vehicleNo: 'OD 02 CK 7781', poNo: null, lines: [{ description: 'TMT Fe500D 12mm', qty: 4.2, unit: 'MT' }, { description: 'Binding wire 18 SWG', qty: 150, unit: 'Kg' }] },
  { id: 'dc-05', kind: 'challan', style: 'photo', vendor: 'utkal', challanNo: 'DC/UCT/2304', date: '2026-10-16', dateText: '16-10-2026', vehicleNo: 'OD 05 AC 1202', poNo: 'PO-2026-0001', lines: [{ description: 'OPC 53 Grade Cement', qty: 250, unit: 'Bags' }] },
  { id: 'dc-06', kind: 'challan', style: 'handwritten', vendor: 'kalinga', challanNo: '3318', date: '2026-10-14', dateText: '14/10/26', vehicleNo: 'OD02 BT 9087', poNo: null, lines: [{ description: 'Aggregate 20mm', qty: 16, unit: 'Cum' }] },
  { id: 'dc-07', kind: 'challan', style: 'handwritten', vendor: 'sahoo', challanNo: '71', date: '2026-10-11', dateText: '11/10/2026', vehicleNo: 'OD 05 Q 3321', poNo: null, lines: [{ description: 'Diesel', qty: 400, unit: 'Ltr' }, { description: 'Grease (lithium)', qty: 18, unit: 'Kg' }] },
  { id: 'dc-08', kind: 'challan', style: 'hindi', vendor: 'osc', challanNo: 'OSCD-DN-1460', date: '2026-10-17', dateText: '17/10/2026', vehicleNo: 'OD 02 CK 7781', poNo: null, lines: [{ description: 'सीमेंट OPC 53', qty: 200, unit: 'Bags', noDescription: true }, { description: 'बाइंडिंग वायर', qty: 50, unit: 'Kg', noDescription: true }] },
  // Drawing title blocks
  { id: 'dwg-01', kind: 'drawing', style: 'printed', drawingNo: 'DHB-STR-GF-104', revision: 'R2', title: 'Ground floor column layout and schedule', date: '2026-10-12', dateText: '12.10.2026', scale: '1:100', issuedBy: 'Mohanty Associates', discipline: 'Structural', project: 'District Hospital Block B (G+3), Cuttack' },
  { id: 'dwg-02', kind: 'drawing', style: 'printed', drawingNo: 'DHB-ARC-FF-201', revision: 'C', title: 'First floor plan', date: '2026-09-28', dateText: '28/09/2026', scale: '1:100', issuedBy: 'Studio Kalinga Architects', discipline: 'Architectural', project: 'District Hospital Block B (G+3), Cuttack' },
  { id: 'dwg-03', kind: 'drawing', style: 'printed', drawingNo: 'BPH-RD-TCS-03', revision: 'P1', title: 'Typical cross section, Km 12 to Km 28', date: '2026-08-19', dateText: '19 Aug 2026', scale: '1:50', issuedBy: 'Odisha Works Department', discipline: 'Road', project: 'Bhubaneswar - Puri Highway Widening' },
  { id: 'dwg-04', kind: 'drawing', style: 'printed', drawingNo: 'JRW-WTP-GA-01', revision: 'R1', title: 'Water treatment plant general arrangement', date: '2026-10-02', dateText: '02/10/2026', scale: '1:200', issuedBy: 'RWSS Design Cell', discipline: 'Water', project: 'Jajpur Rural Piped Water Supply Scheme' },
  { id: 'dwg-05', kind: 'drawing', style: 'photo', drawingNo: 'DHB-PLB-GF-301', revision: 'R0', title: 'Ground floor plumbing and drainage layout', date: '2026-10-08', dateText: '08.10.2026', scale: '1:100', issuedBy: 'Mohanty Associates', discipline: 'Plumbing', project: 'District Hospital Block B (G+3), Cuttack' },
  { id: 'dwg-06', kind: 'drawing', style: 'photo', drawingNo: 'DHB-ELE-TF-412', revision: 'R3', title: 'Third floor lighting and power layout', date: '2026-10-15', dateText: '15/10/2026', scale: '1:100', issuedBy: 'Brightline MEP Consultants', discipline: 'Electrical', project: 'District Hospital Block B (G+3), Cuttack' },
];

/** What an invoice adds up to, as printed: each line's amount and tax, the taxable value, the taxes, freight and the total rounded to the rupee. */
export function invoiceTotals(d: InvoiceDoc) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lines = d.lines.map((l) => ({ ...l, amount: r2(l.qty * l.rate), tax: r2((l.qty * l.rate * l.gst) / 100) }));
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
  // Freight on a tax invoice carries GST at the goods' rate; on these it is billed as a plain charge.
  const exact = subtotal + tax + d.freight;
  const total = Math.round(exact);
  return { lines, subtotal, cgst: d.igst ? 0 : r2(tax / 2), sgst: d.igst ? 0 : r2(tax - r2(tax / 2)), igst: d.igst ? tax : 0, total, roundOff: r2(total - exact) };
}

export const vendorOf = (d: InvoiceDoc | ChallanDoc) => VENDORS[d.vendor];

// ---------------------------------------------------------------------------------------------------------------------
// Rendering

const FONT_FILES = {
  caveat: 'caveat/files/caveat-latin-400-normal.woff2',
  kalamDeva: 'kalam/files/kalam-devanagari-400-normal.woff2',
  kalamLatin: 'kalam/files/kalam-latin-400-normal.woff2',
  notoDeva: 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2',
  notoDevaBold: 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff2',
};

async function fonts(): Promise<Record<keyof typeof FONT_FILES, string>> {
  const dir = join(tmpdir(), 'nirmaan-doc-pack-fonts');
  mkdirSync(dir, { recursive: true });
  const out = {} as Record<keyof typeof FONT_FILES, string>;
  for (const [k, path] of Object.entries(FONT_FILES) as [keyof typeof FONT_FILES, string][]) {
    const file = join(dir, path.split('/').pop()!);
    if (!existsSync(file)) {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${path}`);
      if (!res.ok) throw new Error(`font ${path}: ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    out[k] = `data:font/woff2;base64,${Buffer.from(await import('node:fs').then((fs) => fs.readFileSync(file))).toString('base64')}`;
  }
  return out;
}

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function css(f: Record<keyof typeof FONT_FILES, string>) {
  return `
  @font-face { font-family: Hand; src: url(${f.caveat}); }
  @font-face { font-family: HandHi; src: url(${f.kalamDeva}); unicode-range: U+0900-097F, U+200C-200D, U+25CC; }
  @font-face { font-family: HandHi; src: url(${f.kalamLatin}); }
  @font-face { font-family: Deva; src: url(${f.notoDeva}); font-weight: 400; }
  @font-face { font-family: Deva; src: url(${f.notoDevaBold}); font-weight: 700; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; }
  .page { width: 1240px; height: 1754px; padding: 70px 80px; background: #fff; color: #111; font: 22px/1.35 'Liberation Sans', Arial, Deva, sans-serif; position: relative; }
  .page.hand { background: repeating-linear-gradient(#fdfcf6 0 46px, #9fb7d9 46px 48px); color: #1b2a8a; font: 36px/48px Hand, cursive; padding: 60px 90px; }
  .page.handhi { background: repeating-linear-gradient(#fdfcf6 0 46px, #9fb7d9 46px 48px); color: #1b2a8a; font: 31px/48px HandHi, cursive; padding: 60px 90px; }
  h1 { font-size: 40px; margin: 0 0 4px; }
  .muted { color: #444; font-size: 19px; }
  table { border-collapse: collapse; width: 100%; }
  .grid td, .grid th { border: 1.5px solid #333; padding: 8px 10px; }
  .grid th { background: #eee; font-size: 19px; }
  .num { text-align: right; white-space: nowrap; }
  .box { border: 2px solid #222; padding: 12px 16px; }
  .stamp { position: absolute; right: 140px; bottom: 230px; width: 220px; height: 120px; border: 4px double #2a4fb8; color: #2a4fb8; transform: rotate(-12deg); font: 700 24px Arial; text-align: center; padding-top: 22px; opacity: .7; }
  `;
}

function invoiceHtml(d: InvoiceDoc): string {
  const v = vendorOf(d);
  const t = invoiceTotals(d);
  const hindi = d.style.startsWith('hindi');
  if (d.style === 'handwritten' || d.style === 'hindi-handwritten') {
    const H = hindi ? { bill: 'बिल / कैश मेमो', no: 'बिल नं.', date: 'दिनांक', to: 'श्री', item: 'विवरण', qty: 'मात्रा', rate: 'दर', amt: 'रकम', gst: 'जीएसटी', total: 'कुल रकम', sign: 'हस्ताक्षर' } : { bill: 'BILL / CASH MEMO', no: 'Bill No.', date: 'Date', to: 'M/s', item: 'Particulars', qty: 'Qty', rate: 'Rate', amt: 'Amount', gst: 'GST', total: 'Total', sign: 'Signature' };
    const rows = t.lines.map((l, i) => `<tr style="transform: rotate(${(i % 2 ? -0.6 : 0.5)}deg)"><td>${i + 1}. ${esc(l.description)}</td><td>${qtyText(l.qty)} ${l.unit}</td><td>${inr(l.rate).replace(/\.00$/, '')}</td><td>${l.gst}%</td><td class="num">${inr(l.amount)}</td></tr>`).join('');
    return `<div class="page ${hindi ? 'handhi' : 'hand'}">
      <div style="font: 700 34px Arial, Deva; color:#7a1414; text-align:center; letter-spacing:1px">${esc(hindi ? v.hi : v.name.toUpperCase())}</div>
      <div style="font: 20px Arial, Deva; color:#7a1414; text-align:center">${esc(v.address)} &nbsp; GSTIN: ${v.gstin}</div>
      <div style="font: 700 24px Arial, Deva; color:#7a1414; text-align:center; margin-bottom: 30px">${H.bill}</div>
      <table style="width:100%"><tr><td>${H.no} <u>${esc(d.invoiceNo)}</u></td><td style="text-align:right">${H.date} <u>${esc(d.dateText)}</u></td></tr></table>
      <div>${H.to} ${esc(BUYER.name)}${d.poNo ? `, PO ${esc(d.poNo)}` : ''}</div>
      <table style="margin-top: 20px"><tr style="font-family: Arial, Deva; font-size: 22px; color:#7a1414"><td>${H.item}</td><td>${H.qty}</td><td>${H.rate}</td><td>${H.gst}</td><td class="num">${H.amt}</td></tr>${rows}</table>
      <div style="margin-top: 30px; text-align:right">${d.igst ? 'IGST' : 'CGST + SGST'} ${inr(t.cgst + t.sgst + t.igst)}</div>
      ${d.freight ? `<div style="text-align:right">Freight ${inr(d.freight)}</div>` : ''}
      <div style="text-align:right; font-size: 42px">${H.total} ₹ ${inr(t.total)}</div>
      <div style="position:absolute; right: 120px; bottom: 120px; font-family: Arial, Deva; font-size: 20px; color:#7a1414">${H.sign}</div>
    </div>`;
  }
  const H = hindi
    ? { title: 'कर बीजक (Tax Invoice)', no: 'बीजक सं.', date: 'दिनांक', po: 'क्रय आदेश सं.', billTo: 'क्रेता', sl: 'क्र.', item: 'सामान का विवरण', hsn: 'HSN', qty: 'मात्रा', unit: 'इकाई', rate: 'दर', gst: 'जीएसटी %', amt: 'राशि', taxable: 'कर योग्य मूल्य', freight: 'भाड़ा', round: 'राउंड ऑफ', total: 'कुल योग' }
    : { title: 'TAX INVOICE', no: 'Invoice No.', date: 'Invoice Date', po: 'Buyer PO No.', billTo: 'Bill to', sl: 'Sl.', item: 'Description of goods', hsn: 'HSN', qty: 'Qty', unit: 'Unit', rate: 'Rate', gst: 'GST %', amt: 'Taxable value', taxable: 'Taxable value', freight: 'Freight & cartage', round: 'Round off', total: 'Invoice total' };
  const rows = t.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${l.hsn ?? ''}</td><td class="num">${qtyText(l.qty)}</td><td>${l.unit}</td><td class="num">${inr(l.rate)}</td><td class="num">${l.gst}</td><td class="num">${inr(l.amount)}</td></tr>`).join('');
  const taxRows = d.igst ? `<tr><td>IGST</td><td class="num">${inr(t.igst)}</td></tr>` : `<tr><td>CGST</td><td class="num">${inr(t.cgst)}</td></tr><tr><td>SGST</td><td class="num">${inr(t.sgst)}</td></tr>`;
  return `<div class="page">
    <table><tr><td style="width:62%"><h1>${esc(hindi ? v.hi : v.name)}</h1><div class="muted">${esc(v.address)}</div><div><b>GSTIN:</b> ${v.gstin} &nbsp; State: Odisha (21)</div></td>
    <td style="text-align:right; vertical-align: top"><div style="font-size:30px; font-weight:700">${H.title}</div><div class="muted">Original for recipient</div></td></tr></table>
    <table class="grid" style="margin-top: 26px"><tr><td style="width:50%"><b>${H.billTo}</b><br>${esc(BUYER.name)}<br><span class="muted">${esc(BUYER.address)}</span><br>GSTIN: ${BUYER.gstin}</td>
    <td>${H.no}: <b>${esc(d.invoiceNo)}</b><br>${H.date}: <b>${esc(d.dateText)}</b><br>${d.poNo ? `${H.po}: ${esc(d.poNo)}<br>` : ''}Place of supply: ${d.igst ? 'West Bengal (19)' : 'Odisha (21)'}</td></tr></table>
    <table class="grid" style="margin-top: 26px"><tr><th>${H.sl}</th><th>${H.item}</th><th>${H.hsn}</th><th>${H.qty}</th><th>${H.unit}</th><th>${H.rate}</th><th>${H.gst}</th><th>${H.amt}</th></tr>${rows}</table>
    <table style="margin-top: 20px"><tr><td style="width:55%; vertical-align: top" class="muted">Amount in words: as per total.<br>Goods once sold will not be taken back. Subject to Cuttack jurisdiction.<br>Bank: SBI, Cuttack Main, A/c 3456 7788 1200, IFSC SBIN0000086</td>
    <td><table class="grid"><tr><td>${H.taxable}</td><td class="num">${inr(t.subtotal)}</td></tr>${taxRows}${d.freight ? `<tr><td>${H.freight}</td><td class="num">${inr(d.freight)}</td></tr>` : ''}${t.roundOff ? `<tr><td>${H.round}</td><td class="num">${inr(t.roundOff)}</td></tr>` : ''}<tr><th>${H.total}</th><th class="num">₹ ${inr(t.total)}</th></tr></table></td></tr></table>
    <div class="stamp">RECEIVED<br><span style="font-size:18px">Stores, site</span></div>
    <div style="position:absolute; right: 90px; bottom: 90px; text-align: right">For ${esc(v.name)}<br><br><br>Authorised signatory</div>
  </div>`;
}

function challanHtml(d: ChallanDoc): string {
  const v = vendorOf(d);
  const hindi = d.style.startsWith('hindi');
  if (d.style === 'handwritten') {
    const rows = d.lines.map((l, i) => `<tr><td>${i + 1}. ${esc(l.description)}</td><td class="num">${qtyText(l.qty)} ${l.unit}</td></tr>`).join('');
    return `<div class="page hand">
      <div style="font: 700 34px Arial; color:#0d5c2e; text-align:center">${esc(v.name.toUpperCase())}</div>
      <div style="font: 20px Arial; color:#0d5c2e; text-align:center">${esc(v.address)} &nbsp; GSTIN ${v.gstin}</div>
      <div style="font: 700 24px Arial; color:#0d5c2e; text-align:center; margin-bottom: 30px">DELIVERY CHALLAN</div>
      <table style="width:100%"><tr><td>No. <u>${esc(d.challanNo)}</u></td><td style="text-align:right">Date <u>${esc(d.dateText)}</u></td></tr></table>
      <div>To: ${esc(BUYER.name)} site</div><div>Vehicle No. ${esc(d.vehicleNo)}</div>
      <table style="margin-top: 20px">${rows}</table>
      <div style="position:absolute; left: 90px; bottom: 140px">Received in good condition ____</div>
    </div>`;
  }
  const H = hindi ? { title: 'डिलीवरी चालान', no: 'चालान सं.', date: 'दिनांक', veh: 'वाहन सं.', po: 'आदेश सं.', item: 'सामान', qty: 'मात्रा', unit: 'इकाई' } : { title: 'DELIVERY CHALLAN', no: 'Challan No.', date: 'Date', veh: 'Vehicle No.', po: 'Your PO', item: 'Description', qty: 'Quantity', unit: 'Unit' };
  const rows = d.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td class="num">${qtyText(l.qty)}</td><td>${l.unit}</td></tr>`).join('');
  return `<div class="page">
    <h1>${esc(hindi ? v.hi : v.name)}</h1><div class="muted">${esc(v.address)}</div><div>GSTIN: ${v.gstin}</div>
    <div style="font-size:30px; font-weight:700; text-align:center; margin: 30px 0">${H.title}</div>
    <table class="grid"><tr><td>${H.no}: <b>${esc(d.challanNo)}</b></td><td>${H.date}: <b>${esc(d.dateText)}</b></td></tr>
    <tr><td>${H.veh}: ${esc(d.vehicleNo)}</td><td>${d.poNo ? `${H.po}: ${esc(d.poNo)}` : 'Not for sale. Returnable: No'}</td></tr>
    <tr><td colspan="2">Consignee: ${esc(BUYER.name)}, project site</td></tr></table>
    <table class="grid" style="margin-top: 26px"><tr><th>#</th><th>${H.item}</th><th>${H.qty}</th><th>${H.unit}</th></tr>${rows}</table>
    <div style="position:absolute; left: 80px; bottom: 120px">Receiver's signature with seal</div>
    <div style="position:absolute; right: 80px; bottom: 120px">For ${esc(v.name)}</div>
  </div>`;
}

function drawingHtml(d: DrawingDoc): string {
  // A drawing sheet: a few grid lines and shapes for the drawing, the title block bottom right.
  const lines = Array.from({ length: 9 }, (_, i) => `<div style="position:absolute; left:${80 + i * 130}px; top:80px; width:1px; height:1150px; background:#bbb"></div>`).join('');
  const cols = Array.from({ length: 30 }, (_, i) => `<div style="position:absolute; left:${110 + (i % 6) * 190}px; top:${130 + Math.floor(i / 6) * 220}px; width:34px; height:34px; border:3px solid #222; background:#ccc"></div>`).join('');
  return `<div class="page" style="padding:0">
    <div style="position:absolute; inset: 40px; border: 4px solid #111"></div>${lines}${cols}
    <div style="position:absolute; right: 40px; bottom: 40px; width: 640px; border: 3px solid #111; font-size: 19px">
      <table class="grid" style="width:100%">
        <tr><td colspan="3" style="font-size:16px">PROJECT<br><b style="font-size:20px">${esc(d.project)}</b></td></tr>
        <tr><td colspan="3" style="font-size:16px">CONSULTANT<br><b style="font-size:22px">${esc(d.issuedBy)}</b></td></tr>
        <tr><td colspan="3" style="font-size:16px">DRAWING TITLE<br><b style="font-size:26px">${esc(d.title)}</b></td></tr>
        <tr><td style="font-size:16px">DISCIPLINE<br><b>${esc(d.discipline)}</b></td><td style="font-size:16px">SCALE<br><b>${esc(d.scale)}</b></td><td style="font-size:16px">DATE<br><b>${esc(d.dateText)}</b></td></tr>
        <tr><td colspan="2" style="font-size:16px">DRAWING NO.<br><b style="font-size:26px">${esc(d.drawingNo)}</b></td><td style="font-size:16px">REV.<br><b style="font-size:26px">${esc(d.revision)}</b></td></tr>
      </table>
    </div>
    <div style="position:absolute; right: 40px; bottom: 470px; width: 640px; font-size: 16px">
      <table class="grid" style="width:100%"><tr><th>Rev</th><th>Date</th><th>Description</th></tr>
      <tr><td>${esc(d.revision)}</td><td>${esc(d.dateText)}</td><td>Issued for construction</td></tr>
      <tr><td>-</td><td>-</td><td>Issued for tender</td></tr></table>
    </div>
  </div>`;
}

function photoWrap(png: string, seed: number): string {
  // A phone photo of the page on a desk: tilted, in perspective, unevenly lit, a little soft.
  const tilt = [-4, 3, -2.5, 5, -6, 2][seed % 6];
  const persp = [8, -6, 5, -9, 4, 7][seed % 6];
  return `<div style="width:1500px; height:2000px; background: radial-gradient(circle at 30% 20%, #8a7356, #4b3a28); position:relative; overflow:hidden">
    <img src="${png}" style="position:absolute; left:120px; top:110px; width:1240px; transform: perspective(2200px) rotateX(${persp}deg) rotate(${tilt}deg); filter: blur(0.9px) contrast(0.92) brightness(0.97); box-shadow: 0 30px 60px rgba(0,0,0,.5)">
    <div style="position:absolute; inset:0; background: linear-gradient(${110 + seed * 20}deg, rgba(0,0,0,.32), rgba(0,0,0,0) 45%, rgba(255,240,200,.12))"></div>
  </div>`;
}

export function htmlOf(d: PackDoc): string {
  return d.kind === 'invoice' ? invoiceHtml(d) : d.kind === 'challan' ? challanHtml(d) : drawingHtml(d);
}

/** Renders every document to `<outDir>/<id>.jpg`. */
export async function renderPack(outDir: string): Promise<void> {
  const { chromium } = await import('playwright');
  mkdirSync(outDir, { recursive: true });
  const f = await fonts();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  let i = 0;
  for (const d of PACK) {
    await page.setViewportSize({ width: 1240, height: 1754 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css(f)}</style></head><body>${htmlOf(d)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    let shot = await page.screenshot({ type: d.style.includes('photo') ? 'png' : 'jpeg', quality: d.style.includes('photo') ? undefined : 82 });
    if (d.style.includes('photo')) {
      await page.setViewportSize({ width: 1500, height: 2000 });
      await page.setContent(`<!doctype html><html><body style="margin:0">${photoWrap(`data:image/png;base64,${shot.toString('base64')}`, i)}</body></html>`);
      await page.waitForLoadState('load');
      shot = await page.screenshot({ type: 'jpeg', quality: 62 });
    }
    writeFileSync(join(outDir, `${d.id}.jpg`), shot);
    i++;
  }
  await browser.close();
}

if (require.main === module) {
  const out = resolve(process.argv[2] ?? join(__dirname, '.doc-read-pack'));
  renderPack(out).then(
    () => console.log(`${PACK.length} documents in ${out}`),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
