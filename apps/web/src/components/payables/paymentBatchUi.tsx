'use client';

import React from 'react';
import type { useQueryClient } from '@tanstack/react-query';
import { PAYMENT_BATCH_LINE_STATE_LABELS, PAYMENT_BATCH_STATUS_LABELS, type PaymentBatchLineState, type PaymentBatchStatus } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';

export const BATCHES = '/bank-payments';
export const batchHref = (id: string) => `${BATCHES}/${id}`;

/** A batch's payments change payables, payment requests and the books with it. */
export function invalidateBatches(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['payment-batches', 'payables', 'payment-requests', 'vendor-payments', 'books']) qc.invalidateQueries({ queryKey: [key] });
}

export const BatchStatusTag = ({ status }: { status: PaymentBatchStatus }) => (
  <AppTag kind="paymentBatch" status={status}>
    {PAYMENT_BATCH_STATUS_LABELS[status]}
  </AppTag>
);

export const LineStateTag = ({ state }: { state: PaymentBatchLineState }) => (
  <AppTag kind="paymentBatchLine" status={state}>
    {PAYMENT_BATCH_LINE_STATE_LABELS[state]}
  </AppTag>
);
