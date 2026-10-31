'use client';

import React, { useEffect } from 'react';
import dayjs from 'dayjs';
import { Alert, App, Form, Input, Segmented, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GrnQcStatus, StockEntryDto, StockLineDto } from '@erp/shared';
import { GRN_QC_STATUSES, GRN_QC_STATUS_LABELS, certificateNeeded } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatQty, inSentence } from '@/lib/format';
import { useCertificateCategories } from '@/lib/queries';
import { DatePicker } from '@/components/common/DatePicker';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, QuantityInput, upper } from '@/components/form/inputs';

const COLORS: Record<GrnQcStatus, string> = { ACCEPTED: 'green', PARTLY_ACCEPTED: 'gold', REJECTED: 'red' };

/** Where a GRN stands with QA/QC. */
export function GrnQcTag({ status }: { status: GrnQcStatus | null | undefined }) {
  if (!status)
    return (
      <AppTag style={{ margin: 0 }}>
        Awaiting QA/QC
      </AppTag>
    );
  return (
    <AppTag color={COLORS[status]} style={{ margin: 0 }}>
      QA/QC: {GRN_QC_STATUS_LABELS[status]}
    </AppTag>
  );
}

interface Values {
  status: GrnQcStatus;
  note?: string;
  mtcNo?: string;
  mtcDate?: dayjs.Dayjs | null;
  rejected?: Record<string, number | null>;
}

/** QA/QC accepts or rejects the material on a GRN; partly accepted takes the rejected quantity per line. */
export function GrnQcModal({ entry, open, onClose }: { entry: StockEntryDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const status = Form.useWatch('status', form);
  const mtcNo = Form.useWatch('mtcNo', form);
  const categories = useCertificateCategories();
  const needsMtc = certificateNeeded(
    entry.lines.map((l) => l.category),
    categories.data?.categories ?? [],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      status: entry.qcStatus ?? 'ACCEPTED',
      note: entry.qcNote ?? undefined,
      mtcNo: entry.mtcNo ?? undefined,
      mtcDate: entry.mtcDate ? dayjs(entry.mtcDate) : null,
      rejected: Object.fromEntries(entry.lines.map((l) => [l.id, l.rejectedQty && Number(l.rejectedQty) > 0 ? Number(l.rejectedQty) : null])),
    });
  }, [open, entry, form]);

  const save = useMutation({
    mutationFn: async (v: Values) =>
      (
        await api.post<StockEntryDto>(`/stock/entries/${entry.id}/qc`, {
          status: v.status,
          note: v.note?.trim() || undefined,
          mtcNo: v.mtcNo?.trim() || null,
          mtcDate: v.mtcNo?.trim() && v.mtcDate ? v.mtcDate.format('YYYY-MM-DD') : null,
          lines: v.status === 'PARTLY_ACCEPTED' ? entry.lines.map((l) => ({ lineId: l.id, rejectedQty: String(v.rejected?.[l.id] ?? 0) })) : undefined,
        })
      ).data,
    onSuccess: (e) => {
      message.success(`${e.entryNo}: ${inSentence(GRN_QC_STATUS_LABELS[e.qcStatus!])}`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders', 'status'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`QA/QC check · ${entry.entryNo}`} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        {entry.supplier ?? 'Material'} received on {entry.date}. The stock is not changed: send rejected material back with a return to supplier.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" className="grn-qc-form">
        <Form.Item name="status" label="Result">
          <Segmented<GrnQcStatus> options={GRN_QC_STATUSES.map((s) => ({ value: s, label: GRN_QC_STATUS_LABELS[s] }))} />
        </Form.Item>
        {status === 'PARTLY_ACCEPTED' ? (
          <Table<StockLineDto>
            size="small"
            rowKey="id"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={entry.lines}
            columns={[
              { title: 'Item', dataIndex: 'itemName' },
              { title: 'Received', dataIndex: 'quantity', align: 'right', width: 120, render: (v: string, l) => `${formatQty(v)} ${l.unit}` },
              {
                title: 'Rejected',
                key: 'rejected',
                width: 150,
                render: (_, l) => (
                  <Form.Item name={['rejected', l.id]} noStyle>
                    <QuantityInput max={Number(l.quantity)} unit={l.unit} aria-label={`Rejected ${l.itemName}`} />
                  </Form.Item>
                ),
              },
            ]}
          />
        ) : null}
        <FormGrid cols={2}>
          <Form.Item name="mtcNo" label="Test certificate no." normalize={upper} extra={needsMtc ? undefined : 'If the maker sent one'}>
            <Input {...CODE_INPUT} maxLength={60} placeholder="TC/24/88123" />
          </Form.Item>
          <Form.Item name="mtcDate" label="Certificate date">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabled={!mtcNo} />
          </Form.Item>
        </FormGrid>
        {needsMtc && !mtcNo && status !== 'REJECTED' ? (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title="This material needs the maker's test certificate" description="Ask the supplier for it. You can accept the material now; the receipt stays on the certificates list until its number is entered." />
        ) : null}
        <Form.Item
          name="note"
          label={status === 'ACCEPTED' ? 'Note' : 'What was wrong'}
          rules={status && status !== 'ACCEPTED' ? [{ required: true, whitespace: true, message: 'Say what was wrong with the material' }] : undefined}
        >
          <Input.TextArea rows={2} maxLength={1000} placeholder={status === 'ACCEPTED' ? undefined : 'E.g. 20 bags lumpy, set aside for return'} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
