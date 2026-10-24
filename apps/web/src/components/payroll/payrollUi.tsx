'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { PayrollRunStatus, SettlementStatus } from '@erp/shared';
import { PAYROLL_RUN_STATUS_LABELS, SETTLEMENT_STATUS_LABELS } from '@erp/shared';
import { formatINR } from '@/lib/format';

const COLOR: Record<PayrollRunStatus, string> = { DRAFT: 'default', SUBMITTED: 'processing', APPROVED: 'gold', PAID: 'success' };

export const RunStatusTag = ({ status }: { status: PayrollRunStatus }) => <AppTag color={COLOR[status]}>{PAYROLL_RUN_STATUS_LABELS[status]}</AppTag>;
export const SettlementStatusTag = ({ status }: { status: SettlementStatus }) => <AppTag color={COLOR[status]}>{SETTLEMENT_STATUS_LABELS[status]}</AppTag>;

/** Rupees in a table cell, kept out of translation. */
export const Rupees = ({ value }: { value: string | number | null | undefined }) => <span translate="no">{formatINR(value)}</span>;

/** Save text the API made (bank file, ECR, ESI sheet) as a file. */
export function saveText(fileName: string, mimeType: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "October 2026" from "2026-10". */
export const monthLabel = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
