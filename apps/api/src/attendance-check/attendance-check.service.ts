import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  HEADCOUNT_GAP_MIN,
  HEADCOUNT_GAP_PCT,
  NO_PUNCH_MIN,
  canSeeAttendanceCheck,
  canSeeAttendanceNames,
  isManDayUnit,
  manDays,
  type AttendanceBillDto,
  type AttendanceBillLineDto,
  type AttendanceCheckDto,
  type AttendanceCrewDayDto,
  type AttendanceCheckDayDto,
  type AttendanceFlagDto,
  type AttendanceSourcesDto,
  type AttendanceWorkerDto,
  type SubmissionStatus,
} from '@erp/shared';
import type { Prisma } from '@prisma/client';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../notifications/time';
import { monthSpan } from '../leakage/leakage-rules';
import { billExcess, billSpan, daysOf, dprManpower, headGap, normName, normTrade, plural, tradeOf, unpunched } from './attendance-check-rules';

type Project = { id: string; name: string };

interface RollRow {
  worker: AttendanceWorkerDto & { dailyWage: number };
  crew: string;
  crewName: string;
  trade: string;
  manDays: number;
  present: boolean;
  enrolled: boolean;
  punched: boolean;
}

interface SheetLine {
  crew: string;
  crewName: string;
  trade: string;
  count: number;
}

/** What the site recorded over a span, by project and day ("<projectId>|<date>"). */
interface Facts {
  crewOf: (vendorId: string | null, name: string) => string;
  sheets: Map<string, { id: string; total: number; lines: SheetLine[] }>;
  roll: Map<string, RollRow[]>;
  /** Days a device at the site took any punch */
  deviceUp: Set<string>;
  /** Projects with a biometric device */
  devices: Set<string>;
  /** Workers who punched at the site that day: "<projectId>|<date>" → worker ids */
  punchedBy: Map<string, Set<string>>;
  dprs: Map<string, { id: string; manpower: number | null }>;
  rates: Map<string, number>;
}

