'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Form, Input, Select, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { MaterialRequestDto, MaterialRequestStockDto, RequestLineStockDto } from '@erp/shared';
import { useCoverRequest } from '@/lib/queries';
import { formatQty, toNumber } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { themeFontSize } from '@/lib/theme';

interface FormValues {
  fromProjectId: string;
  date: dayjs.Dayjs;
  vehicleNo?: string;
  remarks?: string;
  qty: Record<string, number | null | undefined>;
}

/** What a site holds of a line's item. */
const heldAt = (l: RequestLineStockDto, projectId: string | undefined, own: string) =>
  !projectId ? 0 : projectId === own ? toNumber(l.here) : toNumber(l.others.find((o) => o.projectId === projectId)?.balance);

/**
 * Stock first (v5 item 95): meet a request's lines from stock before buying. From the request's own site it is an issue
 * to whoever raised it; from another site, a transfer here (received at this site as usual). What is met no longer
 * needs ordering.
 */
export function CoverFromStockModal({ open, onClose, request, stock }: { open: boolean; onClose: () => void; request: MaterialRequestDto; stock: MaterialRequestStockDto | undefined }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const save = useCoverRequest(request.id);
  const from = Form.useWatch('fromProjectId', form);
  const needed = useMemo(() => (stock?.lines ?? []).filter((l) => toNumber(l.toOrderQty) > 0), [stock]);

  // Sites that hold something still needed: this one (to issue) first, then the others the user keeps (to transfer).
  const sites = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    if (stock?.canIssue && needed.some((l) => toNumber(l.here) > 0)) out.push({ value: request.projectId, label: `${request.projectName} (this site): issue to ${request.submittedByName}` });
    const others = new Map<string, string>();
    for (const l of needed) for (const o of l.others) if (o.canSend && toNumber(o.balance) > 0) others.set(o.projectId, o.store ? `${o.projectName} (central store)` : o.projectName);
    for (const [id, name] of others) out.push({ value: id, label: `${name}: transfer to this site` });
    return out;
  }, [stock, needed, request]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ date: dayjs(), fromProjectId: sites[0]?.value });
    // Open once per showing; the sites list is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  // Each line starts at what is needed or what the chosen site holds, whichever is less.
  useEffect(() => {
    if (!open || !from) return;
    form.setFieldValue('qty', Object.fromEntries(needed.map((l) => [l.materialRequestItemId, Math.min(toNumber(l.toOrderQty), heldAt(l, from, request.projectId)) || null])));
  }, [open, from, needed, form, request.projectId]);

  const transfer = !!from && from !== request.projectId;
  const submit = async (v: FormValues) => {
    const lines = needed.filter((l) => toNumber(v.qty?.[l.materialRequestItemId]) > 0).map((l) => ({ materialRequestItemId: l.materialRequestItemId, quantity: String(v.qty[l.materialRequestItemId]) }));
    if (!lines.length) throw new Error('Enter a quantity for at least one item.');
    const e = await save.mutateAsync({ fromProjectId: v.fromProjectId, date: v.date.format('YYYY-MM-DD'), vehicleNo: transfer ? v.vehicleNo?.trim() || null : null, remarks: v.remarks?.trim() || null, lines });
    message.success(transfer ? `${e.entryNo} sent to ${request.projectName}; receive it there when it arrives` : `${e.entryNo} saved: issued to ${request.submittedByName}`);
    return e;
  };

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={720} allValues title={`Take from stock for ${request.requestNo}`} okText={transfer ? 'Send transfer' : 'Issue from stock'} okDisabled={!sites.length} onSubmit={submit}>
      <Form form={form} layout="vertical">
        {!sites.length ? <Alert type="info" showIcon title="No site you keep holds what this request still needs." style={{ marginBottom: 12 }} /> : null}
        <FormGrid cols={2}>
          <Form.Item name="fromProjectId" label="From" rules={[{ required: true, message: 'Choose the site the material comes from' }]}>
            <Select options={sites} placeholder="Site with stock" />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <Table<RequestLineStockDto>
          size="small"
          rowKey="materialRequestItemId"
          pagination={false}
          dataSource={needed}
          scroll={{ x: 560 }}
          style={{ marginBottom: 16 }}
          columns={[
            { title: 'Item', dataIndex: 'itemName', render: (v, l) => <div>{v}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>Still needed {formatQty(l.toOrderQty)} {l.unit}</div></div> },
            { title: 'At that site', key: 'held', width: 120, align: 'right', render: (_, l) => <span className="mono" translate="no">{formatQty(heldAt(l, from, request.projectId))} {l.unit}</span> },
            {
              title: 'Quantity',
              key: 'qty',
              width: 170,
              render: (_, l) => {
                const max = Math.min(toNumber(l.toOrderQty), heldAt(l, from, request.projectId));
                return (
                  <Form.Item
                    name={['qty', l.materialRequestItemId]}
                    noStyle
                    rules={[{ validator: (_r, v) => (!v || Number(v) <= max + 1e-9 ? Promise.resolve() : Promise.reject(new Error(`At most ${formatQty(max)} ${l.unit} of ${l.itemName}`))) }]}
                  >
                    <QuantityInput unit={l.unit} min={0} disabled={max <= 0} aria-label={`Quantity of ${l.itemName}`} />
                  </Form.Item>
                );
              },
            },
          ]}
        />
        {transfer ? (
          <Form.Item name="vehicleNo" label="Vehicle no.">
            <Input maxLength={30} placeholder="OD-02-AB-1234" />
          </Form.Item>
        ) : null}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} placeholder={`For ${request.requestNo}`} />
        </Form.Item>
        <Typography.Text type="secondary">What is taken from stock no longer needs ordering. Deleting the store entry gives it back to the request.</Typography.Text>
      </Form>
    </FormShell>
  );
}
