'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, VendorDto, VendorKind, WorkOrderDto } from '@erp/shared';
import { GST_RATES, MSME_CATEGORY_LABELS, contractorTdsPct } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useBoq, useProjects } from '@/lib/queries';
import { VendorSelect, useVendor } from '@/components/common/SearchSelect';
import { formatINR, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { themeFontSize } from '@/lib/theme';

interface LineValue {
  boqItemId?: string | null;
  description?: string;
  unit?: string;
  quantity?: number | null;
  rate?: number | null;
}

interface FormValues {
  projectId: string;
  vendorId: string;
  woDate: dayjs.Dayjs;
  title: string;
  startDate?: dayjs.Dayjs | null;
  endDate?: dayjs.Dayjs | null;
  gstRate: number;
  retentionPct?: number | null;
  advanceAmount?: number | null;
  advanceRecoveryPct?: number | null;
  tdsPct?: number | null;
  paymentDays?: number | null;
  terms?: string;
  remarks?: string;
  lines: LineValue[];
  docs?: AttachmentDto[];
}

const SUB_KINDS: VendorKind[] = ['SUBCONTRACTOR', 'LABOUR_CONTRACTOR'];
const lineAmount = (l: LineValue | undefined) => Math.round(toNumber(l?.quantity) * toNumber(l?.rate) * 100) / 100;
const iso = (d: dayjs.Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null);

/** Issue or edit a work order: BOQ items (measured in the measurement book) or the order's own items, and the terms its bills use. */
export function WorkOrderFormModal({
  open,
  order,
  projectId: fixedProject,
  onClose,
  onSaved,
}: {
  open: boolean;
  order?: WorkOrderDto | null;
  projectId?: string;
  onClose: () => void;
  onSaved?: (o: WorkOrderDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const projectId = Form.useWatch('projectId', form) as string | undefined;
  const { data: boq } = useBoq(open ? projectId : undefined);
  const lines = Form.useWatch('lines', { form, preserve: true }) as LineValue[] | undefined;
  const vendorId = Form.useWatch('vendorId', form);
  const gstRate = Form.useWatch('gstRate', form);
  const vendor = useVendor(open ? vendorId : undefined);
  const msme = vendor?.msmeCategory === 'MICRO' || vendor?.msmeCategory === 'SMALL';

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (order)
      form.setFieldsValue({
        projectId: order.projectId,
        vendorId: order.vendorId,
        woDate: dayjs(order.woDate),
        title: order.title,
        startDate: order.startDate ? dayjs(order.startDate) : null,
        endDate: order.endDate ? dayjs(order.endDate) : null,
        gstRate: toNumber(order.gstRate),
        retentionPct: toNumber(order.retentionPct),
        advanceAmount: toNumber(order.advanceAmount),
        advanceRecoveryPct: toNumber(order.advanceRecoveryPct),
        tdsPct: toNumber(order.tdsPct),
        paymentDays: order.paymentDays,
        terms: order.terms ?? undefined,
        remarks: order.remarks ?? undefined,
        docs: order.attachments,
        lines: order.lines.map((l) => ({ boqItemId: l.boqItemId, description: l.description, unit: l.unit, quantity: toNumber(l.quantity), rate: toNumber(l.rate) })),
      });
    else form.setFieldsValue({ projectId: fixedProject, woDate: dayjs(), gstRate: 18, retentionPct: 5, advanceAmount: 0, advanceRecoveryPct: 0, lines: [{}] });
  }, [open, order, fixedProject, form]);

  /** A new vendor brings its TDS under section 194C and GST (none without a GSTIN). */
  const onVendor = (v: VendorDto) => {
    form.setFieldsValue({ tdsPct: contractorTdsPct(v.pan), gstRate: v.gstin ? (form.getFieldValue('gstRate') || 18) : 0 });
  };

  const value = useMemo(() => (lines ?? []).reduce((s, l) => s + lineAmount(l), 0), [lines]);
  const boqById = new Map((boq ?? []).map((b) => [b.id, b]));

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const body = {
        vendorId: v.vendorId,
        woDate: v.woDate.format('YYYY-MM-DD'),
        title: v.title.trim(),
        startDate: iso(v.startDate),
        endDate: iso(v.endDate),
        gstRate: String(v.gstRate ?? 0),
        retentionPct: String(v.retentionPct ?? 0),
        advanceAmount: String(v.advanceAmount ?? 0),
        advanceRecoveryPct: String(v.advanceRecoveryPct ?? 0),
        tdsPct: String(v.tdsPct ?? 0),
        paymentDays: v.paymentDays ?? null,
        terms: v.terms?.trim() || null,
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        submit,
        lines: v.lines.map((l) =>
          l.boqItemId
            ? { boqItemId: l.boqItemId, quantity: String(l.quantity), rate: String(l.rate) }
            : { description: l.description?.trim(), unit: l.unit?.trim(), quantity: String(l.quantity), rate: String(l.rate) },
        ),
      };
      if (order) return (await api.patch<WorkOrderDto>(`/work-orders/${order.id}`, body)).data;
      return (await api.post<WorkOrderDto>('/work-orders', { ...body, id: crypto.randomUUID(), projectId: v.projectId })).data;
    },
    onSuccess: (o, { submit }) => {
      message.success(submit ? `${o.woNo} submitted for approval` : `${o.woNo} saved as a draft`);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      onSaved?.(o);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const usedBoq = new Set((lines ?? []).map((l) => l.boqItemId).filter(Boolean));

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={order ? `Edit ${order.woNo}` : 'New work order'}
      okText="Save and submit"
      secondaryText="Save draft"
      allValues
      onSubmit={(v, draft) => save.mutateAsync({ v, submit: !draft })}
      width={1100}
      draftKey={order ? undefined : `work-order:${fixedProject ?? 'any'}`}
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={3}>
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              disabled={!!order || !!fixedProject}
              onChange={() => form.setFieldValue('lines', [{}])}
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            />
          </Form.Item>
          <Form.Item
            name="vendorId"
            label="Subcontractor"
            rules={[{ required: true, message: 'Pick the subcontractor from the vendor master' }]}
            extra={
              vendor
                ? [vendor.pan ? `PAN ${vendor.pan}` : 'No PAN: TDS is 20% under section 206AA', vendor.gstin ? `GSTIN ${vendor.gstin}` : 'Not GST registered', vendor.msmeCategory ? MSME_CATEGORY_LABELS[vendor.msmeCategory] : null]
                    .filter(Boolean)
                    .join(' · ')
                : undefined
            }
          >
            <VendorSelect prefer={SUB_KINDS} placeholder="Type a subcontractor's name" onPick={onVendor} />
          </Form.Item>
          <Form.Item name="woDate" label="Work order date" rules={[{ required: true, message: 'Pick the work order date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="title" label="Work" rules={[{ required: true, whitespace: true, message: 'Say what the work is' }]}>
            <Input maxLength={200} placeholder="Brickwork and plaster, Block A" />
          </Form.Item>
          <Form.Item name="startDate" label="Start">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="endDate" label="Finish">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </FormGrid>

        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              <Table
                size="small"
                pagination={false}
                rowKey="key"
                dataSource={fields}
                style={{ marginBottom: 8 }}
                columns={[
                  {
                    title: 'BOQ item',
                    key: 'boq',
                    width: 230,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'boqItemId']} noStyle>
                        <Select
                          allowClear
                          showSearch={{ optionFilterProp: 'label' }}
                          placeholder="Own item"
                          style={{ width: '100%' }}
                          aria-label={`BOQ item of line ${f.name + 1}`}
                          popupMatchSelectWidth={420}
                          options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}`, disabled: usedBoq.has(b.id) && lines?.[f.name]?.boqItemId !== b.id }))}
                          onChange={(id: string | undefined) => {
                            const b = id ? boqById.get(id) : undefined;
                            if (b) form.setFieldValue(['lines', f.name], { ...lines?.[f.name], boqItemId: id, unit: b.unit, quantity: lines?.[f.name]?.quantity ?? toNumber(b.revisedQty ?? b.originalQty) });
                          }}
                        />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'Description',
                    key: 'desc',
                    render: (_, f) => {
                      const b = lines?.[f.name]?.boqItemId ? boqById.get(lines[f.name].boqItemId!) : undefined;
                      return b ? (
                        <Typography.Text style={{ fontSize: themeFontSize('fontSizeSM') }}>{b.description}</Typography.Text>
                      ) : (
                        <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Describe the item' }]}>
                          <Input placeholder="Scaffolding, hire and erection" aria-label={`Description of line ${f.name + 1}`} maxLength={300} />
                        </Form.Item>
                      );
                    },
                  },
                  {
                    title: 'Unit',
                    key: 'unit',
                    width: 80,
                    render: (_, f) =>
                      lines?.[f.name]?.boqItemId ? (
                        boqById.get(lines[f.name].boqItemId!)?.unit
                      ) : (
                        <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, whitespace: true, message: 'Enter the unit' }]}>
                          <UnitInput aria-label={`Unit of line ${f.name + 1}`} maxLength={30} />
                        </Form.Item>
                      ),
                  },
                  {
                    title: 'Quantity',
                    key: 'qty',
                    width: 120,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity' }]}>
                        <QuantityInput min={0.001} aria-label={`Quantity of line ${f.name + 1}`} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'Rate',
                    key: 'rate',
                    width: 140,
                    render: (_, f) => {
                      const b = lines?.[f.name]?.boqItemId ? boqById.get(lines[f.name].boqItemId!) : undefined;
                      const rate = toNumber(lines?.[f.name]?.rate);
                      const client = b ? toNumber(b.rate) : 0;
                      return (
                        <>
                          <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Enter the rate' }]}>
                            <MoneyInput aria-label={`Rate of line ${f.name + 1}`} />
                          </Form.Item>
                          {b && (
                            <Typography.Text type={rate > client ? 'danger' : 'secondary'} style={{ fontSize: themeFontSize('fontSizeSM') }}>
                              Client {formatINR(client)}
                              {rate > 0 && client > 0 ? ` · margin ${Math.round(((client - rate) / client) * 1000) / 10}%` : ''}
                            </Typography.Text>
                          )}
                        </>
                      );
                    },
                  },
                  { title: 'Amount', key: 'amount', width: 130, align: 'right', render: (_, f) => <span className="mono">{formatINR(lineAmount(lines?.[f.name]), true)}</span> },
                  {
                    title: '',
                    key: 'x',
                    width: 40,
                    render: (_, f) => (fields.length > 1 ? <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} aria-label={`Remove line ${f.name + 1}`} /> : null),
                  },
                ]}
              />
              <Button size="small" icon={<PlusOutlined />} onClick={() => add({})} style={{ marginBottom: 16 }}>
                Add item
              </Button>
            </>
          )}
        </Form.List>

        <FormGrid cols={2}>
          <div>
            <FormGrid cols={2}>
              <Form.Item name="gstRate" label="GST on their bills">
                <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
              </Form.Item>
              <Form.Item name="retentionPct" label="Retention (%)">
                <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="tdsPct" label="TDS (%)" extra="Section 194C: 1% individual or HUF, 2% others">
                <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="advanceAmount" label="Advance paid">
                <MoneyInput />
              </Form.Item>
              <Form.Item name="advanceRecoveryPct" label="Advance recovery (%)" extra="Of each bill, until the advance is recovered">
                <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="paymentDays"
                label="Payment days"
                extra={msme ? `${vendor?.name} is a ${vendor?.msmeCategory?.toLowerCase()} enterprise: at most 45 days.` : 'From their bill; 30 when left empty.'}
                rules={[{ type: 'number', max: msme ? 45 : 365, message: msme ? 'At most 45 days for a micro or small enterprise' : 'At most 365 days' }]}
              >
                <InputNumber min={0} precision={0} inputMode="numeric" style={{ width: '100%' }} />
              </Form.Item>
            </FormGrid>
            <Form.Item name="terms" label="Terms (printed on the work order)">
              <Input.TextArea rows={3} maxLength={4000} placeholder="Rates include labour, tools and tackles. Cement and steel issued from our store are recovered at the store rate." />
            </Form.Item>
            <Form.Item name="remarks" label="Remarks">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            <Form.Item name="docs" label="Their quotation or other documents">
              <PhotoUpload max={4} />
            </Form.Item>
          </div>
          <div>
            <Alert
              type="info"
              title={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
                  <span>Work order value</span>
                  <strong className="mono">{formatINR(value, true)}</strong>
                  <span>GST at {toNumber(gstRate)}%</span>
                  <span className="mono">{formatINR(Math.round(value * toNumber(gstRate)) / 100, true)}</span>
                </div>
              }
              description="Material issued to them from the store is recovered from their bills at the item's rate."
            />
          </div>
        </FormGrid>
      </Form>
    </FormShell>
  );
}
