'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Empty, Flex, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ReceivableOrderDto, ReceivableRequestDto, StockEntryDto } from '@erp/shared';
import { MATERIAL_PRIORITY_LABELS, itemSimilarity, matchLines, readNumber, readText } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { uploadFile, useProjects, useReceivable, useReceivableOrders } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { VendorPicker } from '@/components/vendors/VendorPicker';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { ReadDocumentButton, ReadPreview, ReadSource, readFieldProps, type ReadState } from '@/components/ai/ReadDocument';

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
  /** The supplier's dispatch note this delivery came with (supplier portal, v6 item 105) */
  dispatchId?: string;
}

/** What a GRN is received against: an approved purchase order or material request. */
interface Source {
  key: string;
  kind: 'PO' | 'MR';
  id: string;
  label: string;
  vendorName: string | null;
  lines: { id: string; itemName: string; specification: string | null; unit: string; due: string; received: string; pending: string }[];
  dispatches: ReceivableOrderDto['dispatches'];
}

const fromOrder = (o: ReceivableOrderDto, withProject: boolean): Source => ({
  key: `po:${o.id}`,
  kind: 'PO',
  id: o.id,
  label: `${o.poNo} · ${o.vendorName} · ${o.lines.map((l) => l.itemName).join(', ')}${withProject ? ` · ${o.projectName}` : ''}${o.deliveryBy ? ` · due ${formatDate(o.deliveryBy)}` : ''}`,
  vendorName: o.vendorName,
  lines: o.lines.map((l) => ({ id: l.purchaseOrderLineId, itemName: l.itemName, specification: l.specification, unit: l.unit, due: l.ordered, received: l.received, pending: l.pending })),
  dispatches: o.dispatches ?? [],
});

