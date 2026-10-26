import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { DocReadField, DocReadKind, DocReadLine, DocReadResultDto, PurchaseOrderDto } from '@erp/shared';
import { DOC_READ_FIELDS, DOC_READ_LINE_FIELDS, DOC_READ_MAX_LINES, DOC_READ_MAX_PAGES, DOC_READ_MAX_PAGE_BYTES, canApprove, canEditProjects, canKeepStock, canManageDocuments, canRecordVendorBill, gstinCheckChar, gstinChecksumOk, matchLines, readNumber, readText } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { VendorsService } from '../vendors/vendors.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { ClientsService } from '../clients/clients.service';
import { AiService } from './ai.service';
import { docReadPrompt } from './prompt';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const NUMBER_FIELDS = new Set(['subtotal', 'cgst', 'sgst', 'igst', 'freight', 'total', 'quantity', 'rate', 'gstRate', 'amount', 'contractValue', 'durationMonths']);
const DATE_FIELDS = new Set(['invoiceDate', 'date', 'workOrderDate', 'agreementDate', 'startDate', 'completionDate']);
/** Figures within this much agree (rounding on the paper). */
const TOLERANCE = 1;

export interface PageImage {
  mimetype: string;
  buffer: Buffer;
}

/**
 * Reads an invoice, a delivery challan or a drawing's title block from page images (AI item 70). The model only copies
 * what is printed, with where it is; the checks on what it read (a GSTIN's check character, figures adding up) and the
 * matching to the vendor, the order and its lines are code. Nothing is written but the cost of the call: the form the
 * result fills is saved only when the user saves it.
 */
@Injectable()
export class AiReadService {
  private readonly log = new Logger(AiReadService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private vendors: VendorsService,
    private purchaseOrders: PurchaseOrdersService,
    private clients: ClientsService,
  ) {}

