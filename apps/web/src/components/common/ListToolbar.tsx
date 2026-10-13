'use client';

import React from 'react';
import { Select } from 'antd';
import type { SubmissionStatus } from '@erp/shared';
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { ProjectSelect } from './ProjectSelect';

export function ListToolbar({
  projectId,
  onProject,
  status,
  onStatus,
  children,
}: {
  projectId?: string;
  onProject: (v?: string) => void;
  status?: SubmissionStatus;
  onStatus: (v?: SubmissionStatus) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
      <ProjectSelect value={projectId} onChange={(v) => onProject(v)} />
      <Select allowClear placeholder="All statuses" value={status} onChange={(v) => onStatus(v)} style={{ width: 180 }} options={SUBMISSION_STATUSES.map((s) => ({ value: s, label: SUBMISSION_STATUS_LABELS[s] }))} />
      {children}
    </div>
  );
}
