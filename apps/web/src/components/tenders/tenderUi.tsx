'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import { TENDER_DUE_DAYS, TENDER_STATUS_LABELS, rankLabel, type TenderStatus } from '@erp/shared';

export const TENDER_STATUS_COLORS: Record<TenderStatus, string | undefined> = {
  PREPARING: 'processing',
  SUBMITTED: 'gold',
  WON: 'success',
  LOST: 'error',
  DROPPED: undefined,
  CANCELLED: undefined,
};

export function TenderStatusTag({ status }: { status: TenderStatus }) {
  return <AppTag color={TENDER_STATUS_COLORS[status]}>{TENDER_STATUS_LABELS[status]}</AppTag>;
}

/** How long is left to submit a tender being prepared: overdue, due soon or the days left. */
export function DueTag({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return <AppTag tone="danger">{`${-days} day${days === -1 ? '' : 's'} late`}</AppTag>;
  if (days === 0) return <AppTag tone="pending">Due today</AppTag>;
  return <AppTag color={days <= TENDER_DUE_DAYS ? 'warning' : undefined}>{`${days} day${days === 1 ? '' : 's'} left`}</AppTag>;
}

/** Our place among the bids: L1 in green, others plain. */
export function RankTag({ rank }: { rank: number | null }) {
  if (!rank) return null;
  return <AppTag color={rank === 1 ? 'success' : undefined}>{rankLabel(rank)}</AppTag>;
}
