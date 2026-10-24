'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { RfiAge, RfiPriority, RfiStatus } from '@erp/shared';
import { RFI_STATUS_LABELS } from '@erp/shared';

const STATUS_COLOR: Record<RfiStatus, string> = { OPEN: 'blue', ANSWERED: 'gold', CLOSED: 'green', WITHDRAWN: 'default' };

/** An RFI's status, saying "overdue" in words when it is late (colour never alone). */
export function RfiStatusTag({ status, age }: { status: RfiStatus; age?: RfiAge }) {
  if (status === 'OPEN' && age?.overdue)
    return (
      <AppTag tone="danger" style={{ margin: 0 }}>
        {age.daysOverdue === 1 ? '1 day overdue' : `${age.daysOverdue} days overdue`}
      </AppTag>
    );
  return (
    <AppTag color={STATUS_COLOR[status]} style={{ margin: 0 }}>
      {RFI_STATUS_LABELS[status]}
    </AppTag>
  );
}

export function UrgentTag({ priority }: { priority: RfiPriority }) {
  return priority === 'URGENT' ? (
    <AppTag tone="pending" style={{ margin: 0 }}>
      Urgent
    </AppTag>
  ) : null;
}

/** "Waiting 3 days", "Answered in 5 days (2 late)". */
export function ageText(status: RfiStatus, age: RfiAge): string {
  const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
  if (status === 'OPEN') return `Waiting ${days(age.daysOpen)}`;
  if (age.answeredLateBy === null) return '';
  const late = age.answeredLateBy > 0 ? ` (${days(age.answeredLateBy)} late)` : '';
  return `Answered in ${days(age.daysOpen)}${late}`;
}