  async read(user: RequestUser, kind: DocReadKind, pages: PageImage[], purchaseOrderId?: string): Promise<DocReadResultDto> {
    this.assertMayRead(user, kind);
    if (!pages.length) throw new BadRequestException('Send at least one page image (JPEG, PNG or WebP)');
    if (pages.length > DOC_READ_MAX_PAGES) throw new BadRequestException(`Send at most ${DOC_READ_MAX_PAGES} pages`);
    for (const p of pages) {
      if (!IMAGE_TYPES.includes(p.mimetype as ImageType)) throw new BadRequestException('Pages must be JPEG, PNG or WebP images');
      if (p.buffer.length > DOC_READ_MAX_PAGE_BYTES) throw new BadRequestException('A page image is too large; send it smaller');
    }
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...pages.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.mimetype as ImageType, data: p.buffer.toString('base64') } })),
      { type: 'text', text: `Kind: ${kind}. ${pages.length} page${pages.length === 1 ? '' : 's'}, in order.` },
    ];
    const started = Date.now();
    let reply: { text: string; model: string; costPaise: number };
    try {
      reply = await this.ai.singleTurn(user, docReadPrompt(kind), content, 90_000);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.warn(`read ${kind}: ${(e as Error).message}`);
      throw new HttpException('The page could not be read just now. Try again, or fill the form by hand.', HttpStatus.BAD_GATEWAY);
    }
    const parsed = parseReply(reply.text);
    await this.prisma.aiDocumentRead.create({
      data: { organizationId: user.organizationId, userId: user.id, kind, pages: pages.length, model: reply.model, costPaise: reply.costPaise, ms: Date.now() - started, ok: !!parsed },
    });
    if (!parsed) throw new HttpException('Nothing could be read from that page. Try a clearer photo, or fill the form by hand.', HttpStatus.UNPROCESSABLE_ENTITY);

    const read = normalise(kind, parsed, pages.length);
    const match = kind === 'invoice' ? await this.matchInvoice(user, read, purchaseOrderId) : null;
    const client = kind === 'workOrder' ? await this.matchClient(user, readText(read.fields.clientName)) : undefined;
    return { kind, fields: read.fields, lines: read.lines, match, ...(client !== undefined ? { client } : {}), model: reply.model, costInr: reply.costPaise / 100 };
  }

  /** The client in the master with the work order's issuing office's name, when exactly one has it (its own list, active ones). */
  private async matchClient(user: RequestUser, name: string | null): Promise<{ id: string; name: string } | null> {
    if (!name) return null;
    const found = (await this.clients.list(user, { q: name, pageSize: 5 } as never)).items;
    // The same name only: a search hit like "Roads Division II" is another office, and picking it would bill the wrong one.
    const same = found.filter((c) => normName(c.name) === normName(name));
    return same.length === 1 ? { id: same[0].id, name: same[0].name } : null;
  }

  private assertMayRead(user: RequestUser, kind: DocReadKind) {
    const rules: Record<DocReadKind, [(r: RequestUser['roleKey']) => boolean, string]> = {
      invoice: [canRecordVendorBill, 'Your role does not record vendor bills'],
      challan: [canKeepStock, 'Your role does not receive material'],
      drawing: [canManageDocuments, 'Your role does not keep the document register'],
      // The roles that create projects and edit the BOQ (POST /projects, the BOQ's editors).
      workOrder: [canApprove, 'Your role does not set up projects'],
      boq: [canEditProjects, 'Your role does not edit the BOQ'],
    };
    const [may, refusal] = rules[kind];
    if (!may(user.roleKey)) throw new ForbiddenException(refusal);
  }

  /**
   * The vendor by GSTIN (else by name), then the order: the one the form is on, else the printed PO number, else the
   * vendor's approved order whose lines are most like the invoice's. Orders come through their own list service, so
   * the caller's project access applies.
   */
  private async matchInvoice(user: RequestUser, read: { fields: Record<string, DocReadField>; lines: DocReadLine[] }, purchaseOrderId?: string): Promise<NonNullable<DocReadResultDto['match']>> {
    const gstin = readText(read.fields.gstin);
    const name = readText(read.fields.vendorName);
    const lines = read.lines.map((l) => ({ description: readText(l.description) ?? '', unit: readText(l.unit), rate: readNumber(l.rate) }));
    const scoreOf = (po: PurchaseOrderDto) => {
      const m = matchLines(lines, po.lines.map((pl) => ({ id: pl.id, itemName: pl.itemName, specification: pl.specification, unit: pl.unit, rate: Number(pl.rate) })));
      return { po, m, score: m.reduce((s, x) => s + (x?.score ?? 0), 0) };
    };
    const result = (picked: ReturnType<typeof scoreOf> | null, vendor: { id: string; name: string } | null, note: string | null) => ({
      vendor,
      purchaseOrder: picked ? { id: picked.po.id, poNo: picked.po.poNo } : null,
      lines: picked ? picked.m.map((x) => (x ? { purchaseOrderLineId: x.id, itemName: picked.po.lines.find((l) => l.id === x.id)!.itemName, score: x.score } : null)) : read.lines.map(() => null),
      note,
    });

    if (purchaseOrderId) {
      const po = await this.purchaseOrders.get(user, purchaseOrderId);
      const picked = scoreOf(po);
      const vendorOk = !gstin || !po.vendorGstin || norm(po.vendorGstin) === norm(gstin);
      return result(picked, { id: po.vendorId, name: po.vendorName }, vendorOk ? null : `The invoice's GSTIN ${gstin} is not ${po.vendorName}'s (${po.vendorGstin}).`);
    }

    // The same state, PAN and entity (the first 14 characters) is the same vendor even when one of the two GSTINs has
    // its last, check character wrong; the read one's is verified, so the note points at the master's.
    const byPan = gstin ? (await this.vendors.list(user, { q: norm(gstin).slice(2, 12), pageSize: 10 } as never)).items.filter((v) => v.gstin && norm(v.gstin).slice(0, 14) === norm(gstin).slice(0, 14)) : [];
    const byGstin = byPan.filter((v) => norm(v.gstin!) === norm(gstin!));
    const byName = !byPan.length && name ? (await this.vendors.list(user, { q: name, pageSize: 5 } as never)).items : [];
    const vendor = byGstin[0] ?? (byPan.length === 1 ? byPan[0] : undefined) ?? (byName.length === 1 ? byName[0] : undefined);
    if (!vendor) return result(null, null, gstin ? `No vendor in the master has GSTIN ${gstin}.` : 'The vendor could not be found in the master.');
    const masterNote = !byGstin.length && byPan[0] === vendor ? `${vendor.name}'s GSTIN in the vendor master is ${vendor.gstin}, which differs from the invoice's ${gstin} in its last character; ${gstinChecksumOk(gstin!) ? 'the invoice\'s is the valid one, so correct the master' : 'check which is right'}.` : null;
    const withNote = (note: string | null) => [masterNote, note].filter(Boolean).join(' ') || null;
    const orders = (await this.purchaseOrders.list(user, { vendorId: vendor.id, status: 'APPROVED', pageSize: 50, sortBy: 'poDate', sortOrder: 'desc' } as never)).items;
    if (!orders.length) return result(null, { id: vendor.id, name: vendor.name }, withNote(`${vendor.name} has no approved purchase order you can see.`));
    const poNo = readText(read.fields.poNo);
    const printed = poNo ? orders.find((o) => norm(o.poNo) === norm(poNo) || norm(o.poNo).endsWith(norm(poNo))) : undefined;
    if (printed) return result(scoreOf(printed), { id: vendor.id, name: vendor.name }, withNote(null));
    // Most alike first; among equals the order with more received and not yet billed, then the newest.
    const pending = (po: PurchaseOrderDto) => po.lines.reduce((s, l) => s + Math.max(0, Number(l.receivedQty) - Number(l.billedQty)), 0);
    const ranked = orders.map(scoreOf).sort((a, b) => b.score - a.score || pending(b.po) - pending(a.po));
    const best = ranked[0];
    if (!best.score) return result(null, { id: vendor.id, name: vendor.name }, withNote(`None of ${vendor.name}'s orders has items like the invoice's.`));
    return result(best, { id: vendor.id, name: vendor.name }, withNote(ranked.length > 1 ? `Picked ${best.po.poNo}, the order whose items are most like the invoice's; change it if it is another.` : null));
  }
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** A name without case, punctuation or the words every office has: "The Executive Engineer, PWD" ~ "executive engineer pwd". */
const normName = (s: string) => s.toLowerCase().replace(/\bthe\b/g, '').replace(/[^a-z0-9]/g, '');

