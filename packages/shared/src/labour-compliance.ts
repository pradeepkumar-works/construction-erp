/**
 * Contract labour compliance (ARCHITECTURE "Contract labour compliance"): what a contractor with men on our sites must
 * show (a labour licence for the site, PF and ESI codes with a challan for every month, a workmen's compensation policy
 * where ESI does not cover them, BOCW registration) and what is missing for a bill. Pure; the API loads the facts.
 */
import type { LabourChallanKind, LabourPaperKind } from './enums';
import { LABOUR_CHALLAN_KIND_LABELS, LABOUR_PAPER_KIND_LABELS } from './labels';
import type { AttachmentDto } from './types';
import { monthWords } from './payroll';

/** A paper's name inside a sentence: 'labour licence (CLRA)', but 'PF code' stays. */
const inSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label);

/**
 * Head counts from which each law applies: the Contract Labour Act's licence (20 on one site), EPF (20), ESI (10) and
 * the BOCW Act (10). A state that sets other limits is not modelled.
 */
export const LABOUR_LAW_FROM = { CLRA: 20, PF: 20, ESI: 10, BOCW: 10 } as const;
/** A month's PF or ESI challan is due by this day of the next month. */
export const CHALLAN_DUE_DAY = 15;

/** Papers that hold for one site only. */
export const SITE_PAPERS: readonly LabourPaperKind[] = ['CLRA_LICENCE'];
/** Papers that run out: they carry a valid-to date. */
export const EXPIRING_PAPERS: readonly LabourPaperKind[] = ['CLRA_LICENCE', 'WC_POLICY', 'BOCW_REGISTRATION'];
/** Papers that name how many workers they cover. */
export const COUNTED_PAPERS: readonly LabourPaperKind[] = ['CLRA_LICENCE', 'WC_POLICY'];

export interface LabourPaperFact {
  kind: LabourPaperKind;
  projectId: string | null;
  number: string;
  validFrom: string | null;
  validTo: string | null;
  workers: number | null;
}

export interface LabourFacts {
  /** The bill's site */
  projectId: string;
  /** The day the papers are judged on (the bill date, or today on the register), YYYY-MM-DD */
  asOf: string;
  /** Most men of the contractor on the site's head count on one day, over the period looked at */
  sitePeak: number;
  /** Each month (YYYY-MM) of the period with men of theirs on any of our sites, with the most on one day across them */
  months: { month: string; peak: number }[];
  papers: LabourPaperFact[];
  /** Months (YYYY-MM) a challan has been recorded for */
  challans: { kind: LabourChallanKind; month: string }[];
}

