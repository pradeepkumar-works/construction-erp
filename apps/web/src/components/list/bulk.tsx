'use client';

import React from 'react';
import { App } from 'antd';
import { CheckOutlined, DownloadOutlined } from '@/components/common/icons';
import type { SubmissionStatus, SubmissionType } from '@erp/shared';
import { mayApproveType, mayApproveTypeAtAll } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { handledInPlace, useNotify } from '@/lib/notify';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { showReviewed, usePendingApprovals, useReview, type ApprovalTypeParam } from '@/lib/queries';
import type { BulkAction } from './DataTable';

/**
 * Approves entries one after another, as if one by one (each writes its own audit line and tells its submitter). They
 * all show as approved at once (UX item 86); if one is refused it stops there, puts the list back as the server has it,
 * and says how far it got, with Retry for the rest. Resolves to the number approved.
 */
export function useApproveMany() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
  const review = useReview();
  const run = async (type: ApprovalTypeParam, ids: string[]): Promise<number> => {
    const rollback = await showReviewed(qc, ids, 'APPROVE');
    let done = 0;
    try {
      for (const id of ids) {
        try {
          await handledInPlace(() => review.mutateAsync({ type, id, decision: 'APPROVE', batch: true }));
          done += 1;
        } catch (err) {
          rollback();
          notify.failed(err, () => void run(type, ids.slice(done)), `Stopped after ${done} of ${ids.length}.`);
          return done;
        }
      }
      message.success(`Approved ${done} ${done === 1 ? 'entry' : 'entries'}`);
      return done;
    } finally {
      void qc.invalidateQueries();
    }
  };
  return run;
}

/**
 * "Approve n" for a selection that is all waiting for this user: in their Approvals queue, which knows each entry's
 * level (v5 item 94); until it has loaded, within their level-1 limit.
 */
export function useBulkApprove<T extends { id: string; status: SubmissionStatus }>(type: ApprovalTypeParam, amountOf?: (row: T) => string | null | undefined): BulkAction<T> | null {
  const { user } = useAuth();
  const approveMany = useApproveMany();
  const kind = type.toUpperCase() as SubmissionType;
  const could = !!user && mayApproveTypeAtAll(user, kind);
  const { data: queue } = usePendingApprovals(could);
  if (!user || !could) return null;
  const queued = queue ? new Set(queue.filter((p) => p.type === kind).map((p) => p.id)) : null;
  return {
    key: 'approve',
    label: 'Approve',
    icon: <CheckOutlined />,
    primary: true,
    allowed: (rows) => rows.every((r) => r.status === 'SUBMITTED' && (queued ? queued.has(r.id) : mayApproveType(user, kind, amountOf?.(r) ?? null))),
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
