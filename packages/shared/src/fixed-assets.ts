/**
 * Fixed assets (ARCHITECTURE "Fixed assets"): the register of what the company owns, the Companies Act depreciation the
 * books charge for it, the Income Tax block depreciation for the return, and what a sale or scrapping gains or loses.
 * The schedule is a pure function of an asset's fixed facts, so a run charges the same however often it is prepared, and
 * monthly runs add up to the year. Money is worked in paise and returned in rupees.
 */
import { financialYearOf } from './procurement';

export const DEPRECIATION_METHODS = ['SLM', 'WDV'] as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];
export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = { SLM: 'Straight line', WDV: 'Written down value' };

export const FIXED_ASSET_STATUSES = ['ACTIVE', 'DISPOSED'] as const;
export type FixedAssetStatus = (typeof FIXED_ASSET_STATUSES)[number];
export const FIXED_ASSET_STATUS_LABELS: Record<FixedAssetStatus, string> = { ACTIVE: 'In use', DISPOSED: 'Disposed' };

export const DEPRECIATION_RUN_STATUSES = ['DRAFT', 'POSTED'] as const;
export type DepreciationRunStatus = (typeof DEPRECIATION_RUN_STATUSES)[number];
export const DEPRECIATION_RUN_STATUS_LABELS: Record<DepreciationRunStatus, string> = { DRAFT: 'Draft', POSTED: 'In the books' };

/** How the asset's cost reached the books: the credit side of its addition voucher, or none when it is there already. */
export const ASSET_FUNDINGS = ['BANK', 'CASH', 'VENDOR', 'MACHINE_LOAN', 'IN_BOOKS'] as const;
export type AssetFunding = (typeof ASSET_FUNDINGS)[number];
export const ASSET_FUNDING_LABELS: Record<AssetFunding, string> = {
  BANK: 'Paid from the bank',
  CASH: 'Paid in cash',
  VENDOR: 'On credit from a vendor',
  MACHINE_LOAN: 'Bought on a machine loan',
  IN_BOOKS: 'Already in the books',
};

/** Income Tax blocks of assets (Appendix I of the Income Tax Rules), each with its yearly rate on the written down value. */
export const IT_BLOCKS = {
  BUILDING: { label: 'Buildings', rate: 0.1 },
  TEMPORARY: { label: 'Temporary erections', rate: 0.4 },
  FURNITURE: { label: 'Furniture and fittings', rate: 0.1 },
  PLANT: { label: 'Plant and machinery', rate: 0.15 },
  COMPUTERS: { label: 'Computers and software', rate: 0.4 },
} as const;
export type ItBlock = keyof typeof IT_BLOCKS;

export interface AssetClass {
  label: string;
  /** Useful life in years, Companies Act Schedule II Part C */
  lifeYears: number;
  /** The posting ledger the cost is booked to */
  ledger: string;
  itBlock: ItBlock;
}

