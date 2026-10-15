'use client';

import React, { useState } from 'react';
import { App, Button, DatePicker, Descriptions, Divider, Drawer, Form, Input, Popconfirm, Skeleton, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TransmittalDto, TransmittalItemDto } from '@erp/shared';
import { TRANSMITTAL_PURPOSE_LABELS, canManageDocuments } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTransmittal } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { RevisionStatusTag } from './docUi';
import { TransmittalFormModal } from './TransmittalFormModal';
import { openTransmittalPrint } from './transmittalPrint';

/** The receiver signed for it: date and name. */
function AcknowledgeForm({ t }: { t: TransmittalDto }) {
  const [form] = Form.useForm<{ on: dayjs.Dayjs; by: string }>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (v: { on: dayjs.Dayjs; by: string }) => (await api.post<TransmittalDto>(`/transmittals/${t.id}/acknowledge`, { acknowledgedOn: v.on.format('YYYY-MM-DD'), acknowledgedBy: v.by.trim() })).data,
    onSuccess: (x) => {
      message.success(`${x.transmittalNo} acknowledged`);
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  return (
    <Form form={form} layout="inline" initialValues={{ on: dayjs() }} onFinish={(v) => save.mutate(v)} style={{ rowGap: 8 }}>
      <Form.Item name="on" rules={[{ required: true, message: 'Required' }]}>
        <DatePicker format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(t.sentOn), 'day')} aria-label="Received on" />
      </Form.Item>
      <Form.Item name="by" rules={[{ required: true, whitespace: true, message: 'Who signed for it' }]}>
        <Input maxLength={200} placeholder="Received by" style={{ width: 220 }} />
      </Form.Item>
      <Button htmlType="submit" type="primary" loading={save.isPending}>
        Acknowledged
      </Button>
    </Form>
  );
}

export function TransmittalDrawer({ id, open, onClose, onOpenDocument }: { id: string | null; open: boolean; onClose: () => void; onOpenDocument?: (id: string) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useTransmittal(id ?? undefined);
  const [editing, setEditing] = useState(false);
  const manage = !!user && canManageDocuments(user.roleKey);
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/transmittals/${id}`)).data,
    onSuccess: () => {
      message.success('Transmittal deleted');
      qc.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={data ? `Transmittal ${data.transmittalNo}` : 'Transmittal'}
      extra={
        data ? (
          <Space>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => !openTransmittalPrint(data, user?.organizationName ?? '') && message.warning('Pop-up blocked. Allow pop-ups to print the transmittal.')}>
              Print
            </Button>
            {manage ? <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit transmittal" /> : null}
            {manage && !data.acknowledgedOn ? (
              <Popconfirm title={`Delete ${data.transmittalNo}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate()}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete transmittal" />
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
              { key: 'to', label: 'To', children: `${data.toParty}${data.attention ? `, attn. ${data.attention}` : ''}`, span: 2 },
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'purpose', label: 'Purpose', children: TRANSMITTAL_PURPOSE_LABELS[data.purpose] },
              { key: 'sent', label: 'Sent', children: `${formatDate(data.sentOn)} by ${data.sentByName}` },
              { key: 'ack', label: 'Acknowledged', children: data.acknowledgedOn ? `${formatDate(data.acknowledgedOn)} by ${data.acknowledgedBy}` : <span className="text-danger">Not yet</span>, span: 2 },
              ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks, span: 2 }] : []),
            ]}
          />
          {manage && !data.acknowledgedOn ? (
            <>
              <Divider titlePlacement="start" plain>
                Acknowledgement
              </Divider>
              <AcknowledgeForm t={data} />
            </>
          ) : null}
          <Divider titlePlacement="start" plain>
            Documents ({data.items.length})
          </Divider>
          <Table<TransmittalItemDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.items}
            columns={[
              { title: 'Number', dataIndex: 'docNo', width: 140, className: 'mono', render: (v: string, r) => <Typography.Link onClick={() => onOpenDocument?.(r.documentId)} disabled={!onOpenDocument}>{v}</Typography.Link> },
              { title: 'Title', dataIndex: 'title' },
              { title: 'Rev', dataIndex: 'revision', width: 60 },
              { title: 'Status', dataIndex: 'status', width: 170, render: (v) => <RevisionStatusTag status={v} /> },
              { title: 'Copies', dataIndex: 'copies', width: 70, align: 'right' as const },
            ]}
          />
        </>
      )}
      <TransmittalFormModal open={editing} onClose={() => setEditing(false)} transmittal={data} />
    </Drawer>
  );
}
