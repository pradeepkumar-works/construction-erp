'use client';

import React from 'react';
import Link from 'next/link';
import { Space } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { FileImageOutlined, FileOutlined, FilePdfOutlined, HighlightOutlined } from '@/components/common/icons';
import type { AttachmentDto, RevisionStatus } from '@erp/shared';
import { REVISION_STATUS_LABELS, canViewDrawingFile, drawingFileKind } from '@erp/shared';
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
  <AppTag color={STATUS_TAG[status]} style={{ margin: 0 }}>
    {REVISION_STATUS_LABELS[status]}
  </AppTag>
);

/** The files of a revision as links that open in a new tab. */
export function FileLinks({ files, compact }: { files: AttachmentDto[]; compact?: boolean }) {
  if (!files.length) return <span className="text-muted">No file</span>;
  return (
    <Space size={compact ? 4 : 8} wrap>
      {files.map((a) => (
        <a key={a.id} href={fileUrl(a.url)} target="_blank" rel="noreferrer" title={a.fileName} style={{ whiteSpace: 'nowrap' }}>
          {drawingFileKind(a) === 'pdf' ? <FilePdfOutlined /> : drawingFileKind(a) === 'image' ? <FileImageOutlined /> : <FileOutlined />} {compact ? (files.length > 1 ? a.fileName : 'Open') : a.fileName}
        </a>
      ))}
    </Space>
  );
}

/** Where a revision opens in the drawing viewer. */
export const drawingHref = (documentId: string, revisionId?: string) => `/documents/drawing?id=${documentId}${revisionId ? `&rev=${revisionId}` : ''}`;

/** "View and mark up" for a revision with a PDF, image or DXF, with the drawing's open marks when it has any. */
export function ViewDrawingLink({ documentId, revisionId, files, openMarkups, label = 'View and mark up' }: { documentId: string; revisionId?: string; files: AttachmentDto[]; openMarkups?: number; label?: string }) {
  if (!files.some(canViewDrawingFile)) return null;
  return (
    <Link href={drawingHref(documentId, revisionId)} style={{ whiteSpace: 'nowrap' }}>
      <HighlightOutlined /> {label}
      {openMarkups ? <span translate="no"> ({openMarkups} open)</span> : null}
    </Link>
  );
}