const key = (projectId: string, date: string) => `${projectId}|${date}`;
const n = (v: Prisma.Decimal | number | string | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const span = (from: string, to: string) => (from === to ? day(from) : `${day(from)} to ${day(to)}`);
const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const sources = (s: AttendanceSourcesDto) =>
  [
    `head count ${s.headCount === null ? 'not kept' : plural(s.headCount, 'man-day')}`,
    `roll call ${s.rollCall === null ? 'not kept' : plural(s.rollCall, 'man-day')}`,
    `punched ${s.punched === null ? 'no device' : plural(s.punched, 'man-day')}`,
  ].join(', ');

type BillRow = Prisma.SubcontractBillGetPayload<{
  include: { project: { select: { id: true; name: true } }; workOrder: { select: { id: true; woNo: true; woDate: true; startDate: true; vendorId: true; vendor: { select: { name: true } } } }; lines: { include: { workOrderLine: true } } };
}>;
const billInclude = {
  project: { select: { id: true, name: true } },
  workOrder: { select: { id: true, woNo: true, woDate: true, startDate: true, vendorId: true, vendor: { select: { name: true } } } },
  lines: { include: { workOrderLine: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.SubcontractBillInclude;

/**
 * Attendance cross-check (ARCHITECTURE "Attendance cross-check"): labour contractors' man-day bills against
 * the head-count sheet, the named roll call and the biometric punches over the bill's days, and each day's records
 * against each other and the DPR. The page is for HR and approvers (`canSeeAttendanceCheck`) and names workers only to
 * HR and the project manager; the bill check (`forBill`) and the watch list's MANDAYS_ABOVE read the same figures.
 */
@Injectable()
export class AttendanceCheckService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
  ) {}

  async get(user: RequestUser, month?: string, projectId?: string): Promise<AttendanceCheckDto> {
    if (!canSeeAttendanceCheck(user.roleKey)) throw new ForbiddenException('The attendance cross-check is for HR and those who approve site work');
    const today = todayIn();
    const m = month ?? today.slice(0, 7);
    const { from, to } = monthSpan(m, today);
    const projects = await this.projects(user, projectId);
    const ids = projects.map((p) => p.id);
    const names = canSeeAttendanceNames(user.roleKey);
    const facts = await this.load(user.organizationId, ids, from, to);
    const flags = this.dayFlags(facts, projects, from, to, names);
    const bills = await this.billChecks(user.organizationId, await this.prisma.subcontractBill.findMany({ where: { projectId: { in: ids }, status: { not: 'REJECTED' }, measuredUpTo: { gte: parseDate(from), lte: parseDate(to) } }, include: billInclude, orderBy: { measuredUpTo: 'desc' } }));
    flags.push(...bills.flatMap((b) => this.billFlags(b)));
    flags.sort((a, b) => (b.valueInr ?? 0) - (a.valueInr ?? 0) || b.to.localeCompare(a.to));
    return { month: m, from, to, projects: projects.length, flags, bills, days: projectId && ids.length ? this.dayRows(facts, ids[0], from, to) : [], namesShown: names };
  }

  /** A subcontractor bill's man-day lines against the records (for the bill's checks); null when it has none. */
  async forBill(organizationId: string, billId: string): Promise<AttendanceBillDto | null> {
    const bill = await this.prisma.subcontractBill.findFirst({ where: { id: billId, organizationId }, include: billInclude });
    if (!bill) return null;
    return (await this.billChecks(organizationId, [bill]))[0] ?? null;
  }

  /** Bills waiting for approval whose man-days run above the records, for the watch list. */
  async waitingBills(user: RequestUser): Promise<AttendanceBillDto[]> {
    const projects = await this.projects(user);
    const bills = await this.prisma.subcontractBill.findMany({ where: { projectId: { in: projects.map((p) => p.id) }, status: 'SUBMITTED' }, include: billInclude, orderBy: { billDate: 'asc' } });
    return (await this.billChecks(user.organizationId, bills)).filter((b) => b.lines.some((l) => l.flagged));
  }

  private projects(user: RequestUser, projectId?: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      // A store or a plant keeps no site labour of its own.
      where: { AND: [this.access.projectWhere(user), { type: { notIn: ['STORE', 'PLANT'] } }, ...(projectId ? [{ id: projectId }] : [])] },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  private async load(organizationId: string, projectIds: string[], from: string, to: string): Promise<Facts> {
    const range = { gte: parseDate(from), lte: parseDate(to) };
    const where = { projectId: { in: projectIds }, date: range };
    const [vendors, sheets, roll, devices, dprs, rates] = await Promise.all([
      this.prisma.vendor.findMany({ where: { organizationId }, select: { id: true, name: true } }),
      this.prisma.attendanceSheet.findMany({ where, include: { lines: true } }),
      this.prisma.workerAttendance.findMany({ where, include: { worker: { select: { id: true, workerNo: true, name: true, contractor: true, vendorId: true, trade: true, dailyWage: true } } } }),
      this.prisma.biometricDevice.findMany({ where: { organizationId, projectId: { in: projectIds } }, select: { id: true, projectId: true } }),
      this.prisma.dailyReport.findMany({ where: { ...where, status: { not: 'DRAFT' } }, select: { id: true, projectId: true, date: true, manpower: true } }),
      this.prisma.labourRate.findMany({ where: { organizationId }, select: { category: true, dailyRate: true } }),
    ]);
    const byName = new Map(vendors.map((v) => [normName(v.name), v.id]));
    const crewOf = (vendorId: string | null, name: string) => vendorId ?? byName.get(normName(name)) ?? `name:${normName(name)}`;
    const [pins, punches] = await Promise.all([
      this.prisma.biometricUser.findMany({ where: { organizationId, workerId: { in: [...new Set(roll.map((r) => r.workerId))] } }, select: { pin: true, workerId: true } }),
      devices.length ? this.prisma.biometricPunch.findMany({ where: { deviceId: { in: devices.map((d) => d.id) }, date: range }, select: { deviceId: true, pin: true, date: true } }) : Promise.resolve([]),
    ]);
    const deviceProject = new Map(devices.map((d) => [d.id, d.projectId!]));
    const workerOfPin = new Map(pins.map((p) => [p.pin, p.workerId!]));
    const enrolled = new Set(pins.map((p) => p.workerId));
    const deviceUp = new Set<string>();
    const punchedBy = new Map<string, Set<string>>();
    for (const p of punches) {
      const k = key(deviceProject.get(p.deviceId)!, dateOnly(p.date));
      deviceUp.add(k);
      const w = workerOfPin.get(p.pin);
      if (!w) continue;
      if (!punchedBy.has(k)) punchedBy.set(k, new Set());
      punchedBy.get(k)!.add(w);
    }
    const facts: Facts = {
      crewOf,
      sheets: new Map(),
      roll: new Map(),
      deviceUp,
      devices: new Set(devices.map((d) => d.projectId!)),
      punchedBy,
      dprs: new Map(dprs.map((d) => [key(d.projectId, dateOnly(d.date)), { id: d.id, manpower: dprManpower(d.manpower) }])),
      rates: new Map(rates.map((r) => [normTrade(r.category), n(r.dailyRate)])),
    };
    for (const s of sheets)
      facts.sheets.set(key(s.projectId, dateOnly(s.date)), {
        id: s.id,
        total: s.totalWorkers,
        lines: s.lines.map((l) => ({ crew: crewOf(l.vendorId, l.contractor), crewName: l.contractor, trade: l.category, count: l.count })),
      });
    for (const r of roll) {
      const k = key(r.projectId, dateOnly(r.date));
      if (!facts.roll.has(k)) facts.roll.set(k, []);
      facts.roll.get(k)!.push({
        worker: { id: r.worker.id, workerNo: r.worker.workerNo, name: r.worker.name, dailyWage: n(r.worker.dailyWage) },
        crew: crewOf(r.worker.vendorId, r.worker.contractor),
        crewName: r.worker.contractor,
        trade: r.worker.trade,
        manDays: manDays(r.status),
        present: r.status !== 'ABSENT',
        enrolled: enrolled.has(r.workerId),
        punched: !!punchedBy.get(k)?.has(r.workerId),
      });
    }
    return facts;
  }

  /** A crew's (and trade's) records over a span; a record is null when the site did not keep it at all then. */
  private sourcesFor(f: Facts, projectId: string, crew: string, trade: string | null, from: string, to: string): AttendanceSourcesDto {
    const t = trade === null ? null : normTrade(trade);
    let sheets = 0;
    let headCount = 0;
    let rows = 0;
    let rollCall = 0;
    let punched = 0;
    let deviceDays = 0;
    for (const d of daysOf(from, to)) {
      const k = key(projectId, d);
      const sheet = f.sheets.get(k);
      if (sheet) {
        sheets++;
        for (const l of sheet.lines) if (l.crew === crew && (t === null || normTrade(l.trade) === t)) headCount += l.count;
      }
      if (f.deviceUp.has(k)) deviceDays++;
      for (const r of f.roll.get(k) ?? []) {
        if (r.crew !== crew || (t !== null && normTrade(r.trade) !== t)) continue;
        rows++;
        rollCall += r.manDays;
        if (r.punched) punched += r.manDays;
      }
    }
    return { headCount: sheets ? headCount : null, rollCall: rows ? rollCall : null, punched: rows && deviceDays ? punched : null };
  }

  private async billChecks(organizationId: string, bills: BillRow[]): Promise<AttendanceBillDto[]> {
    const withDays = bills.filter((b) => b.lines.some((l) => isManDayUnit(l.workOrderLine.unit) && n(l.thisQty) > 0));
    if (!withDays.length) return [];
    const earlier = await this.prisma.subcontractBill.findMany({
      where: { workOrderId: { in: [...new Set(withDays.map((b) => b.workOrderId))] }, status: { not: 'REJECTED' } },
      select: { workOrderId: true, billNo: true, measuredUpTo: true },
    });
    const spans = new Map(
      withDays.map((b) => {
        const prev = earlier
          .filter((e) => e.workOrderId === b.workOrderId && e.billNo < b.billNo)
          .map((e) => dateOnly(e.measuredUpTo))
          .sort()
          .pop();
        return [b.id, billSpan(prev ?? null, dateOnly(b.workOrder.startDate), dateOnly(b.workOrder.woDate), dateOnly(b.measuredUpTo))];
      }),
    );
    const all = [...spans.values()];
    const from = all.map((s) => s.from).sort()[0];
    const to = all.map((s) => s.to).sort().pop()!;
    const facts = await this.load(organizationId, [...new Set(withDays.map((b) => b.projectId))], from, to);
    return withDays.map((b) => {
      const s = spans.get(b.id)!;
      const crew = facts.crewOf(b.workOrder.vendorId, b.workOrder.vendor.name);
      const trades = new Set<string>();
      for (const d of daysOf(s.from, s.to)) {
        for (const l of facts.sheets.get(key(b.projectId, d))?.lines ?? []) if (l.crew === crew) trades.add(l.trade);
        for (const r of facts.roll.get(key(b.projectId, d)) ?? []) if (r.crew === crew) trades.add(r.trade);
      }
      const lines: AttendanceBillLineDto[] = b.lines
        .filter((l) => isManDayUnit(l.workOrderLine.unit) && n(l.thisQty) > 0)
        .map((l) => {
          const trade = tradeOf(l.workOrderLine.description, [...trades]);
          const src = this.sourcesFor(facts, b.projectId, crew, trade, s.from, s.to);
          const billed = n(l.thisQty);
          const x = billExcess(billed, src);
          const rate = n(l.rate);
          return { lineId: l.id, description: l.workOrderLine.description, trade, billed, rate: rate.toFixed(2), sources: src, supported: x.supported, excess: x.excess, excessInr: x.flagged ? Math.round(x.excess * rate * 100) / 100 : 0, flagged: x.flagged };
        });
      return {
        billId: b.id,
        label: `${b.workOrder.woNo} bill ${b.billNo}`,
        projectId: b.projectId,
        projectName: b.project.name,
        vendorName: b.workOrder.vendor.name,
        status: b.status as SubmissionStatus,
        from: s.from,
        to: s.to,
        lines,
        excessInr: Math.round(lines.reduce((t, l) => t + l.excessInr, 0) * 100) / 100,
      };
    });
  }

  private billFlags(b: AttendanceBillDto): AttendanceFlagDto[] {
    return b.lines
      .filter((l) => l.flagged)
      .map((l) => {
        const what = l.trade ? `${normTrade(l.trade)} man-days` : 'man-days';
        return {
          key: `bill:${b.billId}:${l.lineId}:${l.billed}:${l.supported ?? 'none'}`,
          kind: 'BILL_ABOVE' as const,
          projectId: b.projectId,
          projectName: b.projectName,
          from: b.from,
          to: b.to,
          contractor: b.vendorName,
          trade: l.trade,
          title:
            l.supported === null
              ? `${b.label} bills ${plural(l.billed, what.replace(/s$/, ''))} with no head count or roll call for those days`
              : `${b.label} bills ${plural(l.billed, what.replace(/s$/, ''))}; the records show at most ${l.supported}`,
          detail: `${b.vendorName}, ${span(b.from, b.to)}: ${sources(l.sources)}. Hold ${plural(l.excess, 'man-day')} (${inr(l.excessInr)}) until the contractor shows the muster; nothing is cut by itself.`,
          quantity: plural(l.excess, 'man-day'),
          valueInr: l.excessInr,
          working: [
            `Bill line: ${l.description}, ${plural(l.billed, 'man-day')} at ${inr(Number(l.rate))}`,
            `Days it covers: ${span(b.from, b.to)} (after the bill before it, or from the work order's start)`,
            `Head-count sheet for ${b.vendorName}${l.trade ? `, ${l.trade}` : ''}: ${l.sources.headCount === null ? 'none kept' : plural(l.sources.headCount, 'man-day')}`,
            `Named roll call: ${l.sources.rollCall === null ? 'none kept' : plural(l.sources.rollCall, 'man-day')}${l.sources.punched !== null ? `, of which punched on the site's device ${plural(l.sources.punched, 'man-day')}` : ''}`,
            `Supported: ${l.supported === null ? 'nothing' : `the higher of the head count and the roll call, ${l.supported}`}; above it: ${plural(l.excess, 'man-day')} × ${inr(Number(l.rate))} = ${inr(l.excessInr)}`,
          ],
          links: [
            { label: b.label, href: `/subcontract-bills/${b.billId}` },
            { label: 'Head count', href: `/attendance?sub=headcount` },
          ],
          workers: null,
          billId: b.billId,
        };
      });
  }

  private dayFlags(f: Facts, projects: Project[], from: string, to: string, names: boolean): AttendanceFlagDto[] {
    const out: AttendanceFlagDto[] = [];
    for (const p of projects) {
      for (const d of daysOf(from, to)) {
        const k = key(p.id, d);
        const sheet = f.sheets.get(k);
        const roll = f.roll.get(k) ?? [];
        const crews = new Map<string, { name: string; rows: RollRow[] }>();
        for (const r of roll) {
          if (!crews.has(r.crew)) crews.set(r.crew, { name: r.crewName, rows: [] });
          crews.get(r.crew)!.rows.push(r);
        }
        for (const [crew, c] of crews) {
          const miss = unpunched(f.deviceUp.has(k), c.rows);
          if (miss.flagged) {
            const value = miss.workers.reduce((t, w) => t + w.worker.dailyWage * w.manDays, 0);
            out.push({
              key: `nopunch:${p.id}:${d}:${crew}:${miss.workers.length}`,
              kind: 'NO_PUNCH',
              projectId: p.id,
              projectName: p.name,
              from: d,
              to: d,
              contractor: c.name,
              trade: null,
              title: `${plural(miss.workers.length, 'worker')} of ${c.name} on the roll call for ${day(d)} with no punch`,
              detail: `Others of the crew punched on the site's device that day, and these workers are enrolled on it, but none of their punches came in. Check whether they were on site before the day goes into the contractor's bill.`,
              quantity: plural(miss.workers.length, 'worker'),
              valueInr: Math.round(value),
              working: [
                `Roll call for ${day(d)}: ${c.rows.filter((r) => r.present).length} of ${c.name}'s workers marked present`,
                `Enrolled on a device: ${c.rows.filter((r) => r.present && r.enrolled).length}; punched: ${c.rows.filter((r) => r.present && r.punched).length}`,
                `Flagged from ${NO_PUNCH_MIN} in a crew on a day others of it punched; one forgotten punch is not a flag`,
                `At their daily wages: ${inr(value)}`,
              ],
              links: [{ label: 'Roll call', href: `/attendance?sub=rollcall` }],
              workers: names ? miss.workers.map((w) => ({ id: w.worker.id, workerNo: w.worker.workerNo, name: w.worker.name })) : null,
              billId: null,
            });
          }
          const head = sheet?.lines.filter((l) => l.crew === crew) ?? [];
          if (!head.length) continue;
          const hc = head.reduce((t, l) => t + l.count, 0);
          const heads = c.rows.filter((r) => r.present).length;
          const gap = headGap(hc, heads);
          if (!gap.flagged) continue;
          let value: number | null = 0;
          for (const t of new Set(head.map((l) => normTrade(l.trade)))) {
            const over = head.filter((l) => normTrade(l.trade) === t).reduce((s, l) => s + l.count, 0) - c.rows.filter((r) => r.present && normTrade(r.trade) === t).length;
            if (over <= 0) continue;
            const rate = f.rates.get(t);
            value = rate === undefined || value === null ? null : value + over * rate;
          }
          out.push({
            key: `head:${p.id}:${d}:${crew}:${hc}:${heads}`,
            kind: 'HEADCOUNT_ABOVE',
            projectId: p.id,
            projectName: p.name,
            from: d,
            to: d,
            contractor: c.name,
            trade: null,
            title: `${c.name}'s head count for ${day(d)} is ${hc}; the roll call names ${heads}`,
            detail: `The head-count sheet has ${plural(gap.gap, 'more worker')} than the named roll call for the same crew and day. The bill is paid on the head count, so check who the extra heads are.`,
            quantity: plural(gap.gap, 'worker'),
            valueInr: value === null ? null : Math.round(value),
            working: [
              `Head-count sheet: ${head.map((l) => `${l.trade} ${l.count}`).join(', ')}`,
              `Roll call, present or half day: ${heads}`,
              `Flagged from ${plural(Math.max(HEADCOUNT_GAP_MIN, Math.ceil((heads * HEADCOUNT_GAP_PCT) / 100)), 'head')} above the roll call`,
              value === null ? 'No labour rate set for every trade, so no rupee figure' : `At the labour rates: ${inr(value)} for the day`,
            ],
            links: [
              { label: 'Head count', href: `/attendance?sub=headcount` },
              { label: 'Roll call', href: `/attendance?sub=rollcall` },
            ],
            workers: null,
            billId: null,
          });
        }
        const dpr = f.dprs.get(k);
        if (sheet && dpr && dpr.manpower !== null) {
          const gap = headGap(sheet.total, dpr.manpower);
          if (gap.flagged)
            out.push({
              key: `dpr:${p.id}:${d}:${sheet.total}:${dpr.manpower}`,
              kind: 'DPR_GAP',
              projectId: p.id,
              projectName: p.name,
              from: d,
              to: d,
              contractor: 'All contractors',
              trade: null,
              title: `Head count for ${day(d)} is ${sheet.total}; the DPR reports ${dpr.manpower}`,
              detail: `The site's own report of the day has ${plural(gap.gap, 'fewer worker')} than the head-count sheet. One of the two is wrong, and the contractor is paid on the sheet.`,
              quantity: plural(gap.gap, 'worker'),
              valueInr: null,
              working: [`Head-count sheet, every contractor: ${sheet.total}`, `DPR manpower: ${dpr.manpower}`, `Flagged from ${plural(Math.max(HEADCOUNT_GAP_MIN, Math.ceil((dpr.manpower * HEADCOUNT_GAP_PCT) / 100)), 'head')} apart`],
              links: [
                { label: `DPR of ${day(d)}`, href: `/dpr/${dpr.id}` },
                { label: 'Head count', href: `/attendance?sub=headcount` },
              ],
              workers: null,
              billId: null,
            });
        }
      }
    }
    return out;
  }

  private dayRows(f: Facts, projectId: string, from: string, to: string): AttendanceCheckDayDto[] {
    return daysOf(from, to)
      .reverse()
      .map((d) => {
        const k = key(projectId, d);
        const sheet = f.sheets.get(k);
        const roll = f.roll.get(k) ?? [];
        const crewNames = new Map<string, string>();
        for (const l of sheet?.lines ?? []) crewNames.set(l.crew, l.crewName);
        for (const r of roll) if (!crewNames.has(r.crew)) crewNames.set(r.crew, r.crewName);
        const crews: AttendanceCrewDayDto[] = [...crewNames].map(([crew, name]) => {
          const rows = roll.filter((r) => r.crew === crew);
          const lines = sheet?.lines.filter((l) => l.crew === crew) ?? [];
          return {
            contractor: name,
            headCount: sheet ? lines.reduce((t, l) => t + l.count, 0) : null,
            rollCall: rows.length ? rows.filter((r) => r.present).length : null,
            punched: rows.length && f.devices.has(projectId) ? rows.filter((r) => r.punched).length : null,
          };
        });
        return {
          date: d,
          dpr: f.dprs.get(k)?.manpower ?? null,
          headCount: sheet ? sheet.total : null,
          rollCall: roll.length ? roll.filter((r) => r.present).length : null,
          punched: f.devices.has(projectId) ? (f.punchedBy.get(k)?.size ?? 0) : null,
          deviceUp: f.deviceUp.has(k),
          crews,
        };
      });
  }
}
