'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryDto, StockLineDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatDate, formatQty } from '@/lib/format';
import { FormShell } from '@/components/form/FormShell';

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
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={520} title={`Receive ${transfer.entryNo} at ${transfer.toProjectName}`} okText="Receive" onSubmit={(v) => save.mutateAsync(v)}>
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
      <Form form={form} layout="vertical">
        <Form.Item name="date" label="Received on" rules={[{ required: true, message: 'Pick the date' }]}>
          <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(transfer.date), 'day')} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
