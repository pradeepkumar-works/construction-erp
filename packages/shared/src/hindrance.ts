import type { DelayParty, RiskCategory, RoleKey } from './enums';
import { canApprove, canRaiseRisk, canViewLetters } from './permissions';

/**
 * Hindrance register to notice (AI item 123): a DPR's hindrance remark is read for a delay (cause, party, start date),
 * the project manager records or dismisses it, and an open delay the contractor is not answerable for runs a notice
 * clock against the contract's notice period until an outgoing letter is linked to it.
 */

/** Days to give notice of a hindrance when the contract sets none (most public works contracts say 14). */
export const DEFAULT_NOTICE_DAYS = 14;
/** The notice clock shows on the watch list from this many days before the notice is due, and again at 3 and 0. */
export const NOTICE_STAGES = [7, 3, 0] as const;
/** DPR remarks read for hindrances go back this many days. */
export const HINDRANCE_LOOKBACK_DAYS = 45;

/** Delays that need a notice to the client: those the contractor is not answerable for. */
export const NOTICE_PARTIES: DelayParty[] = ['CLIENT', 'THIRD_PARTY', 'FORCE_MAJEURE'];
export const needsNotice = (party: DelayParty | null | undefined) => !!party && NOTICE_PARTIES.includes(party);

/** Who sees DPR hindrances to record: those who can raise a delay and approve the site's reports. */
export const canReviewHindrances = (role: RoleKey) => canRaiseRisk(role) && canApprove(role);
/** Who drafts a hindrance notice: they write letters for the project. */
export const canDraftNotice = (role: RoleKey) => canRaiseRisk(role) && canViewLetters(role);

export const HINDRANCE_SOURCES = ['RULES', 'MODEL'] as const;
export type HindranceSource = (typeof HINDRANCE_SOURCES)[number];

/** A DPR remark read as a hindrance, waiting for the project manager to record or dismiss it. */
export interface HindranceSuggestionDto {
  id: string;
  dprId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** The DPR's date */
  reportDate: string;
  /** The remark as written on the DPR */
  remark: string;
  title: string;
  category: RiskCategory;
  party: DelayParty | null;
  /** The day work was first held up, from the remark ("since Monday", "3 din se") or the DPR's date */
  delayStart: string;
  /** The words that gave it away, for the card's Why */
  matched: string[];
  source: HindranceSource;
  /** An open delay on the same project and cause the remark may belong to instead */
  openDelay: { id: string; riskNo: string; title: string } | null;
}

/** The project's notice period: as set on the contract, or as the filed contract reads (with its clause and page). */
export interface NoticePeriodDto {
  projectId: string;
  /** Set on the contract; null = not set */
  days: number | null;
  /** What the clock uses: `days`, else the contract's, else DEFAULT_NOTICE_DAYS */
  effectiveDays: number;
  /** The clause found in the filed contract, if any */
  found: { days: number; clause: string; text: string; docNo: string; page: number; documentId: string } | null;
}

/** A delay's notice clock. */
export interface NoticeClockDto {
  riskId: string;
  /** False when the delay is the contractor's own, closed, or has an outgoing letter linked */
  running: boolean;
  noticeDays: number;
  /** delayStart + noticeDays */
  due: string;
  /** Negative once past */
  daysLeft: number;
  /** The outgoing letters linked to the delay, the first of which is the notice */
  noticeSent: { letterId: string; letterNo: string; letterDate: string } | null;
  /** Where the notice period comes from, in words: "Clause 9.1 of RD-AGR-01, page 3" or "Set on the contract" */
  source: string;
}

/** One delay in the register printout for an extension-of-time claim. */
export interface DelayRegisterRowDto {
  riskId: string;
  riskNo: string;
  title: string;
  category: RiskCategory;
  party: DelayParty | null;
  activityName: string | null;
  delayStart: string;
  delayEnd: string | null;
  daysLost: number;
  status: string;
  eotClaimed: boolean;
  eotGrantedDays: number | null;
  notice: NoticeClockDto;
  letters: { letterNo: string; letterDate: string; direction: 'IN' | 'OUT'; subject: string }[];
  /** DPR remarks recorded into this delay */
  remarks: { reportDate: string; remark: string }[];
}

export interface DelayRegisterDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string | null;
  agreementNo: string | null;
  asOf: string;
  rows: DelayRegisterRowDto[];
  /** Days lost to delays the contractor is not answerable for */
  excusableDays: number;
}
