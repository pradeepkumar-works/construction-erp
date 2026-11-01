'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import { tk } from '@/ds';
import { TENDER_DUE_DAYS, TENDER_STATUS_LABELS, rankLabel, type TenderStatus } from '@erp/shared';

export function TenderStatusTag({ status }: { status: TenderStatus }) {
  return <AppTag kind="tender" status={status}>{TENDER_STATUS_LABELS[status]}</AppTag>;
}

/** How long is left to submit a tender being prepared: overdue, due soon or the days left. */
export function DueTag({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return <AppTag meaning="failed">{`${-days} day${days === -1 ? '' : 's'} late`}</AppTag>;
  if (days === 0) return <AppTag meaning="waiting">Due today</AppTag>;
  return <AppTag meaning={days <= TENDER_DUE_DAYS ? 'waiting' : 'inHand'}>{`${days} day${days === 1 ? '' : 's'} left`}</AppTag>;
}

/** A place among the bids or quotations, as text (a rank is a figure, not a state): L1 in bold, others plain. */
export function RankText({ rank }: { rank: number | null | undefined }) {
  if (!rank) return null;
  return (
    <span translate="no" style={rank === 1 ? tk.type.strong : undefined}>
      {rankLabel(rank)}
    </span>
  );
}