/** The JSON object in the model's reply, allowing for a code fence or a sentence around it. */
export function parseReply(text: string): { fields: Record<string, unknown>; lines: unknown[] } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { fields?: unknown; lines?: unknown };
    if (!v || typeof v !== 'object' || !v.fields || typeof v.fields !== 'object') return null;
    return { fields: v.fields as Record<string, unknown>, lines: Array.isArray(v.lines) ? v.lines : [] };
  } catch {
    return null;
  }
}

/**
 * Each expected field as a typed value with where it was; then the checks that do not need the model: a GSTIN's check
 * character, each line's amount against its quantity and rate, the lines against the subtotal, the taxes and freight
 * against the total. A figure that fails is marked low, with why.
 */
export function normalise(kind: DocReadKind, raw: { fields: Record<string, unknown>; lines: unknown[] }, pageCount: number): { fields: Record<string, DocReadField>; lines: DocReadLine[] } {
  const fields = Object.fromEntries(DOC_READ_FIELDS[kind].map((k) => [k, field(k, raw.fields[k], pageCount)]));
  const lines = DOC_READ_LINE_FIELDS[kind].length
    ? raw.lines
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
        .map((l) => Object.fromEntries(DOC_READ_LINE_FIELDS[kind].map((k) => [k, field(k, l[k], pageCount)])) as DocReadLine)
        .filter((l) => readText(l.description))
        .slice(0, DOC_READ_MAX_LINES[kind])
    : [];

  const gstin = fields.gstin;
  if (gstin && typeof gstin.value === 'string') {
    const fixed = fixGstin(gstin.value);
    if (fixed !== gstin.value && gstinChecksumOk(fixed)) {
      gstin.reason = `read as ${gstin.value}; a look-alike character put right by the GSTIN's pattern and check character`;
      gstin.value = fixed;
    }
    if (!/^\d{2}[A-Z0-9]{13}$/.test(gstin.value)) low(gstin, 'not 15 characters like a GSTIN');
    else if (!gstinChecksumOk(gstin.value)) low(gstin, 'check character does not match; a character may be misread');
  }
  const vehicle = fields.vehicleNo;
  if (vehicle && typeof vehicle.value === 'string') {
    const fixed = fixVehicleNo(vehicle.value);
    if (fixed !== vehicle.value) {
      vehicle.reason = `read as ${vehicle.value}; the RTO number is digits`;
      vehicle.value = fixed;
    }
  }
  if (kind === 'workOrder') {
    const start = readText(fields.startDate);
    const end = readText(fields.completionDate);
    if (start && end && end <= start) low(fields.completionDate, 'not after the start date');
    const value = readNumber(fields.contractValue);
    if (value !== null && value < 1000) low(fields.contractValue, 'too small for a contract value; it may be in lakh or crore');
    const months = readNumber(fields.durationMonths);
    if (months !== null && (months <= 0 || months > 120 || !Number.isInteger(months))) low(fields.durationMonths, 'not a whole number of months');
  }
  if (kind !== 'invoice' && kind !== 'boq') return { fields, lines };

  for (const l of lines) {
    const q = readNumber(l.quantity);
    const r = readNumber(l.rate);
    const a = readNumber(l.amount);
    // A BOQ prints its amounts rounded to the rupee, or to the hundred on a long one.
    const tolerance = kind === 'boq' && a !== null ? Math.max(TOLERANCE, Math.abs(a) * 0.005) : TOLERANCE;
    if (q !== null && r !== null && a !== null && Math.abs(q * r - a) > tolerance) for (const f of [l.quantity, l.rate, l.amount]) low(f, 'quantity × rate is not the amount');
  }
  if (kind === 'boq') return { fields, lines };
  const amounts = lines.map((l) => readNumber(l.amount));
  const linesSum = amounts.length && amounts.every((a) => a !== null) ? Math.round(amounts.reduce((s: number, a) => s + a!, 0) * 100) / 100 : null;
  // A kachha bill prints only its lines, one GST figure and the total: what is not printed is worked out, and says so.
  if (readNumber(fields.subtotal) === null && linesSum !== null) fields.subtotal = worked(linesSum, 'not printed; the sum of the lines');
  const subtotal = readNumber(fields.subtotal);
  if (subtotal !== null && linesSum !== null && Math.abs(linesSum - subtotal) > TOLERANCE) low(fields.subtotal, 'the lines do not add up to it');
  const total = readNumber(fields.total);
  if (total !== null && subtotal !== null && ['cgst', 'sgst', 'igst'].every((k) => readNumber(fields[k]) === null)) {
    const tax = Math.round((total - subtotal - (readNumber(fields.freight) ?? 0)) * 100) / 100;
    if (tax > TOLERANCE) {
      fields.cgst = worked(Math.round(tax * 50) / 100, 'not printed apart; half the GST, worked out from the total');
      fields.sgst = worked(Math.round((tax - readNumber(fields.cgst)!) * 100) / 100, 'not printed apart; half the GST, worked out from the total');
    }
  }
  if (total !== null && subtotal !== null) {
    const sum = subtotal + ['cgst', 'sgst', 'igst', 'freight'].reduce((s, k) => s + (readNumber(fields[k]) ?? 0), 0);
    // Invoices round the total to the rupee.
    if (Math.abs(sum - total) > TOLERANCE) low(fields.total, 'subtotal, GST and freight do not add up to it');
  }
  return { fields, lines };
}

