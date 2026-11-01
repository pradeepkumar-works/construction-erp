'use client';

import React from 'react';
import { Timeline, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { AuditLogDto, SafetyIncidentStatus, SafetyIncidentType, WorkPermitDto } from '@erp/shared';
import { SAFETY_INCIDENT_STATUS_LABELS, SAFETY_INCIDENT_TYPE_LABELS, WORK_PERMIT_EXPIRED_LABEL, WORK_PERMIT_STATUS_LABELS, WORK_PERMIT_TYPE_LABELS } from '@erp/shared';
import { formatDateTime, formatDayMonth } from '@/lib/format';
import dayjs from 'dayjs';
import { themeFontSize } from '@/lib/theme';

export const IncidentTypeTag = ({ type }: { type: SafetyIncidentType }) => (
  <AppTag variant="kind" style={{ margin: 0 }}>
    {SAFETY_INCIDENT_TYPE_LABELS[type]}
  </AppTag>
);

export const IncidentStatusTag = ({ status }: { status: SafetyIncidentStatus }) => (
  <AppTag kind="safetyIncident" status={status} style={{ margin: 0 }}>
    {SAFETY_INCIDENT_STATUS_LABELS[status]}
  </AppTag>
);

/** Status, with an issued permit past its end shown as expired. */
export const PermitStatusTag = ({ p }: { p: Pick<WorkPermitDto, 'status' | 'expired'> }) =>
  p.expired ? (
    <AppTag meaning="waiting" style={{ margin: 0 }}>
      {WORK_PERMIT_EXPIRED_LABEL}
    </AppTag>
  ) : (
    <AppTag kind="workPermit" status={p.status} style={{ margin: 0 }}>
      {WORK_PERMIT_STATUS_LABELS[p.status]}
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

export function SafetyHistory({ history }: { history: AuditLogDto[] | undefined }) {
  return (
    <Timeline
      items={(history ?? []).map((h) => ({
        key: h.id,
        color: 'gray',
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
