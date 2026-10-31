import { Prisma } from '@prisma/client';
import { DEFAULT_OM_BENCHMARKS, OM_BENCHMARKS, type OmBenchmarkSetting } from '@erp/shared';
import { dateOnly, parseDate } from '../common/serialize';
import { monthFigures, monthsBetween, omBill, omEndsOn, omPeriods, type DayReading, type MonthFigures, type OmPeriod, type StaffNorm } from './om-rules';

/*
 * Loading an O&M contract and its records for the rules (item 131). `OmService` reads the tab with it and `RaBillsService`
 * prices an O&M bill with it, inside the bill's transaction, so the tab and the bill agree.
 */

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/** A contract's benchmarks as stored, completed with the usual terms for any it does not set. */
export function benchmarkSettings(json: Prisma.JsonValue): OmBenchmarkSetting[] {
  const stored = Array.isArray(json) ? (json as unknown as OmBenchmarkSetting[]) : [];
  return OM_BENCHMARKS.map((key) => stored.find((s) => s?.key === key) ?? DEFAULT_OM_BENCHMARKS.find((d) => d.key === key)!);
}

export const OM_CONTRACT_INCLUDE = {
  staffNorms: { orderBy: [{ sortOrder: 'asc' }, { role: 'asc' }] },
  chemicalNorms: { include: { item: { select: { name: true, unit: true } } } },
  project: { select: { contractValue: true } },
} satisfies Prisma.OmContractInclude;
export type OmContractRow = Prisma.OmContractGetPayload<{ include: typeof OM_CONTRACT_INCLUDE }>;

export interface LoadedOm {
  contract: OmContractRow;
  startOn: string;
  endsOn: string;
  periods: OmPeriod[];
  settings: OmBenchmarkSetting[];
  norms: StaffNorm[];
}

/** The project's O&M contract with its periods, benchmarks and staff minimum; null without one. */
export async function loadOm(tx: Prisma.TransactionClient, projectId: string): Promise<LoadedOm | null> {
  const contract = await tx.omContract.findUnique({ where: { projectId }, include: OM_CONTRACT_INCLUDE });
  if (!contract) return null;
  const startOn = dateOnly(contract.startOn);
  const terms = {
    startOn,
    years: contract.years,
    yearPcts: contract.yearPcts.map(Number),
    instalmentsPerYear: contract.instalmentsPerYear,
    contractValue: num(contract.project.contractValue),
  };
  return {
    contract,
    startOn,
    endsOn: omEndsOn(terms),
    periods: omPeriods(terms),
    settings: benchmarkSettings(contract.benchmarks),
    norms: contract.staffNorms.map((n) => ({ role: n.role, required: n.required, monthlyPay: Number(n.monthlyPay) })),
  };
}

/** The daily readings between two days, as the rules take them. */
export async function loadDays(tx: Prisma.TransactionClient, projectId: string, from: string, to: string): Promise<DayReading[]> {
  const rows = await tx.serviceLevelDay.findMany({ where: { projectId, date: { gte: parseDate(from), lte: parseDate(to) } }, orderBy: { date: 'asc' } });
  return rows.map((r) => ({
    date: dateOnly(r.date),
    producedKl: Number(r.producedKl),
    suppliedKl: Number(r.suppliedKl),
    residualChlorine: num(r.residualChlorine),
    tailPressureM: num(r.tailPressureM),
    complaintsReceived: r.complaintsReceived,
    complaintsClosed48h: r.complaintsClosed48h,
    pumpEfficiencyPct: num(r.pumpEfficiencyPct),
  }));
}

/** Each month between two days worked out: service levels, penalties and staff short. */
export async function loadMonths(tx: Prisma.TransactionClient, om: LoadedOm, projectId: string, from: string, to: string, today: string): Promise<MonthFigures[]> {
  const months = monthsBetween(from, to);
  if (!months.length) return [];
  const first = `${months[0]}-01`;
  const [days, staff] = await Promise.all([
    loadDays(tx, projectId, first, to),
    tx.omStaffMonth.findMany({ where: { projectId, month: { gte: parseDate(first), lte: parseDate(to) } }, select: { month: true, role: true, deployed: true } }),
  ]);
  return months.map((month) => {
    const deployed = new Map(staff.filter((s) => dateOnly(s.month).startsWith(month)).map((s) => [s.role, s.deployed]));
    return monthFigures({ month, startOn: om.startOn, endsOn: om.endsOn, today, days, settings: om.settings, population: om.contract.population, norms: om.norms, deployed });
  });
}

/** A period's O&M bill worked out from its months. */
export async function priceOmPeriod(tx: Prisma.TransactionClient, om: LoadedOm, projectId: string, period: OmPeriod, today: string) {
  const months = await loadMonths(tx, om, projectId, period.from, period.to, today);
  return omBill(period, months);
}