/** The classes an asset is filed under: Schedule II's useful life, the cost ledger and the Income Tax block. */
export const ASSET_CLASSES = {
  BUILDINGS: { label: 'Buildings (RCC frame)', lifeYears: 60, ledger: 'BUILDINGS', itBlock: 'BUILDING' },
  TEMPORARY_STRUCTURES: { label: 'Temporary structures (site offices, sheds)', lifeYears: 3, ledger: 'BUILDINGS', itBlock: 'TEMPORARY' },
  CONCRETING: { label: 'Concreting, crushing, piling and road making equipment', lifeYears: 12, ledger: 'MACHINERY', itBlock: 'PLANT' },
  EARTH_MOVING: { label: 'Earth-moving equipment', lifeYears: 9, ledger: 'MACHINERY', itBlock: 'PLANT' },
  CRANES: { label: 'Cranes up to 100 tonnes', lifeYears: 15, ledger: 'MACHINERY', itBlock: 'PLANT' },
  CRANES_HEAVY: { label: 'Cranes above 100 tonnes', lifeYears: 20, ledger: 'MACHINERY', itBlock: 'PLANT' },
  TUNNELLING: { label: 'Transmission line and tunnelling equipment', lifeYears: 10, ledger: 'MACHINERY', itBlock: 'PLANT' },
  CONSTRUCTION_OTHER: { label: 'Other construction plant (material handling, pipeline, welding)', lifeYears: 12, ledger: 'MACHINERY', itBlock: 'PLANT' },
  PLANT_GENERAL: { label: 'Plant and machinery, general', lifeYears: 15, ledger: 'MACHINERY', itBlock: 'PLANT' },
  LAB_EQUIPMENT: { label: 'Laboratory equipment', lifeYears: 10, ledger: 'MACHINERY', itBlock: 'PLANT' },
  VEHICLES: { label: 'Motor vehicles (trucks, tippers, cars)', lifeYears: 8, ledger: 'VEHICLES', itBlock: 'PLANT' },
  TWO_WHEELERS: { label: 'Motor cycles and scooters', lifeYears: 10, ledger: 'VEHICLES', itBlock: 'PLANT' },
  FURNITURE: { label: 'Furniture and fittings', lifeYears: 10, ledger: 'FURNITURE', itBlock: 'FURNITURE' },
  OFFICE_EQUIPMENT: { label: 'Office equipment', lifeYears: 5, ledger: 'OFFICE_EQUIPMENT', itBlock: 'PLANT' },
  COMPUTERS: { label: 'Computers (desktops, laptops)', lifeYears: 3, ledger: 'COMPUTERS', itBlock: 'COMPUTERS' },
  SERVERS: { label: 'Servers and networks', lifeYears: 6, ledger: 'COMPUTERS', itBlock: 'COMPUTERS' },
} as const satisfies Record<string, AssetClass>;
export type AssetClassCode = keyof typeof ASSET_CLASSES;
export const ASSET_CLASS_CODES = Object.keys(ASSET_CLASSES) as AssetClassCode[];
export const isAssetClass = (c: string): c is AssetClassCode => c in ASSET_CLASSES;
/** Companies Act Schedule II: the residual value is usually no more than 5% of the cost. */
export const STANDARD_RESIDUAL_PCT = 5;

/** What the schedule reads of an asset. Dates are YYYY-MM-DD; money in rupees. */
export interface DepreciableAsset {
  cost: number;
  residual: number;
  lifeYears: number;
  method: DepreciationMethod;
  putToUseOn: string;
  /** Depreciation charged before Nirmaan, up to and including `asOf` */
  opening: { asOf: string; amount: number } | null;
  disposedOn: string | null;
}

const DAY = 86_400_000;
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => dayOf(dayNo(d) + n);
const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;

/** The yearly WDV rate that brings the cost down to the residual over the life: 1 − (residual ÷ cost)^(1 ÷ life). */
export function wdvRate(cost: number, residual: number, lifeYears: number): number {
  if (cost <= 0 || lifeYears <= 0) return 0;
  return 1 - Math.pow(Math.max(residual, 1) / cost, 1 / lifeYears);
}

/**
 * Depreciation charged from the put-to-use day (or the opening point) up to and including `day`, in paise: each
 * financial year charges SLM as the depreciable amount over the life, WDV as the year's opening book value times the
 * rate, both by the days of the year used, and never past the residual.
 */
