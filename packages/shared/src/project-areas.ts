// A project's area summaries (ARCHITECTURE "Overviews answer first"): the Plan, Site, Materials and Money groups of the
// project page each open on a Summary tab that runs figures, what waits on whom, the exceptions, then the group's tabs.
// Which kinds of entry and warning belong to which area, and how what waits is grouped and ordered, are here. Pure.

import type { RoleKey, SubmissionType } from './enums';
import type { Figure } from './figures';
import type { WarningDto, WarningKind } from './warnings';
import { canPurchase, canViewContract, canViewPaymentRequests, canViewPurchaseOrders, canViewVendorBills, canViewWorkOrders, isGuest } from './permissions';
import { rankWaiting } from './waiting-rank';
import { toNumber } from './numbers';

export const PROJECT_AREAS = ['plan', 'site', 'materials', 'money'] as const;
export type ProjectArea = (typeof PROJECT_AREAS)[number];
export const isProjectArea = (k: string): k is ProjectArea => (PROJECT_AREAS as readonly string[]).includes(k);

/** The summary's `?tab=` key, the first tab of its group. */
export const areaSummaryTab = (area: ProjectArea) => `${area}-summary` as const;

/** The exceptions a summary lists; the rest are a link to the watch list. */
export const AREA_EXCEPTIONS = 5;
/** The days a site's daily reports are counted over, up to yesterday. */
export const DPR_WINDOW_DAYS = 7;

/** The area a watch-list warning leads under, or null for one that is no single project's (a machine loan's EMI). */
export const WARNING_AREA: Record<WarningKind, ProjectArea | null> = {
  SCHEDULE: 'plan',
  BOQ_OFF_CONTRACT: 'plan',
  PROGRAMME_DUE: 'plan',
  EOT_OVERDUE: 'plan',
  DRAWING_LATE: 'plan',
  DESIGN_REVIEW_LATE: 'plan',
  PACKAGE_LATE: 'plan',
  DPR: 'site',
  NOTICE_DUE: 'site',
  TESTS_SHORT: 'site',
  CALIBRATION_DUE: 'site',
  LAB_REPORT_LATE: 'site',
  CUBE_7DAY_LOW: 'site',
  COPY_RECALL_LATE: 'site',
  OM_SERVICE: 'site',
  STOCK: 'materials',
  MATERIAL_OVERUSE: 'materials',
  VENDOR: 'materials',
  MACHINE: 'materials',
  FUEL_NORM: 'materials',
  FUEL_NO_LOG: 'materials',
  FUEL_TANK: 'materials',
  IDLE_HIRE: 'materials',
  WEIGH_SHORT: 'materials',
  RATE_ABOVE: 'materials',
  PURCHASE_CONTROL: 'materials',
  CASH: 'money',
  MARGIN_FADE: 'money',
  MANDAYS_ABOVE: 'money',
  LOAN_EMI: null,
};

/** The warning kinds an area lists. */
export const areaWarningKinds = (area: ProjectArea): WarningKind[] => (Object.keys(WARNING_AREA) as WarningKind[]).filter((k) => WARNING_AREA[k] === area);

interface SubmissionPlace {
  area: ProjectArea;
  /** The project tab that lists it; null where only the company's list does */
  tab: string | null;
  /** Who reads its list, through the list's own helper */
  seen: (role: RoleKey) => boolean;
}

const internal = (role: RoleKey) => !isGuest(role);

/** Where each kind of entry waiting for approval belongs on the project page, and who may see it waiting. */
export const SUBMISSION_AREA: Record<SubmissionType, SubmissionPlace> = {
  PROGRESS: { area: 'site', tab: 'progress', seen: internal },
  DPR: { area: 'site', tab: 'dpr', seen: internal },
  MEASUREMENT: { area: 'site', tab: 'mb', seen: internal },
  INSPECTION: { area: 'site', tab: 'inspections', seen: internal },
  MATERIAL_REQUEST: { area: 'materials', tab: 'material', seen: internal },
  MACHINERY: { area: 'materials', tab: 'machinery', seen: internal },
  PURCHASE_ORDER: { area: 'materials', tab: 'po', seen: canViewPurchaseOrders },
  SUPPLIER_CHOICE: { area: 'materials', tab: null, seen: canPurchase },
  BILL: { area: 'money', tab: 'bills', seen: canViewContract },
  EXPENSE: { area: 'money', tab: 'expenses', seen: internal },
  WORK_ORDER: { area: 'money', tab: 'subcontracts', seen: canViewWorkOrders },
  SUBCONTRACT_BILL: { area: 'money', tab: 'subcontracts', seen: canViewWorkOrders },
  VENDOR_BILL: { area: 'money', tab: null, seen: canViewVendorBills },
  PAYMENT_REQUEST: { area: 'money', tab: null, seen: canViewPaymentRequests },
};

