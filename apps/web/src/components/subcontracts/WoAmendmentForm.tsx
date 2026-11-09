'use client';

import React, { useEffect, useMemo } from 'react';
import { Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { amendLineAmount, amendmentSummary, type WorkOrderAmendmentDto } from '@erp/shared';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useBoq } from '@/lib/queries';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { DatePicker } from '@/components/common/DatePicker';
import { UnitInput } from '@/components/common/UnitInput';
import { AppTag } from '@/components/common/AppTag';
import { Money } from '@/components/common/Money';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { recordPage } from '@/components/approvals/queue';

interface OrderLine {
  workOrderLineId: string;
  itemNo: string | null;
  description: string;
  unit: string;
  qtyBefore: string;
  rateBefore: string;
  floorQty: string;
  quantity: number | null;
  rate: number | null;
}

interface NewLine {
  boqItemId?: string | null;
  description?: string;
  unit?: string;
  quantity?: number | null;
  rate?: number | null;
}

interface FormValues {
  reason: string;
  endDate?: dayjs.Dayjs | null;
  lines: OrderLine[];
  added: NewLine[];
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? '0' : String(v));

/**
 * Change an approved work order through an amendment (a draft raised from the order's lines): each line's new quantity
 * (not below what is billed or measured) and rate, new items, the reason and a new end date. Saves the draft or sends it
 * for approval; the order changes only once it is approved.
 */