function accumulatedPaise(a: DepreciableAsset, day: string): number {
  const cost = paise(a.cost);
  const floor = cost - paise(a.residual);
  const start = a.opening ? addDays(a.opening.asOf, 1) : a.putToUseOn;
  let acc = a.opening ? Math.min(paise(a.opening.amount), Math.max(floor, 0)) : 0;
  const end = a.disposedOn && a.disposedOn < day ? a.disposedOn : day;
  if (end < start || floor <= 0 || a.lifeYears <= 0) return acc;
  const slmYear = floor / a.lifeYears;
  const rate = wdvRate(a.cost, a.residual, a.lifeYears);
  for (let from = start; from <= end && acc < floor; ) {
    const fy = financialYearOf(from);
    const to = fy.to < end ? fy.to : end;
    const share = (dayNo(to) - dayNo(from) + 1) / (dayNo(fy.to) - dayNo(fy.from) + 1);
    const yearly = a.method === 'SLM' ? slmYear : (cost - acc) * rate;
    acc = Math.min(floor, acc + Math.round(yearly * share));
    from = addDays(fy.to, 1);
  }
  return acc;
}

/** Companies Act depreciation charged up to and including `day`, the opening amount included. */
export const accumulatedTo = (a: DepreciableAsset, day: string) => rupees(accumulatedPaise(a, day));

/** The Companies Act charge for the days `from` to `to`, both included: nothing before the asset is used or after it goes. */
export function bookDepreciation(a: DepreciableAsset, from: string, to: string): number {
  if (to < from) return 0;
  return rupees(accumulatedPaise(a, to) - accumulatedPaise(a, addDays(from, -1)));
}

/** A sale or scrapping: the book value given up against what it fetched. */
export function disposalResult(x: { cost: number; accumulated: number; proceeds: number }): { bookValue: number; gain: number; loss: number } {
  const bookValue = rupees(paise(x.cost) - paise(x.accumulated));
  const diff = paise(x.proceeds) - paise(bookValue);
  return { bookValue, gain: diff > 0 ? rupees(diff) : 0, loss: diff < 0 ? rupees(-diff) : 0 };
}

/** Section 32: an asset put to use for less than 180 days in its first year gets half the year's rate. */
export const IT_HALF_RATE_DAYS = 180;

export interface ItBlockYear {
  openingWdv: number;
  additions: number;
  /** Additions used under 180 days in the year, at half the rate */
  halfRateAdditions: number;
  disposals: number;
  depreciation: number;
  closingWdv: number;
  /**
   * Section 50: sale proceeds above the block's value are a short-term capital gain; when the last asset of the block
   * goes, what value is left is a short-term capital loss (negative). Either way the block's value is nil.
   */
  shortTermGain: number;
}

/**
 * Income Tax depreciation of one block for a financial year ('2026-27'): the opening WDV plus additions less sale
 * proceeds, at the block's rate, with half the rate on additions used under 180 days. Proceeds come off the full-rate
 * part first; what they exceed the whole block by is a short-term capital gain.
 */
export function itBlockDepreciation(rate: number, openingWdv: number, additions: { cost: number; putToUseOn: string }[], disposals: number, fy: string): ItBlockYear {
  const fyEnd = `${Number(fy.slice(0, 4)) + 1}-03-31`;
  const half = (x: { putToUseOn: string }) => dayNo(fyEnd) - dayNo(x.putToUseOn) + 1 < IT_HALF_RATE_DAYS;
  const add = additions.reduce((s, x) => s + paise(x.cost), 0);
  const halfAdd = additions.filter(half).reduce((s, x) => s + paise(x.cost), 0);
  const sold = paise(disposals);
  const whole = paise(openingWdv) + add - sold;
  const out = { openingWdv, additions: rupees(add), halfRateAdditions: rupees(halfAdd), disposals };
  if (whole <= 0) return { ...out, depreciation: 0, closingWdv: 0, shortTermGain: rupees(-whole) };
  const fullBase = paise(openingWdv) + add - halfAdd - sold;
  const halfBase = fullBase < 0 ? halfAdd + fullBase : halfAdd;
  const dep = Math.round(Math.max(fullBase, 0) * rate) + Math.round(halfBase * (rate / 2));
  return { ...out, depreciation: rupees(dep), closingWdv: rupees(whole - dep), shortTermGain: 0 };
}

