/** Variation register: changes to the contract claimed from the client, and the client's decision. */

import type { AttachmentDto } from './types';

export const VARIATION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];
export const VARIATION_STATUS_LABELS: Record<VariationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'With client',
  APPROVED: 'Approved by client',
  REJECTED: 'Rejected by client',
};

export const VARIATION_CAUSES = ['CLIENT_INSTRUCTION', 'DESIGN_CHANGE', 'SITE_CONDITION', 'QUANTITY_DEVIATION', 'OTHER'] as const;
export type VariationCause = (typeof VARIATION_CAUSES)[number];
export const VARIATION_CAUSE_LABELS: Record<VariationCause, string> = {
  CLIENT_INSTRUCTION: "Client's instruction",
  DESIGN_CHANGE: 'Drawing or design change',
  SITE_CONDITION: 'Site condition',
  QUANTITY_DEVIATION: 'Quantity beyond BOQ',
  OTHER: 'Other',
};

/** "V-3" */
export const variationLabel = (varNo: number): string => `V-${varNo}`;

/** A BOQ item with no quantity (original 0 and no revised quantity) is an extra item waiting for an approved variation. */
export const isUnapprovedExtra = (originalQty: string | number, revisedQty: string | number | null): boolean => Number(revisedQty ?? originalQty) === 0;

export interface VariationLineDto {
  id: string;
  boqItemId: string | null;
  isNewItem: boolean;
  itemNo: string;
  description: string;
  unit: string;
  /** Change in quantity (negative when omitted); a new item's whole quantity */
  qty: string;
  rate: string;
  amount: string;
  approvedQty: string | null;
  approvedRate: string | null;
  approvedAmount: string | null;
}

export interface VariationDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  varNo: number;
  label: string;
  title: string;
  cause: VariationCause;
  description: string | null;
  status: VariationStatus;
  claimedAmount: string;
  approvedAmount: string | null;
  submittedDate: string | null;
  submittedRef: string | null;
  decidedDate: string | null;
  clientRef: string | null;
  decisionNote: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  lines: VariationLineDto[];
  attachments: AttachmentDto[];
}

/** Per project: contract value, approved variations and the revised contract value. */
export interface VariationSummaryDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  contractValue: string | null;
  /** Sum approved by the client */
  approved: string;
  /** Claimed in variations still with the client */
  pending: string;
  /** contractValue + approved (null without a contract value) */
  revisedContractValue: string | null;
  count: number;
  /** BOQ items with no quantity that bills hold back until a variation for them is approved */
  unapprovedExtraItems: number;
}
