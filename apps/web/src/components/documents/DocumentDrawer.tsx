'use client';

import { DeleteInMenu } from '@/components/record/MoreActions';
import React, { useState } from 'react';
import { Alert, Button, Descriptions, Divider, Drawer, Skeleton, Space, Table, Timeline, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SendOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentRevisionDto } from '@erp/shared';
import { DOCUMENT_DISCIPLINE_LABELS, DOCUMENT_KIND_LABELS, canManageDocuments, isBuildable } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useDocument, useDocumentHistory } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FileLinks, RevisionStatusTag, ViewDrawingLink } from './docUi';
import { DocumentFormModal } from './DocumentFormModal';
import { RevisionFormModal } from './RevisionFormModal';
import { RecordLink } from '@/components/record/RecordLink';
import { themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { RevisionImpactPanel } from '@/components/design/RevisionImpact';

/** A drawing or document: its current revision first, every revision with its files and transmittals, and the history. */
export function DocumentDrawer({ id, open, onClose, onSend, onOpenTransmittal }: { id: string | null; open: boolean; onClose: () => void; onSend?: (projectId: string, revisionIds: string[]) => void; onOpenTransmittal?: (id: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useDocument(id ?? undefined);
  const { data: history } = useDocumentHistory(id ?? undefined);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState<DocumentRevisionDto | 'new' | null>(null);
  const manage = !!user && canManageDocuments(user.roleKey);
  const sent = !!data?.revisions.some((r) => r.transmittals.length);

  const removeDoc = useMutation({
    mutationFn: async () => (await api.delete(`/documents/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });
  const removeRevision = useMutation({
    mutationFn: async (revisionId: string) => (await api.delete(`/documents/${id}/revisions/${revisionId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
    meta: FAIL_NOTICE,
  });

  const cur = data?.current;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={760}
      title={data ? `${data.docNo} ${data.title}` : 'Document'}
      extra={
        data && manage ? (
          <Space>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setRevision('new')}>
              New revision
            </Button>
            {cur && onSend ? (
              <Button size="small" icon={<SendOutlined />} onClick={() => onSend(data.projectId, [cur.id])}>
                Send
              </Button>
            ) : null}
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit document" />
            {!sent ? (
              <DeleteInMenu what={`document ${data.docNo}`} description="All its revisions and files go with it." onConfirm={() => removeDoc.mutateAsync()} />
            ) : null}
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          {cur && !isBuildable(cur.status) ? (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`The current revision is ${cur.status === 'AS_BUILT' ? 'the as-built record' : 'not for construction'}`} />
          ) : null}
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'kind', label: 'Type', children: DOCUMENT_KIND_LABELS[data.kind] },
              { key: 'disc', label: 'Discipline', children: DOCUMENT_DISCIPLINE_LABELS[data.discipline] },
              { key: 'rev', label: 'Current revision', children: cur ? <Space>{cur.revision}<RevisionStatusTag status={cur.status} /></Space> : 'None yet' },
              { key: 'issued', label: 'Issued', children: cur ? `${formatDate(cur.issuedOn)}${cur.receivedFrom ? ` by ${cur.receivedFrom}` : ''}` : '-' },
              {
                key: 'file',
                label: 'Drawing',
                span: 2,
                children: cur ? (
                  <Space orientation="vertical" size={2}>
                    <ViewDrawingLink documentId={data.id} revisionId={cur.id} files={cur.attachments} openMarkups={data.openMarkups} />
                    <FileLinks files={cur.attachments} />
                  </Space>
                ) : (
                  '-'
                ),
              },
              ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks, span: 2 }] : []),
            ]}
          />
          <RevisionImpactPanel documentId={data.id} projectId={data.projectId} manage={manage} buildable={!!cur && isBuildable(cur.status)} />
          <Divider titlePlacement="start" plain>
            Revisions ({data.revisions.length})
          </Divider>
          <Table<DocumentRevisionDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.revisions}
            rowClassName={(r) => (r.current ? '' : 'row-muted')}
            columns={[
              { title: 'Rev', dataIndex: 'revision', width: 70, render: (v: string, r) => (r.current ? <b>{v}</b> : v) },
              { title: 'Issued', dataIndex: 'issuedOn', width: 120, render: (v: string) => formatDate(v) },
              { title: 'Status', dataIndex: 'status', width: 170, render: (v, r) => (r.current ? <RevisionStatusTag status={v} /> : <span className="text-muted">Superseded</span>) },
              {
                title: 'Changes and files',
                key: 'files',
                render: (_, r) => (
                  <div>
                    {r.remarks ? <div style={{ fontSize: themeFontSize('fontSizeSM') }}>{r.remarks}</div> : null}
                    <Space size={8} wrap>
                      <ViewDrawingLink documentId={data.id} revisionId={r.id} files={r.attachments} label="View" />
                      <FileLinks files={r.attachments} compact />
                    </Space>
                    {r.transmittals.length ? (
                      <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                        Sent on{' '}
                        {r.transmittals.map((t, i) => (
                          <React.Fragment key={t.id}>
                            {i ? ', ' : ''}
                            {onOpenTransmittal ? <RecordLink onOpen={() => onOpenTransmittal(t.id)}>{t.transmittalNo}</RecordLink> : t.transmittalNo}{' '}
                            to {t.toParty}
                          </React.Fragment>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ),
              },
              ...(manage
                ? [
                    {
                      title: '',
                      key: 'actions',
                      width: 80,
                      render: (_: unknown, r: DocumentRevisionDto) => (
                        <Space size={4}>
                          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setRevision(r)} aria-label={`Edit revision ${r.revision}`} />
                          {!r.transmittals.length ? (
                            <ConfirmDelete what={`revision ${r.revision}`} onConfirm={() => removeRevision.mutateAsync(r.id)}>
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete revision ${r.revision}`} />
                            </ConfirmDelete>
                          ) : null}
                        </Space>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <Divider titlePlacement="start" plain>
            History
          </Divider>
          <Timeline
            items={(history ?? []).map((h) => ({
              key: h.id,
              content: (
                <div>
                  <Typography.Text strong>{(h.action.charAt(0) + h.action.slice(1).toLowerCase()).replace(/_/g, ' ')}</Typography.Text> <Typography.Text type="secondary">by {h.actorName}</Typography.Text>
                  {h.note ? <span> · {h.note}</span> : null}
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {formatDateTime(h.createdAt)}
                  </div>
                </div>
              ),
            }))}
          />
        </>
      )}
      <DocumentFormModal open={editing} onClose={() => setEditing(false)} doc={data} />
      <RevisionFormModal open={!!revision} onClose={() => setRevision(null)} doc={data} revision={revision === 'new' ? null : revision} />
    </Drawer>
  );
}
