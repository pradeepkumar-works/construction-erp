/**
 * Machine finance: a loan taken on a machine from a bank or a finance company, its EMI schedule (each
 * month's interest on what is still owed, the rest of the EMI repaying the loan), the EMIs paid and those due. The loan
 * posts to the books as a secured loan, each EMI paid as a payment of principal and interest, and the interest is the
 * machine's cost of finance.
 */
import type { PaymentMode } from './enums';

/** What the lender did with the money: paid the dealer for the machine, or credited the company's bank. */
export const LOAN_DISBURSALS = ['MACHINE_COST', 'BANK'] as const;
export type LoanDisbursal = (typeof LOAN_DISBURSALS)[number];
export const LOAN_DISBURSAL_LABELS: Record<LoanDisbursal, string> = {
  MACHINE_COST: 'Paid the dealer for the machine',
  BANK: 'Credited to our bank account',
};
/** What the disbursal is booked to: the machine's cost (Plant and Machinery), or the bank. */
export const LOAN_DISBURSAL_HELP: Record<LoanDisbursal, string> = {
  MACHINE_COST: 'Booked to Plant and Machinery against the loan. Book the down payment from Payables or the books as usual.',
  BANK: 'Booked to the bank against the loan: a loan against a machine the company already owns.',
};

export const EQUIPMENT_LOAN_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type EquipmentLoanStatus = (typeof EQUIPMENT_LOAN_STATUSES)[number];
export const EQUIPMENT_LOAN_STATUS_LABELS: Record<EquipmentLoanStatus, string> = { ACTIVE: 'Running', CLOSED: 'Repaid' };

/** Where an EMI stands on a day: paid, past its date unpaid, falling due within `EMI_DUE_DAYS`, or later. */
export const EMI_STAGES = ['PAID', 'OVERDUE', 'DUE', 'LATER'] as const;
export type EmiStage = (typeof EMI_STAGES)[number];
export const EMI_STAGE_LABELS: Record<EmiStage, string> = { PAID: 'Paid', OVERDUE: 'Overdue', DUE: 'Due soon', LATER: 'Later' };
/** EMIs falling due within this many days are reminded and shown as due. */
export const EMI_DUE_DAYS = 7;

/** Longest tenure a loan may have, in months, and the highest yearly rate. */
export const LOAN_MAX_MONTHS = 120;
export const LOAN_MAX_RATE = 36;

export interface LoanEmiDto {
  id: string;
  no: number;
  dueDate: string;
  /** Owed before this EMI */
  opening: string;
  principal: string;
  interest: string;
  emi: string;
  /** Owed after it */
  closing: string;
  stage: EmiStage;
  paidOn: string | null;
  mode: PaymentMode | null;
  reference: string | null;
  paidByName: string | null;
}

export interface EquipmentLoanDto {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  /** Where the machine is now */
  projectName: string | null;
  lenderName: string;
  vendorId: string | null;
  loanNo: string;
  sanctionDate: string;
  amount: string;
  /** Yearly rate, % */
  ratePct: string;
  tenureMonths: number;
  emi: string;
  firstEmiDate: string;
  disbursal: LoanDisbursal;
  status: EquipmentLoanStatus;
  closedOn: string | null;
  note: string | null;
  emisPaid: number;
  /** EMIs in its schedule (fewer than the tenure when the lender's EMI repays it sooner or it closed early) */
  emiCount: number;
  principalRepaid: string;
  interestPaid: string;
  /** Principal still owed */
  outstanding: string;
  overdueCount: number;
  overdueAmount: string;
  /** The next EMI to pay */
  nextDue: { no: number; dueDate: string; emi: string; stage: EmiStage } | null;
  createdByName: string;
  createdAt: string;
}

export interface EquipmentLoanDetailDto extends EquipmentLoanDto {
  emis: LoanEmiDto[];
  /** Interest still to pay over the rest of the schedule */
  interestToCome: string;
  /** The machine's cost of finance: interest paid over the hours it has worked since the loan */
  hoursWorked: string;
  interestPerHour: string | null;
  canManage: boolean;
}

/** Outstanding by lender, on the Machine loans page. */
export interface LenderOutstandingDto {
  lenderName: string;
  loans: number;
  outstanding: string;
  overdueAmount: string;
  /** EMIs falling due in the next 30 days */
  dueIn30: string;
}

export interface EquipmentLoanSummaryDto {
  loans: number;
  outstanding: string;
  overdueCount: number;
  overdueAmount: string;
  dueIn30: string;
  interestThisYear: string;
  lenders: LenderOutstandingDto[];
}

/** The loan figures a schedule preview needs (the form shows the EMI and schedule as it is typed). */
export interface LoanPreviewDto {
  emi: string;
  totalInterest: string;
  rows: { no: number; dueDate: string; principal: string; interest: string; emi: string; closing: string }[];
  problem: string | null;
}

export interface EquipmentLoanListDto {
  items: EquipmentLoanDto[];
  summary: EquipmentLoanSummaryDto;
}
