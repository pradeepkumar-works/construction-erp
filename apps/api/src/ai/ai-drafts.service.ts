import { BadRequestException, Injectable } from '@nestjs/common';
import type { AiDraftDto, AiDraftKind, ProjectSummary } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GST_RATES, MANPOWER_CATEGORIES, MATERIAL_PRIORITIES, PAYMENT_MODES, WEATHER_OPTIONS, extraByLabel, itemSimilarity, normUnit, ownFieldsOf, readExtra } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { todayIn } from '../notifications/time';
import { ProjectsService } from '../projects/projects.service';
import { StockService } from '../stock/stock.service';
import { UnitsService } from '../units/units.service';
import { PlanningService } from '../planning/planning.service';
import { DprService } from '../dpr/dpr.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';

type Input = Record<string, unknown>;
type Flag = AiDraftDto['flags'][number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An item or activity at least this alike is taken as the one meant. */
const MATCH = 0.5;

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const date = (v: unknown, name: string) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !DATE.test(v) || Number.isNaN(Date.parse(v))) throw new BadRequestException(`${name} must be YYYY-MM-DD`);
  return v;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
  const k = typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]+/g, '_') : '';
  return (allowed as readonly string[]).includes(k) ? (k as T) : undefined;
};
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Drafts from a sentence (AI item 71). Each method checks what the model took out of the user's words (a material
 * request, an expense, a progress entry, a DPR, a letter), matches names to the company's own masters (projects, items,
 * units, activities) through the services the forms use, and returns the form's values with what to check. Nothing is
 * written: the user opens the draft in its form and saves it there.
 */
@Injectable()
export class AiDraftsService {
  constructor(
    private projects: ProjectsService,
    private stock: StockService,
    private units: UnitsService,
    private planning: PlanningService,
    private dpr: DprService,
    private raBills: RaBillsService,
  ) {}

