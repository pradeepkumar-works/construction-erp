'use client';

import React from 'react';
import { Timeline, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { AuditLogDto, SafetyIncidentStatus, SafetyIncidentType, WorkPermitDto } from '@erp/shared';
import { SAFETY_INCIDENT_STATUS_LABELS, SAFETY_INCIDENT_TYPE_LABELS, WORK_PERMIT_STATUS_LABELS, WORK_PERMIT_TYPE_LABELS } from '@erp/shared';
import { formatDateTime, formatDayMonth } from '@/lib/format';
import dayjs from 'dayjs';
import { themeFontSize } from '@/lib/theme';

export const INCIDENT_TYPE_COLORS: Record<SafetyIncidentType, string> = {
  NEAR_MISS: 'gold',
  FIRST_AID: 'orange',
  MEDICAL_TREATMENT: 'volcano',
  LOST_TIME: 'red',
  PROPERTY_DAMAGE: 'purple',
  FATALITY: 'magenta',
};

export const IncidentTypeTag = ({ type }: { type: SafetyIncidentType }) => (
  <AppTag color={INCIDENT_TYPE_COLORS[type]} style={{ margin: 0 }}>
    {SAFETY_INCIDENT_TYPE_LABELS[type]}
  </AppTag>
);

export const IncidentStatusTag = ({ status }: { status: SafetyIncidentStatus }) => (
  <AppTag color={status === 'OPEN' ? 'red' : 'default'} style={{ margin: 0 }}>
    {SAFETY_INCIDENT_STATUS_LABELS[status]}
  </AppTag>
);

const PERMIT_COLORS = { REQUESTED: 'gold', ISSUED: 'green', REJECTED: 'red', CLOSED: 'default' } as const;

/** Status, with an issued permit past its end shown as expired. */
export const PermitStatusTag = ({ p }: { p: Pick<WorkPermitDto, 'status' | 'expired'> }) =>
  p.expired ? (
    <AppTag tone="pending" style={{ margin: 0 }}>
      Expired
    </AppTag>
  ) : (
    <AppTag color={PERMIT_COLORS[p.status]} style={{ margin: 0 }}>
      {p.status === 'ISSUED' ? 'Live' : WORK_PERMIT_STATUS_LABELS[p.status]}
    </AppTag>
  );

export const permitTypeLabel = (t: WorkPermitDto['type']) => WORK_PERMIT_TYPE_LABELS[t];

/** "15 Oct, 09:00 to 18:00" or across days "15 Oct 09:00 to 17 Oct 18:00". */
export function permitWindow(p: Pick<WorkPermitDto, 'validFrom' | 'validTo'>) {
  const from = new Date(p.validFrom);
  const to = new Date(p.validTo);
  const d = (x: Date) => formatDayMonth(dayjs(x));
  const t = (x: Date) => dayjs(x).format('HH:mm');
  return d(from) === d(to) ? `${d(from)}, ${t(from)} to ${t(to)}` : `${d(from)} ${t(from)} to ${d(to)} ${t(to)}`;
}

const HISTORY_COLORS: Record<string, string> = { CREATED: 'gray', REQUESTED: 'gray', UPDATED: 'blue', ISSUED: 'green', CLOSED: 'green', REOPENED: 'orange', REJECTED: 'red', DELETED: 'red' };

export function SafetyHistory({ history }: { history: AuditLogDto[] | undefined }) {
  return (
    <Timeline
      items={(history ?? []).map((h) => ({
        key: h.id,
        color: HISTORY_COLORS[h.action] ?? 'blue',
        content: (
          <div>
            <Typography.Text strong>{h.action.charAt(0) + h.action.slice(1).toLowerCase()}</Typography.Text> <Typography.Text type="secondary">by {h.actorName}</Typography.Text>
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {formatDateTime(h.createdAt)}
            </div>
            {h.note && <div style={{ marginTop: 2 }}>&ldquo;{h.note}&rdquo;</div>}
          </div>
        ),
      }))}
    />
  );
}
