'use client';

import React from 'react';
import { App } from 'antd';
import { CheckOutlined, DownloadOutlined } from '@ant-design/icons';
import type { SubmissionStatus, SubmissionType } from '@erp/shared';
import { mayApproveType } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { useReview, type ApprovalTypeParam } from '@/lib/queries';
import type { BulkAction } from './DataTable';

/**
 * "Approve n" for a selection that is all waiting and within this user's approval limit; one approval per entry, as if
 * approved one by one (each writes its own audit line and tells its submitter).
 */
export function useBulkApprove<T extends { id: string; status: SubmissionStatus }>(type: ApprovalTypeParam, amountOf?: (row: T) => string | null | undefined): BulkAction<T> | null {
  const { user } = useAuth();
  const { message } = App.useApp();
  const review = useReview();
  const kind = type.toUpperCase() as SubmissionType;
  if (!user || !mayApproveType(user, kind)) return null;
  return {
    key: 'approve',
    label: 'Approve',
    icon: <CheckOutlined />,
    primary: true,
    allowed: (rows) => rows.every((r) => r.status === 'SUBMITTED' && mayApproveType(user, kind, amountOf?.(r) ?? null)),
    run: async (rows) => {
      let done = 0;
      for (const r of rows) {
        try {
          await review.mutateAsync({ type, id: r.id, decision: 'APPROVE' });
          done += 1;
        } catch (err) {
          message.error(`Stopped after ${done} of ${rows.length}: ${errorMessage(err)}`);
          return;
        }
      }
      message.success(`Approved ${done} ${done === 1 ? 'entry' : 'entries'}`);
    },
  };
}

/** "Export" of just the selected rows, with the same columns (and row mapping, `toRows`) as the list's full export. */
export function exportSelected<T extends { id: string }, R = T>(base: string, sheet: string, columns: ExportColumn<R>[], toRows?: (rows: T[]) => R[]): BulkAction<T> {
  return {
    key: 'export',
    label: 'Export',
    icon: <DownloadOutlined />,
    run: (rows) => downloadXlsx(exportFileName(base), sheet, columns, toRows ? toRows(rows) : (rows as unknown as R[])),
  };
}