  /** The project the user meant: an id from list_projects or the page, or a name or code the user wrote. */
  async project(user: RequestUser, i: Input): Promise<ProjectSummary> {
    if (typeof i.projectId === 'string' && UUID.test(i.projectId)) return this.projects.get(user, i.projectId);
    const all = (await this.projects.list(user, { page: 1, pageSize: 100 } as never)).items;
    const wanted = text(i.project, 100);
    const open = all.filter((p) => p.status === 'ACTIVE' || p.status === 'PLANNED');
    if (!wanted) {
      if (open.length === 1) return open[0];
      throw new BadRequestException(`Which project? Ask the user, or pass projectId. Their projects: ${all.map((p) => `${p.code} ${p.name} (id ${p.id})`).join('; ')}`);
    }
    const code = all.find((p) => p.code.toLowerCase() === wanted.toLowerCase());
    if (code) return code;
    const scored = all.map((p) => ({ p, s: itemSimilarity(wanted, `${p.code} ${p.name} ${p.clientName ?? ''} ${p.location ?? ''}`) })).sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s >= MATCH && (scored.length === 1 || scored[0].s > scored[1].s)) return scored[0].p;
    throw new BadRequestException(`No single project matches "${wanted}". Ask the user which one: ${all.map((p) => `${p.code} ${p.name} (id ${p.id})`).join('; ')}`);
  }

  private draft(kind: AiDraftKind, project: ProjectSummary, title: string, values: Record<string, unknown>, flags: Flag[]) {
    const draft: AiDraftDto = { kind, title, projectId: project.id, projectName: project.name, values: { projectId: project.id, ...values }, flags };
    return { draft, note: 'Drafted, not saved. The user opens it from your answer, checks it and saves it. Say in a line what you filled and what to check.' };
  }

  private when(v: unknown, name: string, fallback: string, flags: Flag[], field: string, past: 'past' | 'future') {
    const today = todayIn();
    const d = date(v, name) ?? fallback;
    if (past === 'past' && d > today) throw new BadRequestException(`${name} cannot be after today (${today})`);
    if (past === 'future' && d < today) flags.push({ field, note: `${longDate(d)} has passed` });
    return d;
  }

  async materialRequest(user: RequestUser, i: Input) {
    const project = await this.project(user, i);
    const flags: Flag[] = [];
    const raw = Array.isArray(i.items) ? (i.items as Input[]).slice(0, 30) : [];
    if (!raw.length) throw new BadRequestException('items: at least one item with name, quantity and unit');
    const unitMaster = await this.units.list(user);
    const items = [];
    for (const [n, line] of raw.entries()) {
      const name = text(line.name, 200);
      const quantity = num(line.quantity);
      if (!name) throw new BadRequestException(`items[${n}].name is required`);
      if (quantity === undefined || quantity <= 0) throw new BadRequestException(`items[${n}].quantity must be a number above 0`);
      const spec = text(line.specification, 200);
      const said = text(line.unit, 30);
      // Two lines are two items: one already matched is not offered again.
      const match = await this.matchItem(user, [name, spec].filter(Boolean).join(' '), said, new Set(items.map((x) => x.itemName)));
      // A known item keeps the item master's unit, as stores receive it; anything else takes the unit master's spelling.
      let unit = match?.unit ?? said;
      if (match && said && normUnit(said) !== normUnit(match.unit)) {
        unit = said;
        flags.push({ field: `items.${n}.unit`, note: `${match.name} is kept in ${match.unit} in the item master; you said ${said}` });
      }
      if (!match) {
        flags.push({ field: `items.${n}.itemName`, note: `"${name}" is not in the item master; check the name` });
        const known = unit ? unitMaster.find((u) => normUnit(u.code) === normUnit(unit) || normUnit(u.name) === normUnit(unit)) : undefined;
        if (known) unit = known.code;
        else if (unit) flags.push({ field: `items.${n}.unit`, note: `${unit} is not in the unit master` });
      }
      if (!unit) flags.push({ field: `items.${n}.unit`, note: `No unit given for ${match?.name ?? name}` });
      items.push({ itemName: match?.name ?? name, specification: spec, unit: unit ?? 'Nos', quantity });
    }
    const requiredDate = this.when(i.requiredDate, 'requiredDate', addDays(todayIn(), 7), flags, 'requiredDate', 'future');
    if (i.requiredDate === undefined || i.requiredDate === '') flags.push({ field: 'requiredDate', note: 'No date given; set to a week from today' });
    const priority = pick(i.priority, MATERIAL_PRIORITIES) ?? 'NORMAL';
    const title = `Indent for ${project.name}: ${items.length === 1 ? `${items[0].quantity} ${items[0].unit} ${items[0].itemName}` : plural(items.length, 'item')}, needed by ${longDate(requiredDate)}`;
    return this.draft('material-request', project, title, { requiredDate, priority, remarks: text(i.remarks, 1000), items }, flags);
  }

  /** The item master entry most like `name`, or null when none is alike enough. */
  private async matchItem(user: RequestUser, name: string, unit?: string, taken: Set<string> = new Set()): Promise<{ name: string; unit: string } | null> {
    const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 || /\d/.test(w)).slice(0, 4);
    const seen = new Map<string, { name: string; unit: string }>();
    for (const q of words.length ? words : [name]) {
      for (const it of (await this.stock.listItems(user, { q, page: 1, pageSize: 20 } as never)).items) if (!taken.has(it.name)) seen.set(it.id, it);
    }
    // A tie ("bitumen emulsion" is as like "Bitumen VG-30" as "Emulsion SS-1") goes to the item kept in the unit said.
    const rank = (it: { name: string; unit: string }) => ({ it, s: itemSimilarity(name, it.name), unit: !!unit && normUnit(unit) === normUnit(it.unit) ? 1 : 0 });
    const best = [...seen.values()].map(rank).sort((a, b) => b.s - a.s || b.unit - a.unit)[0];
    return best && best.s >= MATCH ? best.it : null;
  }

  async expense(user: RequestUser, i: Input) {
    const project = await this.project(user, i);
    const flags: Flag[] = [];
    const amount = num(i.amount);
    if (amount === undefined || amount <= 0) throw new BadRequestException('amount must be a number above 0, in rupees');
    const description = text(i.description, 300);
    if (!description) throw new BadRequestException('description is required');
    const category = pick(i.category, EXPENSE_CATEGORIES);
    if (!category) flags.push({ field: 'category', note: 'Category not clear; set to Other' });
    const paymentMode = pick(i.paymentMode, PAYMENT_MODES);
    if (!paymentMode) flags.push({ field: 'paymentMode', note: 'How it was paid was not said; set to cash' });
    let gstRate = num(i.gstRate) ?? 0;
    if (!(GST_RATES as readonly number[]).includes(gstRate)) {
      flags.push({ field: 'gstRate', note: `GST of ${gstRate}% is not a GST rate; set to 0` });
      gstRate = 0;
    }
    const d = this.when(i.date, 'date', todayIn(), flags, 'date', 'past');
    // The form takes the value before GST; people say what they paid.
    const taxable = gstRate ? Math.round((amount * 10000) / (100 + gstRate)) / 100 : amount;
    const values = { date: d, category: category ?? 'OTHER', description, vendor: text(i.vendor, 200), billNo: text(i.billNo, 60), amount: taxable, gstRate, paymentMode: paymentMode ?? 'CASH', remarks: text(i.remarks, 1000) };
    return this.draft('expense', project, `Site expense on ${project.name}: ${inr(amount)} for ${EXPENSE_CATEGORY_LABELS[values.category].toLowerCase()}, ${longDate(d)}`, values, flags);
  }

  async progress(user: RequestUser, i: Input) {
    const project = await this.project(user, i);
    const flags: Flag[] = [];
    const quantity = num(i.quantity);
    if (quantity === undefined || quantity <= 0) throw new BadRequestException('quantity must be a number above 0');
    const wanted = text(i.activity, 200);
    if (!wanted) throw new BadRequestException('activity is required: the work done, as the user named it');
    const activities = await this.planning.listActivities(user, project.id);
    const best = activities.map((a) => ({ a, s: Math.max(itemSimilarity(wanted, a.name), a.boqItemNo && wanted.includes(a.boqItemNo) ? 1 : 0) })).sort((x, y) => y.s - x.s)[0];
    const activity = best && best.s >= MATCH ? best.a : null;
    if (!activity) flags.push({ field: 'activityId', note: `No activity on this project matches "${wanted}"; pick it` });
    else {
      const said = text(i.unit, 30);
      if (said && normUnit(said) !== normUnit(activity.unit)) flags.push({ field: 'quantity', note: `${activity.name} is measured in ${activity.unit}; you said ${said}` });
      const left = Number(activity.plannedQty) - Number(activity.executedQty);
      if (Number(activity.plannedQty) > 0 && quantity > left) flags.push({ field: 'quantity', note: `More than the ${left.toLocaleString('en-IN')} ${activity.unit} left of ${activity.plannedQty} planned` });
    }
    const d = this.when(i.date, 'date', todayIn(), flags, 'date', 'past');
    const manpowerCount = num(i.manpowerCount);
    const values = { activityId: activity?.id, date: d, quantity, location: text(i.location, 200), manpowerCount: manpowerCount && manpowerCount > 0 ? Math.round(manpowerCount) : undefined, remarks: text(i.remarks, 1000) };
    const what = activity ? `${quantity} ${activity.unit} of ${activity.name}` : `${quantity} of ${wanted}`;
    return this.draft('progress', project, `Progress on ${project.name}: ${what}, ${longDate(d)}`, values, flags);
  }

  async dailyReport(user: RequestUser, i: Input) {
    const project = await this.project(user, i);
    const flags: Flag[] = [];
    const workExecuted = text(i.workExecuted, 4000);
    if (!workExecuted) throw new BadRequestException('workExecuted is required: the work done that day, from the notes');
    const d = this.when(i.date, 'date', todayIn(), flags, 'date', 'past');
    const already = await this.dpr.list(user, { projectId: project.id, from: d, to: d, page: 1, pageSize: 1 } as never);
    if (already.total) flags.push({ field: 'date', note: `${project.name} already has a DPR for ${longDate(d)}` });
    const manpower = (Array.isArray(i.manpower) ? (i.manpower as Input[]) : [])
      .map((m) => ({ category: manpowerCategory(text(m.category, 60)), count: Math.round(num(m.count) ?? 0) }))
      .filter((m): m is { category: string; count: number } => !!m.category && m.count > 0)
      .slice(0, 20);
    const machinery = (Array.isArray(i.machinery) ? (i.machinery as Input[]) : [])
      .map((m) => ({ name: text(m.name, 100), hours: num(m.hours) ?? 0 }))
      .filter((m): m is { name: string; hours: number } => !!m.name && m.hours >= 0 && m.hours <= 24)
      .slice(0, 20);
    const weather = pick(i.weather, WEATHER_OPTIONS);
    // Figures the notes give for the form's own fields (item 134 part 2), by the names the form gives them.
    const form = await this.dpr.formFor(user, project.id);
    const named = i.ownFields && typeof i.ownFields === 'object' && !Array.isArray(i.ownFields) ? (i.ownFields as Record<string, unknown>) : {};
    const dayFields = ownFieldsOf(form.def, 'DAY');
    const { values: extra, problems } = readExtra(dayFields, extraByLabel(dayFields, named));
    for (const p of problems) flags.push({ field: 'extra', note: p });
    for (const name of Object.keys(named)) if (!Object.keys(extraByLabel(dayFields, { [name]: true })).length) flags.push({ field: 'extra', note: `${name} is not a field of this project's DPR form` });
    const values = {
      date: d,
      weather,
      siteCondition: text(i.siteCondition, 200),
      manpower: manpower.length ? manpower : undefined,
      machinery: machinery.length ? machinery : undefined,
      materialReceived: text(i.materialReceived, 2000),
      workExecuted,
      testsConducted: text(i.testsConducted, 2000),
      safetyObservations: text(i.safetyObservations, 2000),
      issues: text(i.issues, 2000),
      nextDayPlan: text(i.nextDayPlan, 2000),
      extra: Object.keys(extra).length ? extra : undefined,
    };
    const people = manpower.reduce((s, m) => s + m.count, 0);
    return this.draft('dpr', project, `DPR for ${project.name}, ${longDate(d)}${people ? `: ${plural(people, 'worker')}` : ''}`, values, flags);
  }

  async letter(user: RequestUser, i: Input) {
    const project = await this.project(user, i);
    const flags: Flag[] = [];
    const billId = typeof i.raBillId === 'string' && UUID.test(i.raBillId) ? i.raBillId : undefined;
    const bill = billId ? await this.raBills.get(user, billId) : null;
    if (bill && bill.projectId !== project.id) throw new BadRequestException('That RA bill is on another project');
    const party = text(i.party, 200) ?? bill?.client?.name ?? project.clientName ?? undefined;
    if (!party) flags.push({ field: 'party', note: 'Who the letter is to was not said' });
    const subject = text(i.subject, 300) ?? (bill ? `Submission of ${bill.billLabel} for ${project.name}` : undefined);
    if (!subject) throw new BadRequestException('subject is required');
    const body = text(i.body, 3000);
    const cover = bill ? coverNote(bill, project.name) : null;
    // The letter's text (Correspondence, item 136): printed on the letterhead once its signatory approves it.
    const letterBody = [cover, body].filter(Boolean).join('\n\n').slice(0, 20000) || undefined;
    if (!letterBody) flags.push({ field: 'body', note: 'Nothing was given for the body' });
    const letterDate = todayIn();
    const values = { direction: 'OUT', letterDate, party, subject, body: letterBody, inReplyToId: typeof i.inReplyToId === 'string' && UUID.test(i.inReplyToId) ? i.inReplyToId : undefined };
    const out = this.draft('letter', project, `Letter to ${party ?? 'the client'}: ${subject}`, values, flags);
    // The bill's own figures, so the answer and the grounding check can see where the letter's numbers came from.
    return bill ? { ...out, bill: { billLabel: bill.billLabel, agreementNo: bill.agreementNo, agreementDate: bill.agreementDate, gstRate: bill.gstRate, billDate: bill.billDate, measuredUpTo: bill.measuredUpTo, grossAmount: bill.grossAmount, pvAmount: bill.pvAmount, gstAmount: bill.gstAmount, totalDeductions: bill.totalDeductions, netPayable: bill.netPayable, grossUpto: bill.grossUpto, href: `/bills/${bill.id}` } } : out;
  }
}