export function WoAmendmentForm({ open, amendment, onClose }: { open: boolean; amendment: WorkOrderAmendmentDto | null; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: boq } = useBoq(open ? amendment?.projectId : undefined);
  const lines = Form.useWatch('lines', { form, preserve: true }) as OrderLine[] | undefined;
  const added = Form.useWatch('added', { form, preserve: true }) as NewLine[] | undefined;
  const boqById = useMemo(() => new Map((boq ?? []).map((b) => [b.id, b])), [boq]);

  useEffect(() => {
    if (!open || !amendment) return;
    form.resetFields();
    form.setFieldsValue({
      reason: amendment.reason,
      endDate: amendment.endDate ? dayjs(amendment.endDate) : null,
      lines: amendment.lines
        .filter((l) => !l.isNew)
        .map((l) => ({
          workOrderLineId: l.workOrderLineId!,
          itemNo: l.itemNo,
          description: l.description,
          unit: l.unit,
          qtyBefore: l.qtyBefore!,
          rateBefore: l.rateBefore!,
          floorQty: l.floorQty,
          quantity: toNumber(l.quantity),
          rate: toNumber(l.rate),
        })),
      added: amendment.lines.filter((l) => l.isNew).map((l) => ({ boqItemId: l.boqItemId, description: l.description, unit: l.unit, quantity: toNumber(l.quantity), rate: toNumber(l.rate) })),
    });
  }, [open, amendment, form]);

  const summary = useMemo(
    () =>
      amendmentSummary(
        (lines ?? []).map((l) => ({ id: l.workOrderLineId, quantity: l.qtyBefore, rate: l.rateBefore })),
        [
          ...(lines ?? []).map((l) => ({ workOrderLineId: l.workOrderLineId, boqItemId: null, description: l.description, quantity: str(l.quantity), rate: str(l.rate) })),
          ...(added ?? []).map((l) => ({ workOrderLineId: null, boqItemId: l.boqItemId ?? null, description: l.description ?? '', quantity: str(l.quantity), rate: str(l.rate) })),
        ],
      ),
    [lines, added],
  );

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) =>
      (
        await api.patch<WorkOrderAmendmentDto>(`/work-order-amendments/${amendment!.id}`, {
          reason: v.reason?.trim() || null,
          endDate: v.endDate ? v.endDate.format('YYYY-MM-DD') : null,
          submit,
          lines: [
            ...v.lines.map((l) => ({ workOrderLineId: l.workOrderLineId, quantity: str(l.quantity), rate: str(l.rate) })),
            ...(v.added ?? []).map((l) =>
              l.boqItemId ? { boqItemId: l.boqItemId, quantity: str(l.quantity), rate: str(l.rate) } : { description: l.description?.trim(), unit: l.unit?.trim(), quantity: str(l.quantity), rate: str(l.rate) },
            ),
          ],
        })
      ).data,
    onSuccess: (a, { submit }) => {
      notify.saved(submit ? `${a.label} sent for approval` : `${a.label} saved as a draft`, recordPage('WO_AMENDMENT', a.id));
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    meta: FAIL_NOTICE,
  });

  const onOrder = new Set(amendment?.lines.filter((l) => !l.isNew && l.boqItemId).map((l) => l.boqItemId));
  const picked = new Set((added ?? []).map((l) => l.boqItemId).filter(Boolean));
  const change = toNumber(summary.change);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={amendment ? `Amend ${amendment.woNo}` : 'Amend work order'}
      okText="Save and submit"
      secondaryText="Save as draft"
      allValues
      onSubmit={(v, draft) => save.mutateAsync({ v, submit: !draft })}
      width={1100}
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="reason" label="Why the order changes" rules={[{ required: true, whitespace: true, message: 'Say why the order changes' }]}>
            <Input.TextArea rows={2} maxLength={1000} placeholder="Block B added by the client letter of 2 November" />
          </Form.Item>
          <Form.Item name="endDate" label="New end date" extra={amendment?.endDateBefore ? `Now ${formatDate(amendment.endDateBefore)}; leave empty to keep it` : 'Leave empty to keep it'}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <FormSection title="Lines of the order">
          <Typography.Paragraph type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
            A quantity comes down no further than what is already billed or measured. Earlier bills keep the rates they were made at.
          </Typography.Paragraph>
          <LineTable
            name="lines"
            label="Order line"
            locked
            columns={[
              {
                key: 'item',
                title: 'Item',
                render: (f) => {
                  const l = lines?.[f.name];
                  return l ? (
                    <span>
                      {l.itemNo ? <AppTag variant="kind" style={{ marginInlineEnd: tk.space[2] }}>{l.itemNo}</AppTag> : null}
                      {l.description}
                    </span>
                  ) : null;
                },
              },
              {
                key: 'before',
                title: 'Now',
                width: 170,
                align: 'right',
                render: (f) => {
                  const l = lines?.[f.name];
                  return l ? (
                    <Typography.Text type="secondary" className="mono" translate="no" style={{ fontSize: tk.type.caption.fontSize }}>
                      {formatQty(l.qtyBefore)} {l.unit} at <Money value={l.rateBefore} paise />
                    </Typography.Text>
                  ) : null;
                },
              },
              {
                key: 'qty',
                title: 'Quantity',
                width: 160,
                render: (f) => {
                  const l = lines?.[f.name];
                  const floor = toNumber(l?.floorQty);
                  return (
                    <>
                      <Form.Item
                        name={[f.name, 'quantity']}
                        noStyle
                        rules={[
                          { required: true, message: 'Enter the quantity' },
                          { validator: (_, v) => (toNumber(v) + 1e-9 < floor ? Promise.reject(new Error(`Keep at least ${formatQty(floor)}: it is billed or measured`)) : Promise.resolve()) },
                        ]}
                      >
                        <QuantityInput unit={l?.unit} aria-label={`New quantity of line ${f.name + 1}`} />
                      </Form.Item>
                      {floor > 0 ? (
                        <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                          At least {formatQty(floor)}
                        </Typography.Text>
                      ) : null}
                    </>
                  );
                },
              },
              {
                key: 'rate',
                title: 'Rate',
                width: 150,
                render: (f) => (
                  <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Enter the rate' }]}>
                    <MoneyInput min={0.01} aria-label={`New rate of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              { key: 'amount', title: 'Amount', width: 140, align: 'right', render: (f) => <Money value={amendLineAmount(str(lines?.[f.name]?.quantity), str(lines?.[f.name]?.rate))} paise /> },
            ]}
          />
        </FormSection>
        <FormSection title="New items">
          <LineTable
            name="added"
            label="New item"
            addText="Add item"
            newLine={() => ({})}
            columns={[
              {
                key: 'boq',
                title: 'BOQ item',
                width: 230,
                render: (f) => (
                  <Form.Item name={[f.name, 'boqItemId']} noStyle>
                    <Select
                      allowClear
                      showSearch={{ optionFilterProp: 'label' }}
                      placeholder="Own item"
                      style={{ width: '100%' }}
                      aria-label={`BOQ item of new item ${f.name + 1}`}
                      popupMatchSelectWidth={420}
                      options={(boq ?? [])
                        .filter((b) => !onOrder.has(b.id))
                        .map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}`, disabled: picked.has(b.id) && added?.[f.name]?.boqItemId !== b.id }))}
                      onChange={(id: string | undefined) => {
                        const b = id ? boqById.get(id) : undefined;
                        if (b) form.setFieldValue(['added', f.name], { ...added?.[f.name], boqItemId: id, unit: b.unit });
                      }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'desc',
                title: 'Description',
                render: (f) => {
                  const b = added?.[f.name]?.boqItemId ? boqById.get(added[f.name].boqItemId!) : undefined;
                  return b ? (
                    <Typography.Text style={{ fontSize: tk.type.caption.fontSize }}>{b.description}</Typography.Text>
                  ) : (
                    <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Describe the item' }]}>
                      <Input placeholder="Curing compound, supply and apply" aria-label={`Description of new item ${f.name + 1}`} maxLength={300} />
                    </Form.Item>
                  );
                },
              },
              {
                key: 'unit',
                title: 'Unit',
                width: 100,
                render: (f) =>
                  added?.[f.name]?.boqItemId ? (
                    boqById.get(added[f.name].boqItemId!)?.unit
                  ) : (
                    <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, whitespace: true, message: 'Enter the unit' }]}>
                      <UnitInput aria-label={`Unit of new item ${f.name + 1}`} maxLength={30} />
                    </Form.Item>
                  ),
              },
              {
                key: 'qty',
                title: 'Quantity',
                width: 130,
                render: (f) => (
                  <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity' }]}>
                    <QuantityInput min={0.001} aria-label={`Quantity of new item ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                key: 'rate',
                title: 'Rate',
                width: 140,
                render: (f) => (
                  <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Enter the rate' }]}>
                    <MoneyInput min={0.01} aria-label={`Rate of new item ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              { key: 'amount', title: 'Amount', width: 130, align: 'right', render: (f) => <Money value={amendLineAmount(str(added?.[f.name]?.quantity), str(added?.[f.name]?.rate))} paise /> },
            ]}
          />
        </FormSection>
        <Typography.Paragraph style={{ textAlign: 'right', fontWeight: tk.type.title.fontWeight }}>
          Order value before GST <Money value={summary.valueBefore} paise /> to <Money value={summary.valueAfter} paise />{' '}
          <Typography.Text type="secondary">
            ({change >= 0 ? 'up ' : 'down '}
            <Money value={Math.abs(change)} paise />)
          </Typography.Text>
        </Typography.Paragraph>
      </Form>
    </FormShell>
  );
}
