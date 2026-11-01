/**
 * Site imprest: a petty cash float held by one person at one project. Cash advanced to them is spent by
 * their cash site expenses; a top-up brings the cash in hand back to the float.
 */
import type { ImprestEntryKind, ImprestEntryStatus, PaymentMode, SubmissionStatus } from './enums';

/** Cash in hand below this share of the float shows as low. */
export const IMPREST_LOW_PCT = 20;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ImprestFigures {
  /** Cash advanced and paid */
  advanced: number;
  /** Cash handed back */
  returned: number;
  /** Cash expenses approved */
  approvedSpend: number;
  /** Cash expenses submitted and not yet decided (or sent back for changes) */
  pendingSpend: number;
  /** Cash expenses turned down: the holder has to account for that cash */
  disallowed: number;
  /** advanced - returned - approved - pending */
  cashInHand: number;
  /** What brings the cash in hand back to the float (never negative) */
  topUpDue: number;
  low: boolean;
}

/** The imprest's figures from its float, advances, returns and the holder's cash expenses (rupees). */
export function imprestFigures(float: number, advanced: number, returned: number, approvedSpend: number, pendingSpend: number, disallowed: number): ImprestFigures {
  const cashInHand = r2(advanced - returned - approvedSpend - pendingSpend);
  return {
    advanced: r2(advanced),
    returned: r2(returned),
    approvedSpend: r2(approvedSpend),
    pendingSpend: r2(pendingSpend),
    disallowed: r2(disallowed),
    cashInHand,
    topUpDue: Math.max(0, r2(float - cashInHand)),
    low: float > 0 && cashInHand < (float * IMPREST_LOW_PCT) / 100,
  };
}

/** Which of the holder's expenses spend the imprest: cash, and not a draft. */
export const spendsImprest = (paymentMode: PaymentMode, status: SubmissionStatus) => paymentMode === 'CASH' && status !== 'DRAFT';

export interface ImprestEntryDto {
  id: string;
  kind: ImprestEntryKind;
  status: ImprestEntryStatus;
  amount: string;
  date: string;
  reason: string | null;
  paidOn: string | null;
  paymentMode: PaymentMode | null;
  reference: string | null;
  requestedByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** The fund request this advance releases */
  paymentRequestId: string | null;
  requestNo: string | null;
  createdAt: string;
}

export interface ImprestDto {
  id: string;
  projectId: string;
  projectName: string;
  holderId: string;
  holderName: string;
  floatAmount: string;
  openedOn: string;
  closedOn: string | null;
  isActive: boolean;
  note: string | null;
  advanced: string;
  returned: string;
  approvedSpend: string;
  pendingSpend: string;
  disallowed: string;
  cashInHand: string;
  topUpDue: string;
  low: boolean;
  /** The top-up waiting to be paid, if any (one at a time) */
  openRequest: ImprestEntryDto | null;
  lastAdvanceOn: string | null;
  createdAt: string;
}

export interface ImprestLedgerLine {
  date: string;
  kind: 'ADVANCE' | 'RETURN' | 'EXPENSE';
  /** Expense number, or the payment's cheque / UTR reference */
  ref: string | null;
  description: string;
  /** For an expense, its approval status */
  status: SubmissionStatus | null;
  cashIn: string;
  cashOut: string;
  /** Cash in hand after this line */
  balance: string;
  expenseId: string | null;
}

export interface ImprestDetailDto extends ImprestDto {
  entries: ImprestEntryDto[];
  /** Oldest first, with the running cash in hand */
  ledger: ImprestLedgerLine[];
}