const fromRequest = (r: ReceivableRequestDto, withProject: boolean): Source => ({
  key: `mr:${r.id}`,
  kind: 'MR',
  id: r.id,
  label: `${r.requestNo} · ${r.lines.map((l) => l.itemName).join(', ')}${withProject ? ` · ${r.projectName}` : ''} · needed ${formatDate(r.requiredDate)} (${MATERIAL_PRIORITY_LABELS[r.priority]})`,
  vendorName: null,
  lines: r.lines.map((l) => ({ id: l.materialRequestItemId, itemName: l.itemName, specification: l.specification, unit: l.unit, due: l.requested, received: l.received, pending: l.pending })),
  dispatches: [],
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
  // A delivery challan read to fill the GRN (AI item 70), and the quantities waiting for its order to be picked.
  const [readState, setReadState] = useState<ReadState | null>(null);
  const [activeRead, setActiveRead] = useState<string | null>(null);
  const [readLines, setReadLines] = useState<Record<string, number> | null>(null);
  const pendingQty = useRef<{ key: string; qty: Record<string, string | null> } | null>(null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId, source: purchaseOrderId ? `po:${purchaseOrderId}` : materialRequestId ? `mr:${materialRequestId}` : undefined, date: dayjs() });
    setQty({});
    setReadState(null);
    setReadLines(null);
    pendingQty.current = null;
  }, [open, projectId, materialRequestId, purchaseOrderId, form]);

  // Pre-fill each line with its pending quantity when a source is picked.
  useEffect(() => {
    if (!request) return;
    const read = pendingQty.current?.key === request.key ? pendingQty.current.qty : null;
    pendingQty.current = null;
    form.setFieldValue('dispatchId', undefined);
    setQty(read ?? Object.fromEntries(request.lines.map((l) => [l.id, Number(l.pending) > 0 ? l.pending : null])));
  }, [request, form]);

  /** Picking the supplier's dispatch note fills the quantities on it, its challan and vehicle numbers. */
  const pickDispatch = (id: string | undefined) => {
    if (!request) return;
    const d = request.dispatches.find((x) => x.id === id);
    if (!d) {
      setQty(Object.fromEntries(request.lines.map((l) => [l.id, Number(l.pending) > 0 ? l.pending : null])));
      return;
    }
    const sent = new Map(d.lines.map((l) => [l.purchaseOrderLineId, l.quantity]));
    setQty(Object.fromEntries(request.lines.map((l) => [l.id, sent.get(l.id) ?? null])));
    form.setFieldsValue({ challanNo: d.dispatchNo, vehicleNo: d.vehicleNo ?? undefined });
  };

  /**
   * Fills the GRN from a read challan: the purchase order it is most like (its printed number, the supplier, then its
   * items), the quantities on the challan for the lines they match, the challan and vehicle numbers.
   */
  const applyRead = (s: ReadState) => {
    setReadState(s);
    setActiveRead(null);
    const f = s.result.fields;
    form.setFieldsValue({ challanNo: readText(f.challanNo) ?? undefined, vehicleNo: readText(f.vehicleNo) ?? undefined });
    const read = s.result.lines.map((l) => ({ description: readText(l.description) ?? '', unit: readText(l.unit) }));
    const poNo = readText(f.poNo)?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const supplier = readText(f.supplierName) ?? '';
    const candidates = (watchedSource ? sources.filter((x) => x.key === watchedSource) : sources.filter((x) => x.kind === 'PO')).map((src) => {
      const m = matchLines(read, src.lines.map((l) => ({ id: l.id, itemName: l.itemName, specification: l.specification, unit: l.unit })));
      const printed = poNo && src.label.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(poNo) ? 5 : 0;
      const vendor = src.vendorName && supplier && itemSimilarity(supplier, src.vendorName) >= 0.5 ? 1 : 0;
      return { src, m, score: printed + vendor + m.reduce((t, x) => t + (x?.score ?? 0), 0) };
    });
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    if (!best || !best.m.some(Boolean)) {
      message.warning('The challan is read, but no purchase order waiting for material has its items. Pick what it is against.');
    } else {
      const byLine: Record<string, number> = {};
      best.m.forEach((x, i) => {
        if (x) byLine[x.id] = i;
      });
      setReadLines(byLine);
      const q = Object.fromEntries(best.src.lines.map((l) => [l.id, byLine[l.id] !== undefined ? (readNumber(s.result.lines[byLine[l.id]].quantity)?.toString() ?? null) : null]));
      if (best.src.key === watchedSource) setQty(q);
      else {
        pendingQty.current = { key: best.src.key, qty: q };
        form.setFieldValue('source', best.src.key);
      }
    }
    uploadFile(s.file)
      .then((att) => form.setFieldValue('photos', [...((form.getFieldValue('photos') as AttachmentDto[] | undefined) ?? []), att]))
      .catch((e) => message.warning(`The form is filled, but the challan could not be attached: ${errorMessage(e)}`));
  };

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
        ...(po && v.dispatchId ? { supplierDispatchId: v.dispatchId } : {}),
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
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={760} title="Receive material (GRN)" okText="Save GRN" okDisabled={!request} onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {!readState ? (
          <Flex justify="flex-end" style={{ marginBottom: 8 }}>
            <ReadDocumentButton kind="challan" label="Fill from challan" onRead={applyRead} disabled={loading} />
          </Flex>
        ) : (
          <ReadPreview state={readState} active={activeRead} onClear={() => setReadState(null)} />
        )}
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
        {request?.dispatches.length ? (
          <Form.Item name="dispatchId" label="Supplier's dispatch note" extra="Sent by the supplier from their portal. Picking one fills its quantities; correct them to what actually arrived.">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Pick the note that came with this truck"
              onChange={(id?: string) => pickDispatch(id)}
              options={request.dispatches.map((d) => ({ value: d.id, label: `${d.dispatchNo} · sent ${formatDate(d.date)}${d.vehicleNo ? ` · ${d.vehicleNo}` : ''}` }))}
            />
          </Form.Item>
        ) : null}

        {request ? (
          <Table<Source['lines'][number]>
            size="small"
            rowKey="id"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={request.lines}
            columns={[
              {
                title: 'Item',
                dataIndex: 'itemName',
                render: (v, l) => {
                  const i = readState && readLines ? readLines[l.id] : undefined;
                  return (
                    <div>
                      {l.specification ? <span>{v} <Typography.Text type="secondary">({l.specification})</Typography.Text></span> : v}
                      {i !== undefined ? (
                        <div>
                          <ReadSource kind="challan" page={readState!.result.lines[i].quantity?.page ?? null} onActive={(on) => setActiveRead(on ? `line-${i}-quantity` : null)} />
                        </div>
                      ) : null}
                    </div>
                  );
                },
              },
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
                      status={readState && readLines?.[l.id] !== undefined && (readState.result.lines[readLines[l.id]].quantity?.confidence === 'low' || Number(qty[l.id] ?? 0) > Number(l.pending)) ? 'warning' : undefined}
                      aria-label={`Quantity received of ${l.itemName}`}
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
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
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
          <Form.Item name="challanNo" label="Challan / invoice no." {...readFieldProps(readState, 'challanNo', setActiveRead)}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="vehicleNo" label="Vehicle no." {...readFieldProps(readState, 'vehicleNo', setActiveRead)}>
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
