'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Divider, Drawer, Form, Input, Modal, Skeleton, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkPermitDto } from '@erp/shared';
import { PERMIT_PRECAUTIONS, canEditSafetyRecord, canManageSafety } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useWorkPermit, useWorkPermitHistory } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { PermitStatusTag, SafetyHistory, permitTypeLabel, permitWindow } from './safetyUi';
import { joinPrecautions, splitPrecautions } from './PermitFormModal';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

type Action = 'issue' | 'reject' | 'close';

/** One permit to work: issue or reject it (safety officer, approvers), close it when the work is done. */
export function PermitDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit: (p: WorkPermitDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useWorkPermit(id ?? undefined);
  const { data: history } = useWorkPermitHistory(id ?? undefined);
  const [action, setAction] = useState<Action | null>(null);
  const [form] = Form.useForm<{ note?: string; precautions?: string[]; otherPrecautions?: string }>();
  const manager = !!user && canManageSafety(user.roleKey);
  const own = !!user && !!data && canEditSafetyRecord(user, data.requestedById);

  const act = useMutation({
    mutationFn: async (v: { note?: string; precautions?: string[]; otherPrecautions?: string }) => {
      const note = v.note?.trim() || null;
      const body = action === 'issue' ? { note, precautions: joinPrecautions(v.precautions, v.otherPrecautions) } : { note };
      return (await api.post<WorkPermitDto>(`/safety/permits/${id}/${action}`, body)).data;
    },
    onSuccess: (p) => {
      message.success(`${p.permitNo} ${p.status === 'ISSUED' ? 'issued' : p.status === 'REJECTED' ? 'rejected' : 'closed'}`);
      qc.invalidateQueries({ queryKey: ['safety'] });
      setAction(null);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/safety/permits/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });
  const split = data ? splitPrecautions(data.type, data.precautions) : { ticked: [], other: '' };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={660}
      className="permit-drawer"
      title={
        data ? (
          <Space>
            {data.permitNo} <PermitStatusTag p={data} />
          </Space>
        ) : (
          'Permit to work'
        )
      }
      extra={
        data ? (
          <Space wrap>
            {own && data.status === 'REQUESTED' ? (
              <Button size="small" onClick={() => onEdit(data)}>
                Edit
              </Button>
            ) : null}
            {manager && data.status === 'REQUESTED' ? (
              <>
                <Button size="small" danger onClick={() => setAction('reject')}>
                  Reject
                </Button>
                <Button size="small" type="primary" onClick={() => setAction('issue')}>
                  Issue
                </Button>
              </>
            ) : null}
            {own && data.status === 'ISSUED' ? (
              <Button size="small" type="primary" onClick={() => setAction('close')}>
                Close permit
              </Button>
            ) : null}
            {manager || (own && data.status === 'REQUESTED') ? (
              <ConfirmDelete what={`permit ${data.permitNo}`} description="Only for one made by mistake." onConfirm={() => remove.mutateAsync()}>
                <Button size="small" danger loading={remove.isPending}>
                  Delete
                </Button>
              </ConfirmDelete>
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
          {data.expired ? <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="This permit has run out. Close it, or ask for a new one if the work goes on." /> : null}
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'type', label: 'Work', children: permitTypeLabel(data.type) },
              { key: 'where', label: 'Where', children: data.location },
              { key: 'what', label: 'The work', children: data.description, span: 2 },
              { key: 'valid', label: 'Valid', children: permitWindow(data), span: 2 },
              { key: 'contractor', label: 'Contractor', children: data.contractor ?? '-' },
              { key: 'workers', label: 'Workers', children: [data.workerCount, data.workers].filter(Boolean).join(': ') || '-' },
              {
                key: 'prec',
                label: 'Precautions',
                span: 2,
                children: data.precautions.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {data.precautions.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <Typography.Text type="secondary">none listed</Typography.Text>
                ),
              },
              { key: 'by', label: 'Asked by', children: `${data.requestedByName}, ${formatDateTime(data.createdAt)}`, span: 2 },
              ...(data.issuedAt
                ? [{ key: 'issued', label: data.status === 'REJECTED' ? 'Rejected' : 'Issued', children: `${data.issuedByName ?? ''}, ${formatDateTime(data.issuedAt)}${data.issueNote ? `: ${data.issueNote}` : ''}`, span: 2 }]
                : []),
              ...(data.closedAt ? [{ key: 'closed', label: 'Closed', children: `${data.closedByName ?? ''}, ${formatDateTime(data.closedAt)}${data.closeNote ? `: ${data.closeNote}` : ''}`, span: 2 }] : []),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            History
          </Divider>
          <SafetyHistory history={history} />
        </>
      )}
      <Modal
        open={!!action}
        title={data ? `${action === 'issue' ? 'Issue' : action === 'reject' ? 'Reject' : 'Close'} ${data.permitNo}` : ''}
        okText={action === 'issue' ? 'Issue permit' : action === 'reject' ? 'Reject' : 'Close permit'}
        okButtonProps={{ danger: action === 'reject' }}
        onCancel={() => setAction(null)}
        confirmLoading={act.isPending}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => act.mutate(v)} initialValues={{ precautions: split.ticked, otherPrecautions: split.other }}>
          {action === 'issue' && data ? (
            <>
              <Form.Item name="precautions" label="Checked at site">
                <Checkbox.Group style={{ display: 'grid', gap: 4 }} options={PERMIT_PRECAUTIONS[data.type].map((p) => ({ value: p, label: p }))} />
              </Form.Item>
              <Form.Item name="otherPrecautions" label="Other precautions">
                <Input.TextArea rows={2} maxLength={2000} placeholder="One per line" />
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="note"
            label={action === 'issue' ? 'Conditions' : action === 'reject' ? 'Why not' : 'Note'}
            rules={action === 'reject' ? [{ required: true, whitespace: true, message: 'Say why' }] : []}
          >
            <Input.TextArea rows={2} maxLength={1000} placeholder={action === 'close' ? 'Work done, area made safe' : undefined} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
