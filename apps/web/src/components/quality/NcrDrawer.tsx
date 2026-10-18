'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Form, Input, Modal, Skeleton, Space, Timeline, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, RedoOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, NcrDto } from '@erp/shared';
import { canActOnNcr, canApprove, canRaiseNcr } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useNcr, useNcrHistory } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { NcrStatusTag, SeverityTag } from './qualityUi';
import { NcrFormModal } from './NcrFormModal';
import { themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const HISTORY_COLORS: Record<string, string> = { CREATED: 'red', ACTION_TAKEN: 'blue', CLOSED: 'green', REOPENED: 'orange', UPDATED: 'gray' };

interface ActionValues {
  cause: string;
  correctiveAction: string;
  preventiveAction?: string;
  photos?: AttachmentDto[];
}

/** Site's part: why it happened and what was done, with photos of the rectified work. */
function ActionForm({ ncr }: { ncr: NcrDto }) {
  const [form] = Form.useForm<ActionValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (v: ActionValues) =>
      (
        await api.post<NcrDto>(`/quality/ncrs/${ncr.id}/action`, {
          cause: v.cause.trim(),
          correctiveAction: v.correctiveAction.trim(),
          preventiveAction: v.preventiveAction?.trim() || null,
          attachmentIds: (v.photos ?? []).map((p) => p.id),
        })
      ).data,
    onSuccess: (x) => {
      message.success(`Action recorded on ${x.ncrNo}`);
      qc.invalidateQueries({ queryKey: ['quality'] });
    },
    meta: FAIL_NOTICE,
  });
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(v) => save.mutate(v)}
      initialValues={{ cause: ncr.cause ?? '', correctiveAction: ncr.correctiveAction ?? '', preventiveAction: ncr.preventiveAction ?? '' }}
    >
      <Form.Item name="cause" label="Cause" rules={[{ required: true, whitespace: true, message: 'Say why it happened' }]}>
        <Input.TextArea rows={2} maxLength={2000} />
      </Form.Item>
      <Form.Item name="correctiveAction" label="Corrective action" rules={[{ required: true, whitespace: true, message: 'Say what was done to put it right' }]}>
        <Input.TextArea rows={2} maxLength={2000} />
      </Form.Item>
      <Form.Item name="preventiveAction" label="Preventive action (optional)">
        <Input.TextArea rows={2} maxLength={2000} placeholder="What will stop it happening again" />
      </Form.Item>
      <Form.Item name="photos" label="Photos of the rectified work">
        <PhotoUpload />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={save.isPending}>
        Record action
      </Button>
    </Form>
  );
}

