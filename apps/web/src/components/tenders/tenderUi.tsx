'use client';

import React from 'react';
import { Tag } from 'antd';
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
  return <Tag color={TENDER_STATUS_COLORS[status]}>{TENDER_STATUS_LABELS[status]}</Tag>;
}

/** How long is left to submit a tender being prepared: overdue, due soon or the days left. */
export function DueTag({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return <Tag color="error">{`${-days} day${days === -1 ? '' : 's'} late`}</Tag>;
  if (days === 0) return <Tag color="warning">Due today</Tag>;
  return <Tag color={days <= TENDER_DUE_DAYS ? 'warning' : undefined}>{`${days} day${days === 1 ? '' : 's'} left`}</Tag>;
}

/** Our place among the bids: L1 in green, others plain. */
export function RankTag({ rank }: { rank: number | null }) {
  if (!rank) return null;
  return <Tag color={rank === 1 ? 'success' : undefined}>{rankLabel(rank)}</Tag>;
}
