'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, MakeWarningDto, PurchaseOrderDto } from '@erp/shared';
import { GST_RATES, MSME_CATEGORY_LABELS, lastRateKey } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useComparative, useLastRates, useMakeCheck, useProjects, useRateCheck } from '@/lib/queries';
import { useDebounced } from '@/lib/debounce';
import { VendorSelect, useVendor } from '@/components/common/SearchSelect';
import { formatINR, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { ItemPicker } from '@/components/form/ItemPicker';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { themeColor, themeFontSize } from '@/lib/theme';
import { recordPage } from '@/components/approvals/queue';
import { LastRates, RateAbove } from './LastRates';

export interface PoLineValue {
  materialRequestItemId?: string | null;
  itemName?: string;
  specification?: string | null;
  make?: string | null;
  unit?: string;
  quantity?: number | null;
  rate?: number | null;
  gstRate?: number;
}

/** What a new order starts from: a request, the quotation chosen on its comparative statement, or nothing. */
export interface PoStart {
  projectId?: string;
  materialRequestId?: string;
  requestNo?: string;
  quotationId?: string;
  vendorId?: string;
  freight?: number;
  paymentTerms?: string | null;
  deliveryBy?: string | null;
  lines?: PoLineValue[];
}

interface FormValues {
  projectId: string;
  vendorId: string;
  poDate: dayjs.Dayjs;
  deliveryBy?: dayjs.Dayjs | null;
  deliveryAddress?: string;
  paymentTerms?: string;
  paymentDays?: number | null;
  freight?: number | null;
  remarks?: string;
  selectionReason?: string;
  lines: PoLineValue[];
  docs?: AttachmentDto[];
}

/** As the API asks (`SELECTION_REASON_MIN` in po-supplier-rules): a sentence, not a word. */
const REASON_MIN = 10;

const lineAmount = (l: PoLineValue | undefined) => Math.round(toNumber(l?.quantity) * toNumber(l?.rate) * 100) / 100;
const lineGst = (l: PoLineValue | undefined) => Math.round(lineAmount(l) * toNumber(l?.gstRate)) / 100;

/** Raise or edit a purchase order. Lines from a material request keep its item; other lines are typed in. */
export function PurchaseOrderFormModal({
  open,
  order,
  start,
  onClose,
  onSaved,
}: {
  open: boolean;
  order?: PurchaseOrderDto | null;
  start?: PoStart | null;
  onClose: () => void;
  onSaved?: (o: PurchaseOrderDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  // preserve: lines from a request keep their item and unit without a field for them
  const lines = Form.useWatch('lines', { form, preserve: true }) as PoLineValue[] | undefined;
  const last = useLastRates((lines ?? []).map((l) => ({ itemName: l?.itemName ?? '', unit: l?.unit ?? '' })), open, order?.id);
  const freight = Form.useWatch('freight', form);
  const vendorId = Form.useWatch('vendorId', form);
  const projectId = Form.useWatch('projectId', form) as string | undefined;
  const poDateValue = Form.useWatch('poDate', form) as dayjs.Dayjs | undefined;
  const poDate = (poDateValue ?? dayjs()).format('YYYY-MM-DD');
  const others = useRateCheck((lines ?? []).map((l) => ({ itemName: l?.itemName ?? '', unit: l?.unit ?? '' })), projectId, poDate, open, order?.id);
  // Lines whose material has approved makes on the project but name another make, or none (v6 item 113).
  const makeKey = useDebounced(JSON.stringify((lines ?? []).map((l) => ({ itemName: l?.itemName ?? '', make: l?.make ?? null }))), 400);
  const makeLines = useMemo(() => JSON.parse(makeKey) as { itemName: string; make: string | null }[], [makeKey]);
  const makeCheck = useMakeCheck(open ? projectId : undefined, makeLines);
  const makeWarnings = makeCheck.data ?? [];
  const vendor = useVendor(open ? vendorId : undefined);
  const msme = vendor?.msmeCategory === 'MICRO' || vendor?.msmeCategory === 'SMALL';
  const fromRequest = order ? order.requestNo : start?.requestNo;
  // An order not from the lowest quotation that prices every line says why before it goes for approval.
  const requestId = order ? (order.materialRequestId ?? undefined) : start?.materialRequestId;
  const comparative = useComparative(requestId, open && !!requestId);
  const lowest = comparative.data?.quotations.find((q) => q.id === comparative.data?.lowestQuotationId);
  const chosenQuotationId = order ? (vendorId === order.vendorId ? order.quotationId : null) : vendorId === start?.vendorId ? (start?.quotationId ?? null) : null;
  const needsReason = !!lowest && chosenQuotationId !== lowest.id;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (order)
      form.setFieldsValue({
        projectId: order.projectId,
        vendorId: order.vendorId,
        poDate: dayjs(order.poDate),
        deliveryBy: order.deliveryBy ? dayjs(order.deliveryBy) : null,
        deliveryAddress: order.deliveryAddress ?? undefined,
        paymentTerms: order.paymentTerms ?? undefined,
        paymentDays: order.paymentDays,
        freight: toNumber(order.freight),
        remarks: order.remarks ?? undefined,
        selectionReason: order.selectionReason ?? undefined,
        docs: order.attachments,
        lines: order.lines.map((l) => ({
          materialRequestItemId: l.materialRequestItemId,
          itemName: l.itemName,
          specification: l.specification,
          make: l.make,
          unit: l.unit,
          quantity: toNumber(l.quantity),
          rate: toNumber(l.rate),
          gstRate: toNumber(l.gstRate),
        })),
      });
    else
      form.setFieldsValue({
        projectId: start?.projectId,
        vendorId: start?.vendorId,
        poDate: dayjs(),
        deliveryBy: start?.deliveryBy ? dayjs(start.deliveryBy) : null,
        paymentTerms: start?.paymentTerms ?? undefined,
        freight: start?.freight ?? 0,
        lines: start?.lines?.length ? start.lines : [{ gstRate: 18 }],
      });
  }, [open, order, start, form]);

  const totals = useMemo(() => {
    const subtotal = (lines ?? []).reduce((s, l) => s + lineAmount(l), 0);
    const gst = (lines ?? []).reduce((s, l) => s + lineGst(l), 0);
    return { subtotal, gst, total: subtotal + gst + toNumber(freight) };
  }, [lines, freight]);

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const body = {
        vendorId: v.vendorId,
        poDate: v.poDate.format('YYYY-MM-DD'),
        deliveryBy: v.deliveryBy ? v.deliveryBy.format('YYYY-MM-DD') : null,
        deliveryAddress: v.deliveryAddress?.trim() || null,
        paymentTerms: v.paymentTerms?.trim() || null,
        paymentDays: v.paymentDays ?? null,
        freight: String(v.freight ?? 0),
        remarks: v.remarks?.trim() || null,
        selectionReason: needsReason ? v.selectionReason?.trim() || null : null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        submit,
        lines: v.lines.map((l) =>
          l.materialRequestItemId
            ? { materialRequestItemId: l.materialRequestItemId, make: l.make?.trim() || null, quantity: String(l.quantity), rate: String(l.rate), gstRate: String(l.gstRate ?? 0) }
            : { itemName: l.itemName?.trim(), specification: l.specification?.trim() || null, make: l.make?.trim() || null, unit: l.unit?.trim(), quantity: String(l.quantity), rate: String(l.rate), gstRate: String(l.gstRate ?? 0) },
        ),
      };
      if (order) return (await api.patch<PurchaseOrderDto>(`/purchase-orders/${order.id}`, body)).data;
      return (
        await api.post<PurchaseOrderDto>('/purchase-orders', {
          ...body,
          id: crypto.randomUUID(),
          projectId: v.projectId,
          materialRequestId: start?.materialRequestId,
          quotationId: v.vendorId === start?.vendorId ? start?.quotationId : undefined,
        })
      ).data;
    },
    onSuccess: (o, { submit }) => {
      notify.saved(submit ? `${o.poNo} submitted for approval` : `${o.poNo} saved as a draft`, recordPage('PURCHASE_ORDER', o.id));
      for (const k of ['purchase-orders', 'material-requests', 'quotations']) qc.invalidateQueries({ queryKey: [k] });
      onSaved?.(o);
    },
    meta: FAIL_NOTICE,
  });

  const summary = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
      <span>Items</span>
      <span className="mono" translate="no">{formatINR(totals.subtotal, true)}</span>
      <span>GST</span>
      <span className="mono" translate="no">{formatINR(totals.gst, true)}</span>
      <span>Freight</span>
      <span className="mono" translate="no">{formatINR(toNumber(freight), true)}</span>
      <strong>Order total</strong>
      <strong className="mono" translate="no">{formatINR(totals.total, true)}</strong>
    </div>
  );

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={order ? `Edit ${order.poNo}` : fromRequest ? `Purchase order for ${fromRequest}` : 'New purchase order'}
      okText="Save and submit"
      secondaryText="Save draft"
      // All values, not just the rendered fields: request lines carry their item without an input for it.
      allValues
      onSubmit={(v, draft) => save.mutateAsync({ v, submit: !draft })}
      draftKey={order || start?.materialRequestId || start?.quotationId ? undefined : `po:${start?.projectId ?? 'any'}`}
      width={1040}
      footerExtra={
        <Typography.Text strong className="mono" style={{ marginInlineEnd: 8 }}>
          {formatINR(totals.total, true)}
        </Typography.Text>
      }
    >
      <Form form={form} layout="vertical">
        <FormSection title="Order">
          <FormGrid cols={4}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} disabled={!!order || !!start?.projectId} options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
            </Form.Item>
            <Form.Item
              name="vendorId"
              label="Vendor"
              rules={[{ required: true, message: 'Pick the vendor from the master' }]}
              extra={vendor ? [vendor.gstin ? `GSTIN ${vendor.gstin}` : 'No GSTIN', vendor.msmeCategory ? MSME_CATEGORY_LABELS[vendor.msmeCategory] : null].filter(Boolean).join(' · ') : undefined}
            >
              <VendorSelect prefer={['SUPPLIER']} />
            </Form.Item>
            <Form.Item name="poDate" label="PO date" rules={[{ required: true, message: 'Pick the PO date' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="deliveryBy" label="Deliver by">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>

        {needsReason && lowest ? (
          <FormSection title="Why this vendor">
            <Form.Item
              name="selectionReason"
              label={
                <span>
                  <span translate="no">{lowest.vendorName}</span> quoted lowest (<span translate="no">{formatINR(lowest.total, true)}</span>). Why does this order go to another vendor?
                </span>
              }
              extra="The approver sees this on the order."
              rules={[
                { required: true, whitespace: true, message: 'Say why the lowest quotation is not taken' },
                { min: REASON_MIN, message: 'Say it in a sentence: delivery, quality, credit or stock' },
              ]}
            >
              <Input.TextArea rows={2} maxLength={500} placeholder="The lowest vendor cannot deliver before the 30th; the slab is cast on the 26th." />
            </Form.Item>
          </FormSection>
        ) : null}

        <FormSection title="Items">
          {makeWarnings.length ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title={`${makeWarnings.length === 1 ? '1 line is' : `${makeWarnings.length} lines are`} not in a make approved for this project`}
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {makeWarnings.map((w) => (
                    <li key={w.index}>{makeWarningText(w)}</li>
                  ))}
                </ul>
              }
            />
          ) : null}
          <LineTable
            name="lines"
            label="Item"
            addText="Add item"
            min={1}
            newLine={() => ({ gstRate: 18 })}
            columns={[
              {
                title: 'Item',
                key: 'item',
                render: (f) =>
                  lines?.[f.name]?.materialRequestItemId ? (
                    <div>
                      <Typography.Text strong>{lines[f.name].itemName}</Typography.Text>
                      {lines[f.name].specification && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{lines[f.name].specification}</div>}
                    </div>
                  ) : (
                    <div style={{ minWidth: 200 }}>
                      <Form.Item name={[f.name, 'itemName']} noStyle rules={[{ required: true, whitespace: true, message: 'Enter the item' }]}>
                        <ItemPicker
                          placeholder="Item"
                          aria-label={`Item of line ${f.name + 1}`}
                          maxLength={200}
                          unit={lines?.[f.name]?.unit}
                          onPick={(item) => {
                            form.setFieldValue(['lines', f.name, 'unit'], item.unit);
                            // The master's standard rate (the last approved order's) fills a rate not yet entered.
                            if (item.rate && !lines?.[f.name]?.rate) form.setFieldValue(['lines', f.name, 'rate'], Number(item.rate));
                          }}
                        />
                      </Form.Item>
                      <Form.Item name={[f.name, 'specification']} noStyle>
                        <Input placeholder="Specification" maxLength={300} style={{ marginTop: 4 }} />
                      </Form.Item>
                    </div>
                  ),
              },
              {
                title: 'Make',
                key: 'make',
                width: 150,
                render: (f) => {
                  const warn = makeWarnings.find((w) => w.index === f.name);
                  return (
                    <>
                      <Form.Item name={[f.name, 'make']} noStyle>
                        <Input placeholder="Make" aria-label={`Make of line ${f.name + 1}`} maxLength={120} status={warn ? 'warning' : undefined} translate="no" />
                      </Form.Item>
                      {warn ? (
                        <Typography.Text style={{ display: 'block', fontSize: themeFontSize('fontSizeSM'), color: themeColor('colorWarningText') }}>
                          {warn.reason === 'NO_MAKE' ? 'Name an approved make' : 'Not approved'}
                        </Typography.Text>
                      ) : null}
                    </>
                  );
                },
              },
              {
                title: 'Unit',
                key: 'unit',
                width: 90,
                render: (f) =>
                  lines?.[f.name]?.materialRequestItemId ? (
                    lines[f.name].unit
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
                render: (f) => (
                  <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity' }]}>
                    <QuantityInput min={0.001} aria-label={`Quantity of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                title: 'Rate',
                key: 'rate',
                width: 150,
                render: (f) => (
                  <>
                    <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Enter the rate' }]}>
                      <MoneyInput aria-label={`Rate of line ${f.name + 1}`} />
                    </Form.Item>
                    {lines?.[f.name]?.itemName && lines[f.name].unit ? (
                      <>
                        <LastRates itemName={lines[f.name].itemName!} rates={last.data?.[lastRateKey(lines[f.name].itemName!, lines[f.name].unit!)]} loading={last.isLoading} />
                        <RateAbove rate={lines[f.name].rate} quantity={lines[f.name].quantity} projectId={projectId} poDate={poDate} quotes={others.data?.[lastRateKey(lines[f.name].itemName!, lines[f.name].unit!)]} />
                      </>
                    ) : null}
                  </>
                ),
              },
              {
                title: 'GST',
                key: 'gst',
                width: 90,
                render: (f) => (
                  <Form.Item name={[f.name, 'gstRate']} noStyle initialValue={18}>
                    <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} aria-label={`GST of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              { title: 'Amount', key: 'amount', width: 130, align: 'right', render: (f) => <span className="mono" translate="no">{formatINR(lineAmount(lines?.[f.name]), true)}</span> },
            ]}
            footer={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7} align="right">
                  <Typography.Text type="secondary">Items before GST</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <span className="mono" translate="no">{formatINR(totals.subtotal, true)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            )}
          />
        </FormSection>

        <FormSection title="Terms">
          <FormGrid cols={2}>
            <div>
              <FormGrid cols={2}>
                <Form.Item name="freight" label="Freight">
                  <MoneyInput />
                </Form.Item>
                <Form.Item
                  name="paymentDays"
                  label="Payment days"
                  extra={msme ? `${vendor?.name} is a ${vendor?.msmeCategory?.toLowerCase()} enterprise: at most 45 days.` : 'From the invoice; 30 when left empty.'}
                  rules={[{ type: 'number', max: msme ? 45 : 365, message: msme ? 'At most 45 days for a micro or small enterprise' : 'At most 365 days' }]}
                >
                  <InputNumber min={0} precision={0} inputMode="numeric" style={{ width: '100%' }} />
                </Form.Item>
              </FormGrid>
              <Form.Item name="paymentTerms" label="Payment terms">
                <Input maxLength={300} placeholder="30 days from receipt of material and invoice" />
              </Form.Item>
              <Form.Item name="deliveryAddress" label="Delivery address">
                <Input maxLength={500} placeholder="Site store" />
              </Form.Item>
              <Form.Item name="remarks" label="Remarks (printed under the terms)">
                <Input.TextArea rows={2} maxLength={1000} />
              </Form.Item>
              <Form.Item name="docs" label="Quotation or other documents">
                <PhotoUpload max={4} />
              </Form.Item>
            </div>
            <div>
              <Alert type="info" title={summary} />
            </div>
          </FormGrid>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** One flagged line in words: "Line 2, TMT Fe500D 12mm: Kamdhenu is not approved; approved are Tata Tiscon, SAIL". */
export function makeWarningText(w: MakeWarningDto): string {
  const approved = `approved: ${w.approved.join(', ')}`;
  const head = `Line ${w.index + 1}, ${w.itemName}`;
  if (w.reason === 'NO_MAKE') return `${head}: no make named (${approved})`;
  return `${head}: ${w.make} is not approved${w.pendingMarNo ? `, ${w.pendingMarNo} is with the reviewer` : ''} (${approved})`;
}
