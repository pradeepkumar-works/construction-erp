'use client';

import React from 'react';
import { Tag } from 'antd';
import type { MaterialPriority, ProjectStatus, ProjectType, SubmissionStatus } from '@erp/shared';
import { MATERIAL_PRIORITY_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { PRIORITY_COLORS, PROJECT_STATUS_COLORS, STATUS_COLORS } from '@/lib/format';

/** `labels` words the status for one kind of entry (an inspection is "Passed" rather than "Approved"). */
export function StatusTag({ status, labels = SUBMISSION_STATUS_LABELS }: { status: SubmissionStatus; labels?: Record<SubmissionStatus, string> }) {
  return (
    <Tag color={STATUS_COLORS[status] ?? 'default'} style={{ margin: 0 }}>
      {labels[status] ?? status}
    </Tag>
  );
}

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return (
    <Tag color={PROJECT_STATUS_COLORS[status] ?? 'default'} style={{ margin: 0 }}>
      {PROJECT_STATUS_LABELS[status] ?? status}
    </Tag>
  );
}

const TYPE_COLORS: Record<ProjectType, string> = { ROAD: 'geekblue', BUILDING: 'cyan', WATER_SUPPLY: 'blue', PLANT: 'purple' };

export function ProjectTypeTag({ type }: { type: ProjectType }) {
  return (
    <Tag color={TYPE_COLORS[type] ?? 'default'} variant="outlined" style={{ margin: 0 }}>
      {PROJECT_TYPE_LABELS[type] ?? type}
    </Tag>
  );
}

export function PriorityTag({ priority }: { priority: MaterialPriority }) {
  return (
    <Tag color={PRIORITY_COLORS[priority] ?? 'default'} style={{ margin: 0 }}>
      {MATERIAL_PRIORITY_LABELS[priority] ?? priority}
    </Tag>
  );
}
