'use client';

import React from 'react';
import { Tag } from 'antd';
import type { StockEntryType } from '@erp/shared';
import { STOCK_ENTRY_TYPE_LABELS } from '@erp/shared';
import { STOCK_ENTRY_COLORS } from '@/lib/format';

export const StockTypeTag = ({ type }: { type: StockEntryType }) => (
  <Tag color={STOCK_ENTRY_COLORS[type]} style={{ margin: 0 }}>
    {STOCK_ENTRY_TYPE_LABELS[type]}
  </Tag>
);

/** One line of what an entry was about: supplier and request for a GRN, who took it for an issue, the reason for an adjustment. */
export function entrySummary(e: { type: StockEntryType; supplier: string | null; requestNo: string | null; challanNo: string | null; issuedTo: string | null; activityName: string | null; remarks: string | null }): string {
  if (e.type === 'RECEIPT') return [e.supplier, e.requestNo && `against ${e.requestNo}`, e.challanNo && `challan ${e.challanNo}`].filter(Boolean).join(', ') || '-';
  if (e.type === 'ISSUE') return [e.issuedTo && `to ${e.issuedTo}`, e.activityName && `for ${e.activityName}`].filter(Boolean).join(' ') || '-';
  return e.remarks ?? '-';
}
