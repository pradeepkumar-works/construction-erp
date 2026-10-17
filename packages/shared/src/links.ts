import type { SubmissionType } from './enums';

/** Web pages of each submission type: its own record page (UI roadmap items 57 and 61). */
const RECORD_PAGES: Partial<Record<SubmissionType, string>> = {
  PROGRESS: '/progress',
  DPR: '/dpr',
  MATERIAL_REQUEST: '/material-requests',
  PURCHASE_ORDER: '/purchase-orders',
  BILL: '/bills',
  MACHINERY: '/machinery',
  EXPENSE: '/expenses',
  MEASUREMENT: '/measurements',
  VENDOR_BILL: '/vendor-bills',
  WORK_ORDER: '/work-orders',
  SUBCONTRACT_BILL: '/subcontract-bills',
  INSPECTION: '/inspections',
};

const LIST_PAGES: Record<SubmissionType, string> = {
  PROGRESS: '/progress',
  DPR: '/dpr',
  MATERIAL_REQUEST: '/material-requests',
  MACHINERY: '/machinery',
  EXPENSE: '/expenses',
  MEASUREMENT: '/measurements',
  BILL: '/bills',
  PURCHASE_ORDER: '/purchase-orders',
  VENDOR_BILL: '/vendor-bills',
  WORK_ORDER: '/work-orders',
  SUBCONTRACT_BILL: '/subcontract-bills',
  INSPECTION: '/inspections',
};

/** The record's own page, or null for types that only have a list so far. */
export const submissionPage = (type: SubmissionType, id: string): string | null => (RECORD_PAGES[type] ? `${RECORD_PAGES[type]}/${id}` : null);

/** Where to open a submission on the web: its page, else its list. */
export const submissionHref = (type: SubmissionType, id: string): string => submissionPage(type, id) ?? LIST_PAGES[type];
