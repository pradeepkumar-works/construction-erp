'use client';

import React from 'react';
import { Descriptions } from 'antd';
import type { SubmissionBase } from '@erp/shared';
import { formatDateTime } from '@/lib/format';
import { StatusTag } from './StatusTag';

export function submissionMetaItems(s: SubmissionBase) {
  return [
    { key: 'status', label: 'Status', children: <StatusTag status={s.status} /> },
    { key: 'project', label: 'Project', children: s.projectName },
    { key: 'by', label: 'Submitted by', children: `${s.submittedByName}${s.submittedAt ? ` · ${formatDateTime(s.submittedAt)}` : ''}` },
    ...(s.reviewedByName
      ? [{ key: 'reviewed', label: 'Reviewed by', children: `${s.reviewedByName}${s.reviewedAt ? ` · ${formatDateTime(s.reviewedAt)}` : ''}` }]
      : []),
    ...(s.reviewNote ? [{ key: 'note', label: 'Review note', children: s.reviewNote }] : []),
  ];
}

export function SubmissionMeta({ s }: { s: SubmissionBase }) {
  return <Descriptions size="small" column={1} bordered items={submissionMetaItems(s)} />;
}
