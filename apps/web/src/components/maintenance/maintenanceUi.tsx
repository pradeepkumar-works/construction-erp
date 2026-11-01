'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { ExpiryState, MaintenanceKind, MaintenanceStatus, ServiceState } from '@erp/shared';
import { EXPIRY_STATE_LABELS, MAINTENANCE_KIND_LABELS, MAINTENANCE_STATUS_LABELS, SERVICE_STATE_LABELS } from '@erp/shared';
import { NO_VALUE } from '@/lib/format';


export const ServiceStateTag = ({ state }: { state: ServiceState }) => (
  <AppTag kind="service" status={state} style={{ margin: 0 }}>
    {SERVICE_STATE_LABELS[state]}
  </AppTag>
);

/** Expired / expiring in N days / valid. */
export const ExpiryTag = ({ state, daysLeft }: { state: ExpiryState | null; daysLeft: number | null }) =>
  state ? (
    <AppTag kind="expiry" status={state} style={{ margin: 0 }}>
      {state === 'EXPIRING' && daysLeft !== null ? (daysLeft === 0 ? 'Expires today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`) : EXPIRY_STATE_LABELS[state]}
    </AppTag>
  ) : (
    <span className="text-muted">{NO_VALUE}</span>
  );

export const JobKindTag = ({ kind }: { kind: MaintenanceKind }) => (
  <AppTag variant="kind" style={{ margin: 0 }}>
    {MAINTENANCE_KIND_LABELS[kind]}
  </AppTag>
);

export const JobStatusTag = ({ status }: { status: MaintenanceStatus }) => (
  <AppTag kind="maintenance" status={status} style={{ margin: 0 }}>
    {MAINTENANCE_STATUS_LABELS[status]}
  </AppTag>
);

/** "120 h or 12 days left", "overdue by 5 days". */
export function serviceLeft(hoursLeft: number | null, daysLeft: number | null): string {
  const parts = [hoursLeft !== null ? { n: hoursLeft, u: 'h' } : null, daysLeft !== null ? { n: daysLeft, u: 'days' } : null].filter((x): x is { n: number; u: string } => !!x);
  const over = parts.filter((p) => p.n <= 0);
  if (over.length) return `overdue by ${over.map((p) => `${Math.abs(p.n)} ${p.u}`).join(' / ')}`;
  return `${parts.map((p) => `${p.n} ${p.u}`).join(' or ')} left`;
}
