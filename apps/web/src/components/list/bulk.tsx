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
 * Approves entries one after another, as if one by one (each writes its own audit line and tells its submitter); stops
 * at the first that fails and says how far it got. Resolves to the number approved.
 */
export function useApproveMany() {
  const { message } = App.useApp();
  const review = useReview();
  return async (type: ApprovalTypeParam, ids: string[]) => {
    let done = 0;
    for (const id of ids) {
      try {
        await review.mutateAsync({ type, id, decision: 'APPROVE' });
        done += 1;
      } catch (err) {
        message.error(`Stopped after ${done} of ${ids.length}: ${errorMessage(err)}`);
        return done;
      }
    }
    message.success(`Approved ${done} ${done === 1 ? 'entry' : 'entries'}`);
    return done;
  };
}

/** "Approve n" for a selection that is all waiting and within this user's approval limit. */
export function useBulkApprove<T extends { id: string; status: SubmissionStatus }>(type: ApprovalTypeParam, amountOf?: (row: T) => string | null | undefined): BulkAction<T> | null {
  const { user } = useAuth();
  const approveMany = useApproveMany();
  const kind = type.toUpperCase() as SubmissionType;
  if (!user || !mayApproveType(user, kind)) return null;
  return {
    key: 'approve',
    label: 'Approve',
    icon: <CheckOutlined />,
    primary: true,
    allowed: (rows) => rows.every((r) => r.status === 'SUBMITTED' && mayApproveType(user, kind, amountOf?.(r) ?? null)),
    run: async (rows) => {
      await approveMany(type, rows.map((r) => r.id));
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
