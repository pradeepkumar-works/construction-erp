'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { MaterialPriority, ProjectStatus, ProjectType, SubmissionStatus } from '@erp/shared';
import { MATERIAL_PRIORITY_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { PRIORITY_COLORS, PROJECT_STATUS_COLORS, STATUS_COLORS } from '@/lib/format';

/** `labels` words the status for one kind of entry (an inspection is "Passed" rather than "Approved"). */
export function StatusTag({ status, labels = SUBMISSION_STATUS_LABELS }: { status: SubmissionStatus; labels?: Record<SubmissionStatus, string> }) {
  return (
    <AppTag color={STATUS_COLORS[status] ?? 'default'} style={{ margin: 0 }}>
      {labels[status] ?? status}
    </AppTag>
  );
}

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return (
    <AppTag color={PROJECT_STATUS_COLORS[status] ?? 'default'} style={{ margin: 0 }}>
      {PROJECT_STATUS_LABELS[status] ?? status}
    </AppTag>
  );
}

const TYPE_COLORS: Record<ProjectType, string> = { ROAD: 'geekblue', BUILDING: 'cyan', WATER_SUPPLY: 'blue', SEWERAGE: 'green', OTHER: 'default', PLANT: 'purple', STORE: 'gold' };

/** `name` is the company's own type (a Bridge on the road kind); the colour stays the built-in kind's. */
export function ProjectTypeTag({ type, name }: { type: ProjectType; name?: string | null }) {
  return (
    <AppTag color={TYPE_COLORS[type] ?? 'default'} variant="outlined" dot={false} style={{ margin: 0 }}>
      {name || PROJECT_TYPE_LABELS[type] || type}
    </AppTag>
  );
}

export function PriorityTag({ priority }: { priority: MaterialPriority }) {
  return (
    <AppTag color={PRIORITY_COLORS[priority] ?? 'default'} style={{ margin: 0 }}>
      {MATERIAL_PRIORITY_LABELS[priority] ?? priority}
    </AppTag>
  );
}
