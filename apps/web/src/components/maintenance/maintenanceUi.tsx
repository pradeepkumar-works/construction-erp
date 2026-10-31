'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { ExpiryState, MaintenanceKind, MaintenanceStatus, ServiceState } from '@erp/shared';
import { EXPIRY_STATE_LABELS, MAINTENANCE_KIND_LABELS, MAINTENANCE_STATUS_LABELS, SERVICE_STATE_LABELS } from '@erp/shared';
import { NO_VALUE } from '@/lib/format';

const SERVICE_COLORS: Record<ServiceState, string> = { OVERDUE: 'red', DUE_SOON: 'gold', OK: 'green', NOT_SET: 'default' };
const EXPIRY_COLORS: Record<ExpiryState, string> = { EXPIRED: 'red', EXPIRING: 'gold', VALID: 'green' };

export const ServiceStateTag = ({ state }: { state: ServiceState }) => (
  <AppTag color={SERVICE_COLORS[state]} style={{ margin: 0 }}>
    {SERVICE_STATE_LABELS[state]}
  </AppTag>
);

/** Expired / expiring in N days / valid. */
export const ExpiryTag = ({ state, daysLeft }: { state: ExpiryState | null; daysLeft: number | null }) =>
  state ? (
    <AppTag color={EXPIRY_COLORS[state]} style={{ margin: 0 }}>
      {state === 'EXPIRING' && daysLeft !== null ? (daysLeft === 0 ? 'Expires today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`) : EXPIRY_STATE_LABELS[state]}
    </AppTag>
  ) : (
    <span className="text-muted">{NO_VALUE}</span>
  );

export const JobKindTag = ({ kind }: { kind: MaintenanceKind }) => (
  <AppTag color={kind === 'BREAKDOWN' ? 'volcano' : 'blue'} style={{ margin: 0 }}>
    {MAINTENANCE_KIND_LABELS[kind]}
  </AppTag>
);

export const JobStatusTag = ({ status }: { status: MaintenanceStatus }) => (
  <AppTag color={status === 'OPEN' ? 'orange' : 'default'} style={{ margin: 0 }}>
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
