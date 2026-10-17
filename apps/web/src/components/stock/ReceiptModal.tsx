'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, DatePicker, Empty, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ReceivableOrderDto, ReceivableRequestDto, StockEntryDto } from '@erp/shared';
import { MATERIAL_PRIORITY_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useProjects, useReceivable, useReceivableOrders } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { VendorPicker } from '@/components/vendors/VendorPicker';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId?: string;
  /** `po:<id>` or `mr:<id>` */
  source: string;
  date: dayjs.Dayjs;
  supplier?: string;
  challanNo?: string;
  vehicleNo?: string;
  remarks?: string;
  photos?: AttachmentDto[];
}

/** What a GRN is received against: an approved purchase order or material request. */
interface Source {
  key: string;
  kind: 'PO' | 'MR';
  id: string;
  label: string;
  vendorName: string | null;
  lines: { id: string; itemName: string; specification: string | null; unit: string; due: string; received: string; pending: string }[];
}

const fromOrder = (o: ReceivableOrderDto, withProject: boolean): Source => ({
  key: `po:${o.id}`,
  kind: 'PO',
  id: o.id,
  label: `${o.poNo} · ${o.vendorName} · ${o.lines.map((l) => l.itemName).join(', ')}${withProject ? ` · ${o.projectName}` : ''}${o.deliveryBy ? ` · due ${formatDate(o.deliveryBy)}` : ''}`,
  vendorName: o.vendorName,
  lines: o.lines.map((l) => ({ id: l.purchaseOrderLineId, itemName: l.itemName, specification: l.specification, unit: l.unit, due: l.ordered, received: l.received, pending: l.pending })),
});

const fromRequest = (r: ReceivableRequestDto, withProject: boolean): Source => ({
  key: `mr:${r.id}`,
  kind: 'MR',
  id: r.id,
  label: `${r.requestNo} · ${r.lines.map((l) => l.itemName).join(', ')}${withProject ? ` · ${r.projectName}` : ''} · needed ${formatDate(r.requiredDate)} (${MATERIAL_PRIORITY_LABELS[r.priority]})`,
  vendorName: null,
  lines: r.lines.map((l) => ({ id: l.materialRequestItemId, itemName: l.itemName, specification: l.specification, unit: l.unit, due: l.requested, received: l.received, pending: l.pending })),
});

/** Goods received note against an approved purchase order or material request. Each line defaults to what is still pending. */
export function ReceiptModal({
  open,
  onClose,
  projectId,
  materialRequestId,
  purchaseOrderId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  materialRequestId?: string;
  purchaseOrderId?: string;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const watchedSource = Form.useWatch('source', form);
  const scope = projectId ?? watchedProject;
  const receivable = useReceivable(scope, open);
  const orders = useReceivableOrders(scope, open);
  const sources = useMemo(
    () => [...(orders.data ?? []).map((o) => fromOrder(o, !projectId)), ...(receivable.data ?? []).map((r) => fromRequest(r, !projectId))],
    [orders.data, receivable.data, projectId],
  );
  const request = sources.find((s) => s.key === watchedSource);
  const loading = receivable.isLoading || orders.isLoading;
  const [qty, setQty] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId, source: purchaseOrderId ? `po:${purchaseOrderId}` : materialRequestId ? `mr:${materialRequestId}` : undefined, date: dayjs() });
    setQty({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, materialRequestId, purchaseOrderId]);

  // Pre-fill each line with its pending quantity when a source is picked.
  useEffect(() => {
    if (request) setQty(Object.fromEntries(request.lines.map((l) => [l.id, Number(l.pending) > 0 ? l.pending : null])));
  }, [request]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      if (!request) throw new Error('Pick what this delivery is against.');
      const po = request.kind === 'PO';
      const lines = Object.entries(qty)
        .filter(([, q]) => q && Number(q) > 0)
        .map(([id, quantity]) => ({ [po ? 'purchaseOrderLineId' : 'materialRequestItemId']: id, quantity }));
      if (!lines.length) throw new Error('Enter the quantity received on at least one line.');
      const body = {
        ...(po ? { purchaseOrderId: request.id } : { materialRequestId: request.id, supplier: v.supplier?.trim() || null }),
        date: v.date.format('YYYY-MM-DD'),
        challanNo: v.challanNo?.trim() || null,
        vehicleNo: v.vehicleNo?.trim() || null,
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        lines,
      };
      return (await api.post<StockEntryDto>('/stock/receipts', body)).data;
    },
    onSuccess: (e) => {
      message.success(`${e.entryNo} saved: ${e.lines.length} item${e.lines.length === 1 ? '' : 's'} received`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={760} title="Receive material (GRN)" okText="Save GRN" okDisabled={!request} onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {projectId ? null : (
          <Form.Item name="projectId" label="Project">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="All projects"
              onChange={() => form.setFieldValue('source', undefined)}
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            />
          </Form.Item>
        )}
        <Form.Item name="source" label="Against" rules={[{ required: true, message: 'Pick the purchase order or request this delivery is against' }]}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            loading={loading}
            placeholder={sources.length || loading ? 'Select purchase order or request' : 'No purchase order or request is waiting for material'}
            notFoundContent={loading ? undefined : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing pending to receive" />}
            options={[
              ...(sources.some((s) => s.kind === 'PO') ? [{ label: 'Purchase orders', options: sources.filter((s) => s.kind === 'PO').map((s) => ({ value: s.key, label: s.label })) }] : []),
              ...(sources.some((s) => s.kind === 'MR') ? [{ label: 'Material requests', options: sources.filter((s) => s.kind === 'MR').map((s) => ({ value: s.key, label: s.label })) }] : []),
            ]}
          />
        </Form.Item>

        {request ? (
          <Table<Source['lines'][number]>
            size="small"
            rowKey="id"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={request.lines}
            columns={[
              { title: 'Item', dataIndex: 'itemName', render: (v, l) => (l.specification ? <span>{v} <Typography.Text type="secondary">({l.specification})</Typography.Text></span> : v) },
              { title: request.kind === 'PO' ? 'Ordered' : 'Requested', dataIndex: 'due', align: 'right', width: 100, render: (v, l) => `${formatQty(v)} ${l.unit}` },
              { title: 'Received', dataIndex: 'received', align: 'right', width: 100, render: (v) => formatQty(v) },
              {
                title: 'Receiving now',
                key: 'now',
                width: 170,
                render: (_, l) =>
                  Number(l.pending) > 0 ? (
                    <InputNumber<string>
                      stringMode
                      min="0"
                      max={l.pending}
                      value={qty[l.id] ?? null}
                      onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))}
                      suffix={l.unit}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <Typography.Text type="success">Fully received</Typography.Text>
                  ),
              },
            ]}
          />
        ) : watchedSource ? null : (
          <Alert type="info" showIcon style={{ marginBottom: 16 }} title="Material is received against an approved purchase order or material request. Each line can take up to what is still pending." />
        )}

        <FormGrid cols={2}>
          <Form.Item name="date" label="Received on" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          {request?.kind === 'PO' ? (
            <Form.Item label="Supplier">
              <Input value={request.vendorName ?? ''} disabled />
            </Form.Item>
          ) : (
            <Form.Item name="supplier" label="Supplier">
              <VendorPicker kind="SUPPLIER" />
            </Form.Item>
          )}
          <Form.Item name="challanNo" label="Challan / invoice no.">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="vehicleNo" label="Vehicle no.">
            <Input maxLength={30} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="photos" label="Challan photo">
          <PhotoUpload max={4} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
