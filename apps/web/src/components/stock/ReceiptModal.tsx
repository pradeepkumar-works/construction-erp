'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ReceivableLineDto, StockEntryDto } from '@erp/shared';
import { MATERIAL_PRIORITY_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useProjects, useReceivable } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { VendorPicker } from '@/components/vendors/VendorPicker';

interface FormValues {
  projectId?: string;
  materialRequestId: string;
  date: dayjs.Dayjs;
  supplier?: string;
  challanNo?: string;
  vehicleNo?: string;
  remarks?: string;
  photos?: AttachmentDto[];
}

/** Goods received note against an approved material request. Each line defaults to what is still pending. */
export function ReceiptModal({ open, onClose, projectId, materialRequestId }: { open: boolean; onClose: () => void; projectId?: string; materialRequestId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const watchedMr = Form.useWatch('materialRequestId', form);
  const scope = projectId ?? watchedProject;
  const receivable = useReceivable(scope, open);
  const requests = useMemo(() => receivable.data ?? [], [receivable.data]);
  const request = requests.find((r) => r.id === watchedMr);
  const [qty, setQty] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId, materialRequestId, date: dayjs() });
    setQty({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, materialRequestId]);

  // Pre-fill each line with its pending quantity when a request is picked.
  useEffect(() => {
    if (request) setQty(Object.fromEntries(request.lines.map((l) => [l.materialRequestItemId, Number(l.pending) > 0 ? l.pending : null])));
  }, [request]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const lines = Object.entries(qty)
        .filter(([, q]) => q && Number(q) > 0)
        .map(([materialRequestItemId, quantity]) => ({ materialRequestItemId, quantity }));
      if (!lines.length) throw new Error('Enter the quantity received on at least one line.');
      const body = {
        materialRequestId: v.materialRequestId,
        date: v.date.format('YYYY-MM-DD'),
        supplier: v.supplier?.trim() || null,
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
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title="Receive material (GRN)"
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save GRN"
      okButtonProps={{ loading: save.isPending, disabled: !request }}
      width={760}
      destroyOnHidden
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 8 }}>
        {projectId ? null : (
          <Form.Item name="projectId" label="Project">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="All projects"
              onChange={() => form.setFieldValue('materialRequestId', undefined)}
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            />
          </Form.Item>
        )}
        <Form.Item name="materialRequestId" label="Approved material request" rules={[{ required: true, message: 'Pick the request this delivery is against' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            loading={receivable.isLoading}
            placeholder={requests.length || receivable.isLoading ? 'Select request' : 'No approved request is waiting for material'}
            notFoundContent={receivable.isLoading ? undefined : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing pending to receive" />}
            options={requests.map((r) => ({
              value: r.id,
              label: `${r.requestNo} · ${r.lines.map((l) => l.itemName).join(', ')}${projectId ? '' : ` · ${r.projectName}`} · needed ${formatDate(r.requiredDate)} (${MATERIAL_PRIORITY_LABELS[r.priority]})`,
            }))}
          />
        </Form.Item>

        {request ? (
          <Table<ReceivableLineDto>
            size="small"
            rowKey="materialRequestItemId"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={request.lines}
            columns={[
              { title: 'Item', dataIndex: 'itemName', render: (v, l) => (l.specification ? <span>{v} <Typography.Text type="secondary">({l.specification})</Typography.Text></span> : v) },
              { title: 'Requested', dataIndex: 'requested', align: 'right', width: 100, render: (v, l) => `${formatQty(v)} ${l.unit}` },
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
                      value={qty[l.materialRequestItemId] ?? null}
                      onChange={(v) => setQty((q) => ({ ...q, [l.materialRequestItemId]: v }))}
                      suffix={l.unit}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <Typography.Text type="success">Fully received</Typography.Text>
                  ),
              },
            ]}
          />
        ) : watchedMr ? null : (
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Material is received against an approved material request. Each line can take up to what is still pending." />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 12 }}>
          <Form.Item name="date" label="Received on" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="supplier" label="Supplier">
            <VendorPicker kind="SUPPLIER" />
          </Form.Item>
          <Form.Item name="challanNo" label="Challan / invoice no.">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="vehicleNo" label="Vehicle no.">
            <Input maxLength={30} />
          </Form.Item>
        </div>
        <Form.Item name="photos" label="Challan photo">
          <PhotoUpload max={4} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