export function NcrDrawer({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useNcr(id ?? undefined);
  const { data: history } = useNcrHistory(id ?? undefined);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<'close' | 'reopen' | null>(null);
  const [note, setNote] = useState('');
  const qa = !!user && canRaiseNcr(user.roleKey);
  const mayAct = !!user && !!data && data.status !== 'CLOSED' && canActOnNcr(user, data);
  const mayDelete = !!user && !!data && data.status === 'OPEN' && !data.actionAt && (data.raisedById === user.id || canApprove(user.roleKey));

  const done = (text: string) => {
    message.success(text);
    setStep(null);
    setNote('');
    qc.invalidateQueries({ queryKey: ['quality'] });
  };
  const transition = useMutation({
    mutationFn: async (s: 'close' | 'reopen') => (await api.post<NcrDto>(`/quality/ncrs/${id}/${s}`, { note: note.trim() || undefined })).data,
    onSuccess: (x, s) => done(s === 'close' ? `${x.ncrNo} closed` : `${x.ncrNo} reopened`),
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/quality/ncrs/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={
        data ? (
          <span>
            {data.ncrNo} <NcrStatusTag status={data.status} />
          </span>
        ) : (
          'NCR'
        )
      }
      extra={
        data ? (
          <Space>
            {qa && data.status === 'ACTION_TAKEN' ? (
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setStep('close')}>
                Close NCR
              </Button>
            ) : null}
            {qa && data.status !== 'OPEN' ? (
              <Button size="small" icon={<RedoOutlined />} onClick={() => setStep('reopen')}>
                Reopen
              </Button>
            ) : null}
            {qa && data.status !== 'CLOSED' ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {mayDelete ? (
              <ConfirmDelete what={data.ncrNo} description="Only for an NCR raised by mistake." onConfirm={() => remove.mutateAsync()}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete NCR" />
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
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'title', label: 'Non-conformance', children: data.title, span: 2 },
              { key: 'desc', label: 'Details', children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.description}</span>, span: 2 },
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'sev', label: 'Severity', children: <SeverityTag severity={data.severity} /> },
              { key: 'raised', label: 'Raised', children: `${formatDate(data.raisedOn)} by ${data.raisedByName}` },
              { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
              { key: 'location', label: 'Location', children: data.location ?? '-' },
              ...(data.testNo || data.inspectionNo ? [{ key: 'source', label: 'Found by', children: [data.testNo, data.inspectionNo].filter(Boolean).join(', '), span: 2 }] : []),
              { key: 'who', label: 'To be rectified by', children: data.actionByName ?? '-' },
              { key: 'due', label: 'Rectify by', children: data.dueDate ? <span className={data.overdue ? 'text-danger' : undefined}>{formatDate(data.dueDate)}{data.overdue ? ' (overdue)' : ''}</span> : '-' },
            ]}
          />
          <Divider titlePlacement="start" plain>
            Cause and corrective action
          </Divider>
          {data.status === 'OPEN' && mayAct ? (
            <ActionForm key={`${data.id}:${data.updatedAt}`} ncr={data} />
          ) : data.correctiveAction ? (
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                { key: 'cause', label: 'Cause', children: data.cause },
                { key: 'ca', label: 'Corrective action', children: data.correctiveAction },
                { key: 'pa', label: 'Preventive action', children: data.preventiveAction ?? '-' },
                { key: 'at', label: 'Recorded', children: formatDateTime(data.actionAt) },
                ...(data.status === 'CLOSED' ? [{ key: 'closed', label: 'Closed', children: `${formatDateTime(data.closedAt)} by ${data.closedByName}${data.closureNote ? `: ${data.closureNote}` : ''}` }] : []),
              ]}
            />
          ) : (
            <Typography.Text type="secondary">Waiting for site to record the cause and corrective action.</Typography.Text>
          )}
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            History
          </Divider>
          <Timeline
            items={(history ?? []).map((h) => ({
              key: h.id,
              color: HISTORY_COLORS[h.action] ?? 'blue',
              content: (
                <div>
                  <Typography.Text strong>{(h.action.charAt(0) + h.action.slice(1).toLowerCase()).replace(/_/g, ' ')}</Typography.Text> <Typography.Text type="secondary">by {h.actorName}</Typography.Text>
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {formatDateTime(h.createdAt)}
                  </div>
                  {h.note && <div style={{ marginTop: 2 }}>&ldquo;{h.note}&rdquo;</div>}
                </div>
              ),
            }))}
          />
        </>
      )}
      <NcrFormModal open={editing} onClose={() => setEditing(false)} ncr={data} />
      <Modal
        open={!!step}
        title={data ? `${step === 'close' ? 'Close' : 'Reopen'} ${data.ncrNo}` : ''}
        okText={step === 'close' ? 'Close NCR' : 'Reopen'}
        onCancel={() => setStep(null)}
        okButtonProps={{ disabled: step === 'reopen' && !note.trim(), loading: transition.isPending }}
        onOk={() => step && transition.mutate(step)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">{step === 'close' ? 'The corrective action has been verified at site.' : 'Site will be asked to act on it again.'}</Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={step === 'close' ? 'How it was verified (optional)' : 'What is still not right'}
          aria-label={step === 'close' ? 'Closure note' : 'Reason to reopen'}
          autoFocus
        />
      </Modal>
    </Drawer>
  );
}