/** The year the last asset of a block goes: no depreciation, and whatever is left over or short is the capital gain. */
function blockCeased(openingWdv: number, additions: { cost: number }[], disposals: number): ItBlockYear {
  const add = additions.reduce((s, x) => s + paise(x.cost), 0);
  const whole = paise(openingWdv) + add - paise(disposals);
  return { openingWdv, additions: rupees(add), halfRateAdditions: 0, disposals, depreciation: 0, closingWdv: 0, shortTermGain: rupees(-whole) };
}

/** The financial year code of a date: 2026-27. */
export function fyCodeOf(date: string): string {
  const y = Number(financialYearOf(date).from.slice(0, 4));
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export interface ItAsset {
  itBlock: ItBlock;
  cost: number;
  putToUseOn: string;
  disposedOn: string | null;
  proceeds: number;
}

/**
 * Each block's Income Tax schedule for a financial year, rolled forward from the earliest year an asset was put to use:
 * every year's closing WDV is the next one's opening, and a block ceases the year its last asset goes. Blocks with
 * nothing in them are left out.
 */
export function itBlockSchedule(assets: ItAsset[], fy: string): ({ block: ItBlock; rate: number } & ItBlockYear)[] {
  const first = assets.reduce((m, a) => (fyCodeOf(a.putToUseOn) < m ? fyCodeOf(a.putToUseOn) : m), fy);
  const out: ({ block: ItBlock; rate: number } & ItBlockYear)[] = [];
  for (const block of Object.keys(IT_BLOCKS) as ItBlock[]) {
    const mine = assets.filter((a) => a.itBlock === block);
    if (!mine.length) continue;
    const rate = IT_BLOCKS[block].rate;
    let opening = 0;
    for (let y = Number(first.slice(0, 4)); y <= Number(fy.slice(0, 4)); y++) {
      const code = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
      const additions = mine.filter((a) => fyCodeOf(a.putToUseOn) === code);
      const sold = mine.filter((a) => a.disposedOn && fyCodeOf(a.disposedOn) === code).reduce((s, a) => s + a.proceeds, 0);
      const left = mine.some((a) => fyCodeOf(a.putToUseOn) <= code && !(a.disposedOn && fyCodeOf(a.disposedOn) <= code));
      const year = left ? itBlockDepreciation(rate, opening, additions, sold, code) : blockCeased(opening, additions, sold);
      if (code === fy) {
        if (year.openingWdv || year.additions || year.disposals) out.push({ block, rate, ...year });
      } else opening = year.closingWdv;
    }
  }
  return out;
}

/** A run's period in words: "October 2026", "2026-27", else the two days. */
export function runPeriodLabel(from: string, to: string): string {
  const monthEnd = dayOf(dayNo(`${from.slice(0, 7)}-01`) + new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate() - 1);
  if (from.slice(8) === '01' && to === monthEnd) return new Date(`${from}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fy = financialYearOf(from);
  if (from === fy.from && to === fy.to) return fyCodeOf(from);
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${day(from)} to ${day(to)}`;
}

/** Why a run's period cannot be prepared, else null: one financial year at most, and no overlap with another run. */
export function runPeriodProblem(from: string, to: string, others: { from: string; to: string }[]): string | null {
  if (to < from) return 'Choose an end date on or after the start';
  if (financialYearOf(from).from !== financialYearOf(to).from) return 'Keep a run within one financial year (April to March)';
  const clash = others.find((o) => o.from <= to && from <= o.to);
  return clash ? `Depreciation for ${runPeriodLabel(clash.from, clash.to)} already covers part of this period` : null;
}

/** Why an asset cannot be saved as it is, else null. */
export function assetProblem(a: {
  name: string;
  assetClass: string;
  cost: number;
  residual: number;
  lifeYears: number;
  putToUseOn: string;
  fundedBy: AssetFunding;
  vendorId: string | null;
  opening: { asOf: string; amount: number } | null;
}): string | null {
  if (!a.name.trim()) return 'Name the asset';
  if (!isAssetClass(a.assetClass)) return 'Choose the asset class';
  if (!(a.cost > 0)) return 'Enter the cost, above zero';
  if (a.residual < 0 || a.residual >= a.cost) return 'Keep the residual value below the cost';
  if (!Number.isInteger(a.lifeYears) || a.lifeYears < 1 || a.lifeYears > 100) return 'Enter a useful life of 1 to 100 years';
  if (a.fundedBy === 'VENDOR' && !a.vendorId) return 'Choose the vendor it was bought from';
  if (a.opening) {
    if (a.opening.asOf < a.putToUseOn) return 'Date the depreciation before Nirmaan on or after the day it was put to use';
    if (a.opening.amount < 0 || a.opening.amount > a.cost - a.residual) return 'Keep the depreciation before Nirmaan between zero and the cost less the residual';
  }
  return null;
}

export interface FixedAssetDto {
  id: string;
  assetNo: string;
  name: string;
  assetClass: AssetClassCode;
  method: DepreciationMethod;
  cost: string;
  residual: string;
  lifeYears: number;
  putToUseOn: string;
  fundedBy: AssetFunding;
  vendorId: string | null;
  vendorName: string | null;
  invoiceNo: string | null;
  serialNo: string | null;
  projectId: string | null;
  projectName: string | null;
  equipmentId: string | null;
  equipmentCode: string | null;
  openingAsOf: string | null;
  openingDepreciation: string;
  status: FixedAssetStatus;
  disposedOn: string | null;
  proceeds: string | null;
  /** Depreciation in the books: before Nirmaan plus the posted runs */
  depreciation: string;
  bookValue: string;
  /** Gain (positive) or loss (negative) on disposal */
  disposalResult: string | null;
  note: string | null;
  /** Cost, life and method are fixed once a run has charged it */
  charged: boolean;
}

export interface AssetTransferDto {
  id: string;
  on: string;
  fromName: string | null;
  toName: string | null;
  note: string | null;
  byName: string;
}

export interface AssetChargeDto {
  runId: string;
  period: string;
  from: string;
  to: string;
  amount: string;
  status: DepreciationRunStatus;
}

export interface FixedAssetDetailDto extends FixedAssetDto {
  transfers: AssetTransferDto[];
  charges: AssetChargeDto[];
  /** Depreciation up to today on the schedule, posted or not */
  scheduledToDate: string;
  wdvRatePct: string | null;
}

export interface FixedAssetListDto {
  items: FixedAssetDto[];
  total: number;
  page: number;
  pageSize: number;
  /** The assets in use, whatever the filters show */
  summary: { count: number; cost: string; depreciation: string; bookValue: string };
}

/** The register against the books: its book value beside the balance sheet's property, plant and equipment today. */
export interface FixedAssetBooksCheckDto {
  asOn: string;
  register: string;
  ppe: string;
  /** The balance sheet less the register; zero when every fixed asset in the books is in the register */
  difference: string;
}

export interface DepreciationLineDto {
  assetId: string;
  assetNo: string;
  name: string;
  assetClass: AssetClassCode;
  method: DepreciationMethod;
  from: string;
  to: string;
  amount: string;
}

export interface DepreciationRunDto {
  id: string;
  from: string;
  to: string;
  period: string;
  status: DepreciationRunStatus;
  total: string;
  assets: number;
  preparedByName: string;
  preparedAt: string;
  postedByName: string | null;
  postedAt: string | null;
  voucherNo: string | null;
}

export interface DepreciationRunDetailDto extends DepreciationRunDto {
  lines: DepreciationLineDto[];
  /** Why it cannot be posted (the lock, the books' start), else null */
  postProblem: string | null;
}

export interface ItBlockRowDto {
  block: ItBlock;
  label: string;
  ratePct: number;
  openingWdv: string;
  additions: string;
  halfRateAdditions: string;
  disposals: string;
  depreciation: string;
  closingWdv: string;
  shortTermGain: string;
}