const TO_DIGIT: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' };

/**
 * A GSTIN with look-alike characters put right where its pattern allows only digits or only letters (state code,
 * PAN, entity number, the Z), and a check character read as its look-alike when the computed one is that look-alike:
 * "21AAKFK4521B1ZO" → "21AAKFK4521B1Z0". The caller keeps the result only when its check character then agrees.
 */
export function fixGstin(g: string): string {
  if (g.length !== 15) return g;
  const c = g.split('');
  const digits = [0, 1, 7, 8, 9, 10];
  const letters = [2, 3, 4, 5, 6, 11];
  for (const i of digits) c[i] = TO_DIGIT[c[i]] ?? c[i];
  for (const i of letters) c[i] = TO_LETTER[c[i]] ?? c[i];
  if (c[13] === '2') c[13] = 'Z';
  const head = c.slice(0, 14).join('');
  const want = gstinCheckChar(head);
  if (want && want !== c[14] && (TO_DIGIT[c[14]] === want || TO_LETTER[c[14]] === want)) c[14] = want;
  return c.join('');
}

/** A vehicle number's RTO code is digits: "ODO2 BT 9087" → "OD02 BT 9087". */
export function fixVehicleNo(v: string): string {
  const m = v.match(/^([A-Z]{2})(\s*-?\s*)([0-9A-Z]{2})((?![0-9]).*)$/i);
  if (!m) return v;
  const rto = m[3].toUpperCase().split('').map((ch) => TO_DIGIT[ch] ?? ch).join('');
  return /^\d{2}$/.test(rto) ? `${m[1]}${m[2]}${rto}${m[4]}` : v;
}

