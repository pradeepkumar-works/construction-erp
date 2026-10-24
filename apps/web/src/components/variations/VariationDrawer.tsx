'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, DatePicker, Descriptions, Divider, Drawer, Form, Input, Segmented, Skeleton, Space, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { VariationDto, VariationLineDto, VariationStatus } from '@erp/shared';
import { VARIATION_CAUSE_LABELS, VARIATION_STATUS_LABELS, canManageVariations } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useVariation } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { VariationFormModal } from './VariationFormModal';
import { themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const STATUS_COLORS: Record<VariationStatus, string> = { DRAFT: 'default', SUBMITTED: 'gold', APPROVED: 'green', REJECTED: 'red' };

export const VariationStatusTag = ({ status }: { status: VariationStatus }) => (
  <AppTag color={STATUS_COLORS[status]} style={{ margin: 0 }}>
    {VARIATION_STATUS_LABELS[status]}
  </AppTag>
);

/** A variation with its items, claimed and approved; sends it to the client and records the client's decision. */
export function VariationDrawer({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useVariation(id ?? undefined);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const manage = !!user && canManageVariations(user.roleKey);
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/variations/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variations'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  const decided = data?.status === 'APPROVED';
  const columns = [
    {
      title: 'Item',
      key: 'item',
      render: (_: unknown, l: VariationLineDto) => (
        <div>
          <span className="mono" translate="no">{l.itemNo}</span> {l.description}
          {l.isNewItem ? (
            <AppTag tone="pending" style={{ marginLeft: 6 }}>
              New item
            </AppTag>
          ) : null}
        </div>
      ),
    },
    { title: 'Unit', dataIndex: 'unit', width: 60 },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right' as const, className: 'mono', render: (v: string) => `${toNumber(v) > 0 ? '+' : ''}${formatQty(v)}` },
    { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right' as const, className: 'mono', render: (v: string) => formatINR(v, true) },
    { title: 'Claimed', dataIndex: 'amount', width: 120, align: 'right' as const, className: 'mono', render: (v: string) => formatINR(v) },
    ...(decided
      ? [
          {
            title: 'Approved',
            key: 'approved',
            width: 170,
            align: 'right' as const,
            className: 'mono',
            render: (_: unknown, l: VariationLineDto) => (
              <div>
                {formatINR(l.approvedAmount)}
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {formatQty(l.approvedQty)} @ {formatINR(l.approvedRate, true)}
                </div>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={860}
      title={
        data ? (
          <span>
            {data.label} {data.title} <VariationStatusTag status={data.status} />
          </span>
        ) : (
          'Variation'
        )
      }
      extra={
        data && manage && data.status !== 'APPROVED' ? (
          <Space>
            {data.status === 'SUBMITTED' ? (
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => setDeciding(true)}>
                Record decision
              </Button>
            ) : (
              <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => setSending(true)}>
                {data.status === 'REJECTED' ? 'Send again' : 'Send to client'}
              </Button>
            )}
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit variation" />
            <ConfirmDelete what={data.label} onConfirm={() => remove.mutateAsync()}>
              <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete variation" />
            </ConfirmDelete>
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
              { key: 'project', label: 'Project', span: 2, children: <Link href={`/projects/${data.projectId}`}>{`${data.projectCode} - ${data.projectName}`}</Link> },
              { key: 'cause', label: 'Cause', children: VARIATION_CAUSE_LABELS[data.cause] },
              { key: 'by', label: 'Prepared by', children: `${data.createdByName}, ${formatDate(data.createdAt.slice(0, 10))}` },
              ...(data.description ? [{ key: 'desc', label: 'Justification', span: 2, children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.description}</span> }] : []),
              { key: 'claimed', label: 'Claimed', children: <span className="mono" translate="no">{formatINR(data.claimedAmount)}</span> },
              { key: 'approved', label: 'Approved', children: data.approvedAmount ? <strong className="mono" translate="no">{formatINR(data.approvedAmount)}</strong> : '-' },
              ...(data.submittedDate ? [{ key: 'sent', label: 'Sent to client', span: 2, children: `${formatDate(data.submittedDate)}${data.submittedRef ? `, our ref ${data.submittedRef}` : ''}` }] : []),
              ...(data.decidedDate
                ? [
                    {
                      key: 'decided',
                      label: data.status === 'REJECTED' ? 'Rejected' : 'Approved on',
                      span: 2,
                      children: `${formatDate(data.decidedDate)}${data.clientRef ? `, client's ref ${data.clientRef}` : ''}${data.decisionNote ? `. ${data.decisionNote}` : ''}`,
                    },
                  ]
                : []),
            ]}
          />
          {decided ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              The approved quantities are in the BOQ and the amount is in the project&apos;s revised contract value.
            </Typography.Paragraph>
          ) : null}
          <Divider titlePlacement="start" plain>
            Items
          </Divider>
          <Table<VariationLineDto> rowKey="id" size="small" columns={columns} dataSource={data.lines} pagination={false} scroll={{ x: 700 }} />
          <Divider titlePlacement="start" plain>
            Documents ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
        </>
      )}
      <VariationFormModal open={editing} onClose={() => setEditing(false)} variation={data} />
      {data && <SendModal open={sending} onClose={() => setSending(false)} variation={data} />}
      {data && <DecisionModal open={deciding} onClose={() => setDeciding(false)} variation={data} />}
    </Drawer>
  );
}

function SendModal({ open, onClose, variation }: { open: boolean; onClose: () => void; variation: VariationDto }) {
  const [form] = Form.useForm<{ date: dayjs.Dayjs; ref?: string }>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  useEffect(() => {
    if (open) form.setFieldsValue({ date: dayjs(), ref: undefined });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: async (v: { date: dayjs.Dayjs; ref?: string }) => (await api.post<VariationDto>(`/variations/${variation.id}/submit`, { date: v.date.format('YYYY-MM-DD'), ref: v.ref?.trim() || null })).data,
    onSuccess: (v) => {
      message.success(`${v.label} is with the client`);
      qc.invalidateQueries({ queryKey: ['variations'] });
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Send ${variation.label} to the client`} okText="Record" onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="date" label="Sent on" rules={[{ required: true, message: 'Pick the date it was sent' }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="ref" label="Our letter reference">
          <Input maxLength={100} placeholder="NIR/RD/2026/041" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface DecisionValues {
  decision: 'APPROVED' | 'REJECTED';
  date: dayjs.Dayjs;
  clientRef?: string;
  note?: string;
  lines?: { approvedQty: number | null; approvedRate: number | null }[];
}

function DecisionModal({ open, onClose, variation }: { open: boolean; onClose: () => void; variation: VariationDto }) {
  const [form] = Form.useForm<DecisionValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const decision = Form.useWatch('decision', form) ?? 'APPROVED';
  const lines = Form.useWatch('lines', form);
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        decision: 'APPROVED',
        date: dayjs(),
        clientRef: undefined,
        note: undefined,
        lines: variation.lines.map((l) => ({ approvedQty: toNumber(l.qty), approvedRate: toNumber(l.rate) })),
      });
  }, [open, form, variation]);
  const approvedTotal = (lines ?? []).reduce((s, l, i) => s + (l?.approvedQty ?? 0) * (variation.lines[i]?.isNewItem ? (l?.approvedRate ?? 0) : toNumber(variation.lines[i]?.rate)), 0);
  const mutation = useMutation({
    mutationFn: async (v: DecisionValues) =>
      (
        await api.post<VariationDto>(`/variations/${variation.id}/decide`, {
          decision: v.decision,
          date: v.date.format('YYYY-MM-DD'),
          clientRef: v.clientRef?.trim() || null,
          note: v.note?.trim() || null,
          ...(v.decision === 'APPROVED'
            ? {
                lines: (v.lines ?? []).map((l, i) => ({
                  id: variation.lines[i].id,
                  approvedQty: String(l.approvedQty ?? 0),
                  ...(variation.lines[i]?.isNewItem ? { approvedRate: String(l.approvedRate ?? 0) } : {}),
                })),
              }
            : {}),
        })
      ).data,
    onSuccess: (v) => {
      message.success(v.status === 'APPROVED' ? `${v.label} approved: the BOQ and contract value are updated` : `${v.label} recorded as rejected`);
      qc.invalidateQueries({ queryKey: ['variations'] });
      qc.invalidateQueries({ queryKey: ['boq'] });
      qc.invalidateQueries({ queryKey: ['contract'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Client's decision on ${variation.label}`} okText="Record" onSubmit={(v) => mutation.mutateAsync(v)} width={760}>
      <Form form={form} layout="vertical">
        <FormGrid cols={3}>
          <Form.Item name="decision" label="Decision">
            <Segmented
              options={[
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
            />
          </Form.Item>
          <Form.Item name="date" label="On" rules={[{ required: true, message: 'Pick the date of the decision' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="clientRef" label="Client's order or letter">
            <Input maxLength={100} placeholder="EE/RD/2026/233" />
          </Form.Item>
        </FormGrid>
        {decision === 'APPROVED' ? (
          <>
            <Typography.Text strong>What the client approved</Typography.Text>
            <Form.List name="lines">
              {(fields) => (
                <div style={{ marginTop: 8 }}>
                  {fields.map((f) => {
                    const l = variation.lines[f.name];
                    return (
                      <div key={f.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px 160px', gap: '0 12px', alignItems: 'center' }}>
                        <div style={{ paddingBottom: 24 }}>
                          <span className="mono" translate="no">{l.itemNo}</span> {l.description}
                          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                            Claimed {formatQty(l.qty)} {l.unit} @ {formatINR(l.rate, true)}
                          </div>
                        </div>
                        <Form.Item name={[f.name, 'approvedQty']} label="Quantity" rules={[{ required: true, message: 'Enter the approved quantity' }]}>
                          {/* An omission is approved as a negative quantity. */}
                          <QuantityInput unit={l.unit} min={undefined} />
                        </Form.Item>
                        {l.isNewItem ? (
                          <Form.Item name={[f.name, 'approvedRate']} label="Rate" rules={[{ required: true, message: 'Enter the approved rate' }]}>
                            <MoneyInput />
                          </Form.Item>
                        ) : (
                          <Form.Item label="Rate">
                            <span className="mono" translate="no">{formatINR(l.rate, true)}</span>
                          </Form.Item>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Form.List>
            <Typography.Paragraph>
              Approved <strong className="mono" translate="no">{formatINR(approvedTotal)}</strong> of {formatINR(variation.claimedAmount)} claimed. Recording this changes the BOQ quantities and adds new items to the BOQ.
            </Typography.Paragraph>
          </>
        ) : null}
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={2000} placeholder={decision === 'REJECTED' ? 'Reason the client gave' : 'Conditions or remarks'} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
