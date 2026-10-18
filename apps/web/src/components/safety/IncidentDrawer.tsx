'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Form, Input, Popconfirm, Skeleton, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SafetyIncidentDto } from '@erp/shared';
import { canEditSafetyRecord, canManageSafety } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSafetyIncident, useSafetyIncidentHistory } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { PhotosWithChecks } from '@/components/photo-checks/PhotoChecksSection';
import { FormShell } from '@/components/form/FormShell';
import { IncidentStatusTag, IncidentTypeTag, SafetyHistory } from './safetyUi';

/** One incident or near miss: what happened, the investigation, and closing it with the root cause and the action. */
export function IncidentDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit: (i: SafetyIncidentDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useSafetyIncident(id ?? undefined);
  const { data: history } = useSafetyIncidentHistory(id ?? undefined);
  const [closing, setClosing] = useState(false);
  const [form] = Form.useForm<{ rootCause: string; correctiveAction: string; closureNote?: string }>();
  const manager = !!user && canManageSafety(user.roleKey);
  const mayEdit = !!user && !!data && canEditSafetyRecord(user, data.reportedById) && (data.status === 'OPEN' || manager);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['safety'] });
  };
  const close = useMutation({
    mutationFn: async (v: { rootCause: string; correctiveAction: string; closureNote?: string }) =>
      (await api.post<SafetyIncidentDto>(`/safety/incidents/${id}/close`, { rootCause: v.rootCause.trim(), correctiveAction: v.correctiveAction.trim(), closureNote: v.closureNote?.trim() || null })).data,
    onSuccess: (i) => done(`${i.incidentNo} closed`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const reopen = useMutation({
    mutationFn: async () => (await api.post<SafetyIncidentDto>(`/safety/incidents/${id}/reopen`)).data,
    onSuccess: (i) => done(`${i.incidentNo} reopened`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/safety/incidents/${id}`)).data,
    onSuccess: () => {
      done('Incident deleted');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={660}
      className="incident-drawer"
      title={
        data ? (
          <Space>
            {data.incidentNo} <IncidentTypeTag type={data.type} /> <IncidentStatusTag status={data.status} />
          </Space>
        ) : (
          'Incident'
        )
      }
      extra={
        data ? (
          <Space wrap>
            {mayEdit ? (
              <Button size="small" onClick={() => onEdit(data)}>
                Edit
              </Button>
            ) : null}
            {manager && data.status === 'OPEN' ? (
              <Button
                size="small"
                type="primary"
                onClick={() => setClosing(true)}
              >
                Close incident
              </Button>
            ) : null}
            {manager && data.status === 'CLOSED' ? (
              <Button size="small" loading={reopen.isPending} onClick={() => reopen.mutate()}>
                Reopen
              </Button>
            ) : null}
            {manager ? (
              <Popconfirm title="Delete this incident?" description="Only for an entry made by mistake." onConfirm={() => remove.mutate()}>
                <Button size="small" danger loading={remove.isPending}>
                  Delete
                </Button>
              </Popconfirm>
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
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'when', label: 'When', children: `${formatDate(data.date)}${data.time ? `, ${data.time}` : ''}` },
              { key: 'where', label: 'Where', children: data.location },
              { key: 'what', label: 'What happened', children: data.description, span: 2 },
              ...(data.injuredCount
                ? [
                    { key: 'hurt', label: 'People hurt', children: `${data.injuredCount}${data.injuredNames ? `: ${data.injuredNames}` : ''}`, span: data.daysLost !== null ? 1 : 2 },
                    ...(data.daysLost !== null ? [{ key: 'lost', label: 'Days off work', children: data.daysLost }] : []),
                  ]
                : []),
              { key: 'contractor', label: 'Whose workers', children: data.contractor ?? '-', span: 2 },
              { key: 'immediate', label: 'Immediate action', children: data.immediateAction ?? '-', span: 2 },
              { key: 'root', label: 'Root cause', children: data.rootCause ?? <Typography.Text type="secondary">not yet recorded</Typography.Text>, span: 2 },
              { key: 'action', label: 'Corrective action', children: data.correctiveAction ?? <Typography.Text type="secondary">not yet recorded</Typography.Text>, span: 2 },
              { key: 'by', label: 'Reported by', children: `${data.reportedByName}, ${formatDateTime(data.createdAt)}`, span: 2 },
              ...(data.status === 'CLOSED'
                ? [{ key: 'closed', label: 'Closed', children: `${data.closedByName ?? ''}, ${formatDateTime(data.closedAt)}${data.closureNote ? `: ${data.closureNote}` : ''}`, span: 2 }]
                : []),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <PhotosWithChecks kind="incident" id={data.id} attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            History
          </Divider>
          <SafetyHistory history={history} />
        </>
      )}
      <FormShell open={closing} onClose={() => setClosing(false)} form={form} layout="modal" width={520} title={data ? `Close ${data.incidentNo}` : 'Close'} okText="Close incident" onSubmit={(v) => close.mutateAsync(v)}>
        <Form form={form} layout="vertical" initialValues={{ rootCause: data?.rootCause ?? '', correctiveAction: data?.correctiveAction ?? '' }}>
          <Form.Item name="rootCause" label="Root cause" rules={[{ required: true, whitespace: true, message: 'Why did it happen?' }]}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Form.Item name="correctiveAction" label="Corrective action" rules={[{ required: true, whitespace: true, message: 'What stops it happening again?' }]}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Form.Item name="closureNote" label="Note">
            <Input.TextArea rows={2} maxLength={2000} placeholder="Checked on site, toolbox talk held" />
          </Form.Item>
        </Form>
      </FormShell>
    </Drawer>
  );
}