/** A figure not printed but worked out from those that are: no place on the page, and the reason says how. */
function worked(value: number, reason: string): DocReadField {
  return { value, confidence: 'high', reason, page: null, box: null };
}

function low(f: DocReadField | undefined, reason: string) {
  if (!f || f.value === null) return;
  f.confidence = 'low';
  f.reason = f.reason ?? reason;
}

function field(name: string, raw: unknown, pageCount: number): DocReadField {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : { value: raw };
  const value = valueOf(name, o.value);
  const page = typeof o.page === 'number' && o.page >= 1 && o.page <= pageCount ? Math.floor(o.page) : value === null ? null : 1;
  const box = boxOf(o.box);
  const unreadable = o.value !== null && o.value !== undefined && o.value !== '' && value === null;
  return {
    value,
    confidence: o.confidence === 'low' || unreadable ? 'low' : 'high',
    reason: unreadable ? 'could not be read as a figure or date' : o.confidence === 'low' ? 'hard to read' : null,
    page: value === null ? null : page,
    box: value === null ? null : box,
  };
}

function valueOf(name: string, v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (NUMBER_FIELDS.has(name)) return toNumber(v);
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (DATE_FIELDS.has(name)) return toDate(s);
  if (name === 'gstin') return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.slice(0, 300);
}

const DEVANAGARI = '०१२३४५६७८९';

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = [...v].map((c) => (DEVANAGARI.includes(c) ? String(DEVANAGARI.indexOf(c)) : c)).join('').replace(/[₹,\s%]|rs\.?|inr/gi, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** YYYY-MM-DD from what the model gave: already ISO, or day first with digits or a month name. */
export function toDate(s: string): string | null {
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  const named = s.match(/^(\d{1,2})[\s.-]*([A-Za-z]{3})[A-Za-z]*[\s.,-]*(\d{2,4})$/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (named && MONTHS.includes(named[2].toLowerCase())) [d, m, y] = [Number(named[1]), MONTHS.indexOf(named[2].toLowerCase()) + 1, Number(named[3])];
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function boxOf(v: unknown): DocReadField['box'] {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [l, t, r, b] = (v as number[]).map((n) => Math.max(0, Math.min(1000, Math.round(n))));
  return l < r && t < b ? [l, t, r, b] : null;
}