export interface LabourProblem {
  /** Changes when the figures behind it move, like a bill check's key */
  key: string;
  kind: LabourPaperKind | LabourChallanKind;
  text: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The day a month's challan is due: the 15th of the month after. */
export function challanDue(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(CHALLAN_DUE_DAY).padStart(2, '0')}`;
}

/** Whether a paper holds on a day. */
export const paperValidOn = (p: Pick<LabourPaperFact, 'validFrom' | 'validTo'>, day: string) => (!p.validFrom || p.validFrom <= day) && (!p.validTo || p.validTo >= day);

/** Why a paper cannot be saved as entered. */
export function labourPaperProblem(p: { kind: LabourPaperKind; projectId: string | null; number: string; validFrom: string | null; validTo: string | null; workers: number | null }): string | null {
  if (!p.number.trim()) return `Enter the ${inSentence(LABOUR_PAPER_KIND_LABELS[p.kind])} number`;
  if (SITE_PAPERS.includes(p.kind) && !p.projectId) return 'Choose the site the licence is for';
  if (!SITE_PAPERS.includes(p.kind) && p.projectId) return `A ${inSentence(LABOUR_PAPER_KIND_LABELS[p.kind])} holds for every site; leave the site empty`;
  if (EXPIRING_PAPERS.includes(p.kind) && !p.validTo) return 'Enter the date it is valid to';
  if (p.validFrom && p.validTo && p.validTo < p.validFrom) return 'Valid to is before valid from';
  if (p.workers !== null && (!Number.isInteger(p.workers) || p.workers < 1)) return 'Enter the number of workers as a whole number above zero';
  if (COUNTED_PAPERS.includes(p.kind) && p.workers === null) return 'Enter how many workers it covers';
  return null;
}

/** Why a challan cannot be saved as entered. */
export function labourChallanProblem(c: { month: string; paidOn: string; amount: number; reference: string }, today: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)) return 'Choose the wage month';
  if (c.month > today.slice(0, 7)) return 'The wage month cannot be after this month';
  if (!c.reference.trim()) return 'Enter the challan or TRRN number';
  if (!(c.amount > 0)) return 'Enter the amount paid';
  if (c.paidOn < `${c.month}-01`) return 'The challan is paid after its wage month starts';
  if (c.paidOn > today) return 'The paid date cannot be after today';
  return null;
}

/**
 * What the contractor has not shown, as of `asOf`. Nothing when they had no men on our head counts. Each law is asked for
 * only from its head count (`LABOUR_LAW_FROM`); a month's challan only once it is due (`challanDue`). Workmen's
 * compensation is asked for when ESI does not cover the men (fewer than ESI's 10).
 */
export function labourProblems(f: LabourFacts): LabourProblem[] {
  const peak = Math.max(f.sitePeak, ...f.months.map((m) => m.peak), 0);
  if (peak === 0) return [];
  const out: LabourProblem[] = [];
  const valid = (kind: LabourPaperKind, site?: string) => f.papers.filter((p) => p.kind === kind && (!site || p.projectId === site) && paperValidOn(p, f.asOf));
  const latest = (kind: LabourPaperKind, site?: string) =>
    f.papers.filter((p) => p.kind === kind && (!site || p.projectId === site)).sort((a, b) => (b.validTo ?? '9999').localeCompare(a.validTo ?? '9999'))[0];
  const paper = (kind: LabourPaperKind, men: number, site?: string, perSite = '') => {
    const ok = valid(kind, site);
    const label = LABOUR_PAPER_KIND_LABELS[kind];
    if (!ok.length) {
      const last = latest(kind, site);
      if (last?.validTo && last.validTo < f.asOf) out.push({ key: `${kind}:expired:${last.number}`, kind, text: `${label} ${last.number}${perSite} ran out on ${dayWords(last.validTo)}` });
      else out.push({ key: `${kind}:none:${men}`, kind, text: `No ${inSentence(label)}${perSite}; they had ${men} men` });
      return;
    }
    if (COUNTED_PAPERS.includes(kind)) {
      const most = Math.max(...ok.map((p) => p.workers ?? 0));
      if (most < men) out.push({ key: `${kind}:short:${most}:${men}`, kind, text: `${label} covers ${most} workers${perSite}; they had ${men}` });
    }
  };

  if (f.sitePeak >= LABOUR_LAW_FROM.CLRA) paper('CLRA_LICENCE', f.sitePeak, f.projectId, ' for this site');
  const pf = peak >= LABOUR_LAW_FROM.PF;
  const esi = peak >= LABOUR_LAW_FROM.ESI;
  if (pf) paper('PF_CODE', peak);
  if (esi) paper('ESI_CODE', peak);
  if (!esi) paper('WC_POLICY', peak);
  if (peak >= LABOUR_LAW_FROM.BOCW) paper('BOCW_REGISTRATION', peak);

  const due = f.months.filter((m) => m.peak > 0 && challanDue(m.month) <= f.asOf).map((m) => m.month).sort();
  for (const [kind, on] of [['PF', pf], ['ESI', esi]] as const) {
    if (!on) continue;
    const have = new Set(f.challans.filter((c) => c.kind === kind).map((c) => c.month));
    const missing = due.filter((m) => !have.has(m));
    if (missing.length) out.push({ key: `${kind}:months:${missing.join(',')}`, kind, text: `${LABOUR_CHALLAN_KIND_LABELS[kind]} not shown for ${listOf(missing.map(monthWords))}` });
  }
  return out;
}

/** One line for a held payment: the first problem, and how many more. */
export function labourHoldWords(problems: Pick<LabourProblem, 'text'>[]): string {
  if (!problems.length) return '';
  return problems.length === 1 ? problems[0].text : `${problems[0].text}, and ${problems.length - 1} more`;
}

export interface LabourPaperDto {
  id: string;
  vendorId: string;
  vendorName: string;
  kind: LabourPaperKind;
  projectId: string | null;
  projectName: string | null;
  number: string;
  validFrom: string | null;
  validTo: string | null;
  workers: number | null;
  note: string | null;
  /** Valid today */
  current: boolean;
  attachments: AttachmentDto[];
  createdByName: string;
  createdAt: string;
}

export interface LabourChallanDto {
  id: string;
  vendorId: string;
  vendorName: string;
  kind: LabourChallanKind;
  month: string;
  amount: string;
  workers: number | null;
  paidOn: string;
  reference: string;
  note: string | null;
  /** Paid after the 15th of the month after */
  late: boolean;
  attachments: AttachmentDto[];
  createdByName: string;
  createdAt: string;
}

/** One contractor on one site on the register, judged as of today. */
export interface LabourStandingDto {
  vendorId: string;
  vendorName: string;
  projectId: string;
  projectName: string;
  /** Most men on one day on this site over the period looked at */
  sitePeak: number;
  /** The last day they had men on the site */
  lastSeen: string;
  problems: LabourProblem[];
}

export interface LabourRegisterDto {
  /** Months looked back over, from the first day of the first */
  from: string;
  standing: LabourStandingDto[];
  papers: LabourPaperDto[];
  challans: LabourChallanDto[];
}

/** A subcontractor bill's labour papers: what is missing as of its date, and the hold's release if someone released it. */
export interface LabourHoldDto {
  problems: LabourProblem[];
  releasedAt: string | null;
  releasedByName: string | null;
  note: string | null;
}
