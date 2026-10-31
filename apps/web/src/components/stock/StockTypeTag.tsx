'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { StockEntryType } from '@erp/shared';
import { STOCK_ENTRY_TYPE_LABELS } from '@erp/shared';
import { STOCK_ENTRY_COLORS, NO_VALUE } from '@/lib/format';

export const StockTypeTag = ({ type }: { type: StockEntryType }) => (
  <AppTag color={STOCK_ENTRY_COLORS[type]} style={{ margin: 0 }}>
    {STOCK_ENTRY_TYPE_LABELS[type]}
  </AppTag>
);

/** One line of what an entry was about: supplier and request for a GRN, who took it for an issue, where a transfer went, the reason for an adjustment. */
export function entrySummary(e: {
  type: StockEntryType;
  supplier: string | null;
  requestNo: string | null;
  poNo?: string | null;
  challanNo: string | null;
  issuedTo: string | null;
  activityName: string | null;
  remarks: string | null;
  toProjectName?: string | null;
  transferInNo?: string | null;
  fromProjectName?: string | null;
  transferOutNo?: string | null;
}): string {
  if (e.type === 'TRANSFER_OUT') return [`to ${e.toProjectName ?? e.issuedTo ?? NO_VALUE}`, e.transferInNo ? `received as ${e.transferInNo}` : 'in transit'].join(', ');
  if (e.type === 'TRANSFER_IN') return [`from ${e.fromProjectName ?? e.supplier ?? NO_VALUE}`, e.transferOutNo && `sent as ${e.transferOutNo}`].filter(Boolean).join(', ');
  if (e.type === 'RETURN_TO_VENDOR') return [e.supplier && `back to ${e.supplier}`, e.remarks].filter(Boolean).join(': ') || NO_VALUE;
  if (e.type === 'RETURN_FROM_SITE') return [e.issuedTo && `from ${e.issuedTo}`, e.activityName && `(${e.activityName})`].filter(Boolean).join(' ') || '-';
  if (e.type === 'RECEIPT') return [e.supplier, (e.poNo ?? e.requestNo) && `against ${e.poNo ?? e.requestNo}`, e.challanNo && `challan ${e.challanNo}`].filter(Boolean).join(', ') || '-';
  if (e.type === 'ISSUE') return [e.issuedTo && `to ${e.issuedTo}`, e.activityName && `for ${e.activityName}`].filter(Boolean).join(' ') || '-';
  return e.remarks ?? NO_VALUE;
}
