'use client';

import React from 'react';
import { Select } from 'antd';
import type { SubmissionStatus } from '@erp/shared';
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { ProjectSelect } from './ProjectSelect';
import { SearchBox } from './SearchBox';

export function ListToolbar({
  projectId,
  onProject,
  status,
  onStatus,
  search,
  onSearch,
  searchPlaceholder,
  hideProject,
  children,
  extra,
}: {
  projectId?: string;
  onProject: (v?: string) => void;
  status?: SubmissionStatus;
  /** Omit for lists without an approval status. */
  onStatus?: (v?: SubmissionStatus) => void;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** Inside a project page the project filter is fixed. */
  hideProject?: boolean;
  children?: React.ReactNode;
  /** Right-aligned actions such as Export. */
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
      {onSearch ? <SearchBox value={search ?? ''} onChange={onSearch} placeholder={searchPlaceholder} /> : null}
      {hideProject ? null : <ProjectSelect value={projectId} onChange={(v) => onProject(v)} />}
      {onStatus ? (
        <Select allowClear placeholder="All statuses" value={status} onChange={(v) => onStatus(v)} style={{ width: 180 }} options={SUBMISSION_STATUSES.map((s) => ({ value: s, label: SUBMISSION_STATUS_LABELS[s] }))} />
      ) : null}
      {children}
      {extra ? <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{extra}</div> : null}
    </div>
  );
}
