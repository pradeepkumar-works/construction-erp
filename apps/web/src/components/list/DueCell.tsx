'use client';

import React from 'react';
import dayjs from 'dayjs';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { formatDate, formatDue, NO_VALUE, todayDate } from '@/lib/format';

/** How soon a due date counts as close: within this many days it waits on someone. */
const SOON_DAYS = 3;

/** Days from today (India) to a `YYYY-MM-DD` date; negative once it has passed. */
export const daysUntil = (date: string): number => dayjs(date.slice(0, 10)).diff(dayjs(todayDate()), 'day');

/**
 * A due date in a list: the date, and under it how far off it is ("3 days late" red, "in 2 days" amber, later ones quiet).
 * A record that is done shows the date alone.
 */
export function DueCell({ date, done = false }: { date: string | null | undefined; done?: boolean }) {
  if (!date) return <span className="text-muted">{NO_VALUE}</span>;
  const days = daysUntil(date);
  const when = done ? null : days < 0 ? (
    <AppTag meaning="failed">{formatDue(days)}</AppTag>
  ) : days <= SOON_DAYS ? (
    <AppTag meaning="waiting">{formatDue(days)}</AppTag>
  ) : (
    <span className="text-muted" style={tk.type.caption}>
      {formatDue(days)}
    </span>
  );
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <span translate="no">{formatDate(date)}</span>
      {when ? <div>{when}</div> : null}
    </div>
  );
}