/** The kinds of entry an area shows waiting, to this role. */
export const areaSubmissionTypes = (area: ProjectArea, role: RoleKey): SubmissionType[] =>
  (Object.keys(SUBMISSION_AREA) as SubmissionType[]).filter((t) => SUBMISSION_AREA[t].area === area && SUBMISSION_AREA[t].seen(role));

/** One entry waiting for approval in the project, as the approvals queue describes it. */
export interface AreaWaitingEntry {
  type: SubmissionType;
  amount: string | null;
  /** Since when it has waited at its level (ISO) */
  waitingSince: string;
  /** The role names whose queue it is in */
  waitingWith: string[];
  /** The caller may decide it now */
  yours: boolean;
}

/** Entries of one kind waiting on the same people: "3 daily reports with Project manager, oldest 4 days". */
export interface AreaWaitingDto {
  type: SubmissionType;
  /** Waiting on the caller; else on `waitingWith` */
  yours: boolean;
  waitingWith: string[];
  count: number;
  oldestDays: number;
  /** Their rupees together; null for a kind without an amount or a role that sees none */
  amount: string | null;
  tab: string | null;
}

const DAY = 86_400_000;
const daysFrom = (since: string, today: string) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since.slice(0, 10)}T00:00:00Z`)) / DAY));

/**
 * What waits in an area, grouped by kind and by whom it waits on (the caller's own first within a kind), in the one
 * waiting order (`rankWaiting`: money band, then the oldest, then the order the entries came in).
 */
export function areaWaiting(entries: readonly AreaWaitingEntry[], today: string, seesAmounts: boolean): AreaWaitingDto[] {
  const groups = new Map<string, AreaWaitingDto & { sum: number | null }>();
  const ordered = [...entries].sort((a, b) => Number(b.yours) - Number(a.yours));
  for (const e of ordered) {
    const who = e.yours ? [] : [...e.waitingWith].sort();
    const key = `${e.type}|${e.yours ? 'you' : who.join(',')}`;
    const g = groups.get(key) ?? { type: e.type, yours: e.yours, waitingWith: who, count: 0, oldestDays: 0, amount: null, tab: SUBMISSION_AREA[e.type].tab, sum: null };
    g.count += 1;
    g.oldestDays = Math.max(g.oldestDays, daysFrom(e.waitingSince, today));
    if (seesAmounts && e.amount !== null) g.sum = (g.sum ?? 0) + toNumber(e.amount);
    groups.set(key, g);
  }
  const rows = [...groups.values()].map(({ sum, ...g }) => ({ ...g, amount: sum === null ? null : sum.toFixed(2) }));
  return rankWaiting(rows, (g) => ({ amount: g.amount, daysLate: g.oldestDays }));
}

/** The project's open warnings in an area, in the watch list's order, the first `limit` and how many more. */
export function areaExceptions(open: readonly WarningDto[], projectId: string, area: ProjectArea, limit = AREA_EXCEPTIONS): { top: WarningDto[]; more: number } {
  const mine = open.filter((w) => w.projectId === projectId && WARNING_AREA[w.kind] === area);
  return { top: mine.slice(0, limit), more: Math.max(0, mine.length - limit) };
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * Of the `window` days before today, from the project's start, the days no daily report was sent for, and how many
 * days were counted (fewer than the window in the project's first week).
 */
export function daysWithoutReport(sent: ReadonlySet<string>, today: string, startDate: string | null, window = DPR_WINDOW_DAYS): { missing: number; counted: number } {
  let missing = 0;
  let counted = 0;
  for (let i = 1; i <= window; i++) {
    const d = addDays(today, -i);
    if (startDate && d < startDate) break;
    counted++;
    if (!sent.has(d)) missing++;
  }
  return { missing, counted };
}

/** A project area's summary: its headline figures, what waits on whom, and its open warnings. */
export interface ProjectAreaDto {
  area: ProjectArea;
  asOf: string;
  /** Headline figures (`figure()`), each behind the helper of the list it counts */
  figures: Figure[];
  /** Plan only: when the plan finishes and the date it stands against (the contract's, after extensions granted) */
  finish?: { planned: string | null; completion: string | null };
  /** Null where nothing in the area goes for approval, or not to this role */
  waiting: AreaWaitingDto[] | null;
  /** The project's open warnings in the area; null for a role with no watch list */
  exceptions: WarningDto[] | null;
  /** Open warnings past the ones listed */
  moreExceptions: number;
}
