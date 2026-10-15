'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, Modal, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryDto, StockLineDto } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatQty } from '@/lib/format';

/** Receive a transfer at the project it was sent to: the same items and quantities come into stock there. */
export function ReceiveTransferModal({ open, onClose, transfer }: { open: boolean; onClose: () => void; transfer: StockEntryDto }) {
  const [form] = Form.useForm<{ date: dayjs.Dayjs; remarks?: string }>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  useEffect(() => {
    if (open) form.setFieldsValue({ date: dayjs(), remarks: undefined });
  }, [open, form]);
  const save = useMutation({
    mutationFn: async (v: { date: dayjs.Dayjs; remarks?: string }) =>
      (await api.post<StockEntryDto>(`/stock/transfers/${transfer.id}/receive`, { date: v.date.format('YYYY-MM-DD'), remarks: v.remarks?.trim() || null })).data,
    onSuccess: (e) => {
      message.success(`${e.entryNo} saved: received at ${e.projectName}`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  return (
    <Modal open={open} title={`Receive ${transfer.entryNo} at ${transfer.toProjectName}`} okText="Receive" onCancel={onClose} onOk={() => form.submit()} okButtonProps={{ loading: save.isPending }} destroyOnHidden>
      <Typography.Paragraph type="secondary">
        Sent from {transfer.projectName} on {formatDate(transfer.date)}. Everything sent comes into stock; record a shortage afterwards as an adjustment.
      </Typography.Paragraph>
      <Table<StockLineDto>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={transfer.lines}
        style={{ marginBottom: 12 }}
        columns={[
          { title: 'Item', dataIndex: 'itemName' },
          { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 140, render: (v: string, r) => `${formatQty(String(-Number(v)))} ${r.unit}` },
        ]}
      />
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <Form.Item name="date" label="Received on" rules={[{ required: true, message: 'Required' }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(transfer.date), 'day')} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
