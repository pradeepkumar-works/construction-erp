'use client';

import React from 'react';
import { Space, Tag } from 'antd';
import { FilePdfOutlined, FileImageOutlined } from '@ant-design/icons';
import type { AttachmentDto, RevisionStatus } from '@erp/shared';
import { REVISION_STATUS_LABELS } from '@erp/shared';
import { fileUrl } from '@/lib/api';

const STATUS_TAG: Record<RevisionStatus, string> = {
  FOR_CONSTRUCTION: 'green',
  APPROVED: 'cyan',
  APPROVED_WITH_COMMENTS: 'cyan',
  FOR_APPROVAL: 'gold',
  FOR_INFORMATION: 'default',
  REJECTED: 'red',
  AS_BUILT: 'blue',
  WITHDRAWN: 'default',
};

export const RevisionStatusTag = ({ status }: { status: RevisionStatus }) => (
  <Tag color={STATUS_TAG[status]} style={{ margin: 0 }}>
    {REVISION_STATUS_LABELS[status]}
  </Tag>
);

/** The files of a revision as links that open in a new tab. */
export function FileLinks({ files, compact }: { files: AttachmentDto[]; compact?: boolean }) {
  if (!files.length) return <span className="text-muted">No file</span>;
  return (
    <Space size={compact ? 4 : 8} wrap>
      {files.map((a) => (
        <a key={a.id} href={fileUrl(a.url)} target="_blank" rel="noreferrer" title={a.fileName} style={{ whiteSpace: 'nowrap' }}>
          {a.mimeType === 'application/pdf' ? <FilePdfOutlined /> : <FileImageOutlined />} {compact ? (files.length > 1 ? a.fileName : 'Open') : a.fileName}
        </a>
      ))}
    </Space>
  );
}
