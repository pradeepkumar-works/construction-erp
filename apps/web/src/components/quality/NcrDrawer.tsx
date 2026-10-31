'use client';

import { auditActionLabel } from '@/components/common/AuditTrail';
import { DeleteInMenu } from '@/components/record/MoreActions';
import React, { useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Form, Input, Modal, Select, Skeleton, Space, Timeline, Typography } from 'antd';
import { CheckOutlined, EditOutlined, RedoOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, NcrDto } from '@erp/shared';
import { canActOnNcr, canApprove, canRaiseNcr } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useNcr, useNcrHistory } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { FormGrid } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { NcrStatusTag, SeverityTag } from './qualityUi';
import { NcrFormModal, useMasterOptions } from './NcrFormModal';
import { themeFontSize } from '@/lib/theme';

const HISTORY_COLORS: Record<string, string> = { CREATED: 'red', ACTION_TAKEN: 'blue', CLOSED: 'green', REOPENED: 'orange', UPDATED: 'gray' };

interface ActionValues {
  cause: string;
  correctiveAction: string;
  preventiveAction?: string;
  rootCause?: string | null;
  reworkCost?: number | null;
  photos?: AttachmentDto[];
}

const moneyOf = (v: number | null | undefined) => (v == null ? null : v.toFixed(2));

/** Site's part: why it happened and what was done, with photos of the rectified work. */
function ActionForm({ ncr }: { ncr: NcrDto }) {
  const [form] = Form.useForm<ActionValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const causes = useMasterOptions('ncr-root-cause', ncr.rootCause);
  const save = useMutation({
    mutationFn: async (v: ActionValues) =>
      (
        await api.post<NcrDto>(`/quality/ncrs/${ncr.id}/action`, {
          cause: v.cause.trim(),
          correctiveAction: v.correctiveAction.trim(),
          preventiveAction: v.preventiveAction?.trim() || null,
          rootCause: v.rootCause ?? null,
          reworkCost: moneyOf(v.reworkCost),
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
      initialValues={{ cause: ncr.cause ?? '', correctiveAction: ncr.correctiveAction ?? '', preventiveAction: ncr.preventiveAction ?? '', rootCause: ncr.rootCause, reworkCost: ncr.reworkCost === null ? null : Number(ncr.reworkCost) }}
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
      <FormGrid cols={2}>
        <Form.Item name="rootCause" label="Root cause">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Supervision, material…" options={causes.options} />
        </Form.Item>
        <Form.Item name="reworkCost" label="Rework cost" extra="What putting it right cost, if known">
          <MoneyInput />
        </Form.Item>
      </FormGrid>
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
  const [reworkCost, setReworkCost] = useState<number | null>(null);
  const categories = useMasterOptions('ncr-category', null, open);
  const causes = useMasterOptions('ncr-root-cause', null, open);
  const qa = !!user && canRaiseNcr(user.roleKey);
  const mayAct = !!user && !!data && data.status !== 'CLOSED' && canActOnNcr(user, data);
  const mayDelete = !!user && !!data && data.status === 'OPEN' && !data.actionAt && (data.raisedById === user.id || canApprove(user.roleKey));

  const done = (text: string) => {
    message.success(text);
    setStep(null);
    setNote('');
    setReworkCost(null);
    qc.invalidateQueries({ queryKey: ['quality'] });
  };
  const transition = useMutation({
    mutationFn: async (s: 'close' | 'reopen') =>
      (await api.post<NcrDto>(`/quality/ncrs/${id}/${s}`, { note: note.trim() || undefined, ...(s === 'close' && reworkCost != null ? { reworkCost: moneyOf(reworkCost) } : {}) })).data,
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
              <DeleteInMenu what={data.ncrNo} description="Only for an NCR raised by mistake." onConfirm={() => remove.mutateAsync()} />
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
              {
                key: 'sev',
                label: 'Severity',
                children: (
                  <Space size={4} wrap>
                    <SeverityTag severity={data.severity} />
                    {data.raisedByClient ? <AppTag tone="violet">Raised by the client</AppTag> : null}
                  </Space>
                ),
              },
              ...(data.category ? [{ key: 'cat', label: 'Category', children: categories.nameOf(data.category) }] : []),
              { key: 'raised', label: 'Raised', children: `${formatDate(data.raisedOn)} by ${data.raisedByName}` },
              { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
              { key: 'location', label: 'Location', children: data.location ?? '-' },
              ...(data.testNo || data.inspectionNo ? [{ key: 'source', label: 'Found by', children: [data.testNo, data.inspectionNo].filter(Boolean).join(', '), span: 2 }] : []),
              { key: 'who', label: 'Action by', children: data.actionByName ?? '-' },
              { key: 'due', label: 'Due', children: data.dueDate ? <span className={data.overdue ? 'text-danger' : undefined}>{formatDate(data.dueDate)}{data.overdue ? ' (overdue)' : ''}</span> : '-' },
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
                ...(data.rootCause ? [{ key: 'root', label: 'Root cause', children: causes.nameOf(data.rootCause) }] : []),
                ...(data.reworkCost ? [{ key: 'cost', label: 'Rework cost', children: <span translate="no">{formatINR(data.reworkCost)}</span> }] : []),
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
                  <Typography.Text strong>{auditActionLabel(h.action)}</Typography.Text> <Typography.Text type="secondary">by {h.actorName}</Typography.Text>
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
        {step === 'close' ? (
          <Form layout="vertical" component="div">
            <Form.Item label="Rework cost" extra="What putting it right cost, if known by now">
              <MoneyInput value={reworkCost ?? (data?.reworkCost ? Number(data.reworkCost) : null)} onChange={(v) => setReworkCost(typeof v === 'number' ? v : null)} />
            </Form.Item>
          </Form>
        ) : null}
        <Input.TextArea
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={step === 'close' ? 'How it was verified (optional)' : 'What is still not right'}
          aria-label={step === 'close' ? 'Closure note' : 'Reason to reopen'}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog that just opened, as the dialog pattern asks
          autoFocus
        />
      </Modal>
    </Drawer>
  );
}