/** "masons", "bar bender" → the DPR's own category names; anything else as written. */
function manpowerCategory(said: string | undefined): string | undefined {
  if (!said) return said;
  const k = said.toLowerCase().replace(/s$/, '');
  return MANPOWER_CATEGORIES.find((c) => c.toLowerCase() === k) ?? said;
}

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** An RA bill's covering letter from its own figures. */
export function coverNote(
  b: { billLabel: string; billDate: string; measuredUpTo: string; agreementNo: string | null; agreementDate: string | null; grossAmount: string; pvAmount: string; gstRate: string; gstAmount: string; totalDeductions: string; netPayable: string; grossUpto: string },
  projectName: string,
): string {
  const agreement = b.agreementNo ? ` under agreement ${b.agreementNo}${b.agreementDate ? ` dated ${longDate(b.agreementDate)}` : ''}` : '';
  const lines = [
    `We submit herewith ${b.billLabel} dated ${longDate(b.billDate)} for ${projectName}${agreement}, for work measured up to ${longDate(b.measuredUpTo)}.`,
    '',
    `Value of work in this bill: ${inr(b.grossAmount)}`,
    ...(Number(b.pvAmount) ? [`Price variation: ${inr(b.pvAmount)}`] : []),
    ...(Number(b.gstAmount) ? [`GST at ${Number(b.gstRate)}%: ${inr(b.gstAmount)}`] : []),
    ...(Number(b.totalDeductions) ? [`Deductions: ${inr(b.totalDeductions)}`] : []),
    `Net payable: ${inr(b.netPayable)}`,
    `Value of work done to date: ${inr(b.grossUpto)}`,
    '',
    'The abstract and measurement sheets are enclosed. We request you to certify the bill and release the payment at the earliest.',
  ];
  return lines.join('\n');
}
