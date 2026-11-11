'use client';

import React, { useEffect } from 'react';
import { Alert, Checkbox, Form, Input, Select, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, SubcontractBillDto, WorkOrderLineDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useWorkOrder, useWorkOrders } from '@/lib/queries';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { LineTable } from '@/components/form/LineTable';
import { useMasterOptions } from '@/components/quality/NcrFormModal';
import { recordPage } from '@/components/approvals/queue';
import { BACK_CHARGE_OTHER, halfOfHeld, unitLabel } from '@erp/shared';
import { Money } from '@/components/common/Money';

interface FormValues {
  workOrderId: string;
  billDate: dayjs.Dayjs;
  measuredUpTo: dayjs.Dayjs;
  invoiceNo?: string;
  isFinal?: boolean;
  /** Own items: quantity in this bill, by work order line id */
  qty?: Record<string, number | null>;
  /** Back-charges by kind */
  charges?: { kindCode?: string; amount?: number | null; note?: string }[];
  /** Retention held on earlier bills paid back on this one */
  retentionRelease?: number | null;
  remarks?: string;
  docs?: AttachmentDto[];
}

/**
 * Prepare (or correct) a subcontractor's running bill on an approved work order. BOQ items take their quantities from
 * approved measurements under the order and material issued to them is recovered, both up to "measured up to"; only the
 * order's own items take a quantity here. The bill works out the deductions when it is saved. Back-charges go by kind,
 * and retention held on earlier bills can be paid back; `release` makes a bill that only pays back retention (ARCHITECTURE
 * "Subcontracts", Retention release and back-charges).
 */
export function SubBillFormModal({
  open,
  bill,
  workOrderId,
  fromInvoice,
  release,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** A new bill that only pays back retention */
  release?: boolean;
  bill?: SubcontractBillDto | null;
  workOrderId?: string;
  /** A subcontractor's invoice from the supplier portal: the bill takes its number and date, which links the two. */
  fromInvoice?: { invoiceNo: string; invoiceDate: string } | null;
  onClose: () => void;
  onSaved?: (b: SubcontractBillDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const watchedWo = Form.useWatch('workOrderId', form);
  const woId = bill?.workOrderId ?? workOrderId ?? watchedWo;
  const orders = useWorkOrders({ open: true, pageSize: 100, sortBy: 'woDate', sortOrder: 'desc' }, open && !bill && !workOrderId);
  const { data: wo, isLoading: woLoading } = useWorkOrder(open ? woId : undefined);
  const isRelease = bill ? bill.isRelease : !!release;
  const kinds = useMasterOptions('back-charge', null, open);
  /** What this bill may pay back: held before it (editing), else held on the order now. */
  const held = bill ? bill.retentionHeldBefore : wo?.retentionHeld;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (bill)
      form.setFieldsValue({
        workOrderId: bill.workOrderId,
        billDate: dayjs(bill.billDate),
        measuredUpTo: dayjs(bill.measuredUpTo),
        invoiceNo: bill.invoiceNo ?? undefined,
        isFinal: bill.isFinal,
        qty: Object.fromEntries(bill.lines.filter((l) => !l.boqItemId).map((l) => [l.workOrderLineId, toNumber(l.thisQty)])),
        charges: bill.charges.map((c) => ({ kindCode: c.kindCode, amount: toNumber(c.amount), note: c.note ?? undefined })),
        retentionRelease: toNumber(bill.retentionReleased) || null,
        remarks: bill.remarks ?? undefined,
        docs: bill.attachments,
      });
    else
      form.setFieldsValue({
        workOrderId,
        billDate: fromInvoice ? dayjs(fromInvoice.invoiceDate) : dayjs(),
        measuredUpTo: dayjs(),
        invoiceNo: fromInvoice?.invoiceNo,
      });
  }, [open, bill, workOrderId, fromInvoice, form]);

  const ownLines = (wo?.lines ?? []).filter((l) => !l.boqItemId);
  const boqLines = (wo?.lines ?? []).filter((l) => l.boqItemId);
  /** Billed on other bills (not rejected): the order's figure less this bill's own quantity when editing. */
  const billedElsewhere = (l: WorkOrderLineDto) => Math.max(0, toNumber(l.billedQty) - toNumber(bill?.lines.find((x) => x.workOrderLineId === l.id)?.thisQty));

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const body = {
        billDate: v.billDate.format('YYYY-MM-DD'),
        ...(isRelease
          ? {}
          : {
              measuredUpTo: v.measuredUpTo.format('YYYY-MM-DD'),
              isFinal: !!v.isFinal,
              quantities: ownLines.map((l) => ({ workOrderLineId: l.id, quantity: String(v.qty?.[l.id] ?? 0) })),
            }),
        invoiceNo: v.invoiceNo?.trim() || null,
        charges: (v.charges ?? []).filter((c) => c.kindCode || c.amount).map((c) => ({ kindCode: c.kindCode ?? '', amount: String(c.amount ?? 0), note: c.note?.trim() || null })),
        retentionRelease: String(v.retentionRelease ?? 0),
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        submit,
      };
      if (bill) return (await api.patch<SubcontractBillDto>(`/subcontract-bills/${bill.id}`, body)).data;
      return (await api.post<SubcontractBillDto>('/subcontract-bills', { ...body, id: crypto.randomUUID(), workOrderId: v.workOrderId, isRelease })).data;
    },
    onSuccess: (b, { submit }) => {
      notify.saved(submit ? `${b.label} submitted for approval: net payable ${formatINR(b.netPayable, true)}` : `${b.label} saved as a draft: net payable ${formatINR(b.netPayable, true)}`, recordPage('SUBCONTRACT_BILL', b.id));
      qc.invalidateQueries({ queryKey: ['subcontract-bills'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      onSaved?.(b);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={860}
      allValues
      title={bill ? `Edit ${bill.label}` : isRelease && wo ? `Release retention on ${wo.woNo} · ${wo.vendorName}` : wo ? `New bill on ${wo.woNo} · ${wo.vendorName}` : 'New subcontractor bill'}
      okText="Save and submit"
      secondaryText="Save as draft"
      onSubmit={(v, secondary) => save.mutateAsync({ v, submit: !secondary })}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormSection title="Bill">
          {!bill && !workOrderId && (
            <Form.Item name="workOrderId" label="Work order" rules={[{ required: true, message: 'Choose the work order' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                loading={orders.isLoading}
                placeholder="An approved, open work order"
                options={(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.woNo} · ${o.vendorName} · ${o.title}` }))}
              />
            </Form.Item>
          )}
          <FormGrid cols={2}>
            <Form.Item name="billDate" label="Bill date" rules={[{ required: true, message: 'Choose the bill date' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            {!isRelease && (
              <Form.Item name="measuredUpTo" label="Work measured up to" rules={[{ required: true, message: 'Choose the day work is measured up to' }]} tooltip="Approved measurements and material issued to them up to this day go in the bill">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            )}
            <Form.Item name="invoiceNo" label="Their invoice no.">
              <Input maxLength={60} placeholder="SC/24-25/017" />
            </Form.Item>
            {!isRelease && (
              <Form.Item name="isFinal" label="Final bill" valuePropName="checked">
                <Checkbox>This is their final bill</Checkbox>
              </Form.Item>
            )}
          </FormGrid>
        </FormSection>
        {woId && woLoading && <Typography.Text type="secondary">Loading the work order…</Typography.Text>}
        {wo && !isRelease && (boqLines.length > 0 || ownLines.length > 0) && (
          <FormSection title="Work in this bill">
            {boqLines.length > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: tk.space[3] }}
                title="BOQ items are billed as measured"
                description={
                  <span>
                    {boqLines.map((l) => `${l.itemNo}: ${formatQty(l.measuredQty)} of ${formatQty(l.quantity)} ${unitLabel(l.unit)} measured, ${formatQty(billedElsewhere(l))} billed before`).join(' · ')}. Only approved measurements tagged to {wo.woNo} count.
                  </span>
                }
              />
            )}
            {ownLines.length > 0 && (
              <>
                <Typography.Text strong>Own items in this bill</Typography.Text>
                <Table<WorkOrderLineDto>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={ownLines}
                  style={{ margin: `${tk.space[2]} 0 ${tk.space[4]}` }}
                  columns={[
                    { title: 'Item', dataIndex: 'description' },
                    { title: 'Ordered', width: 120, align: 'right', render: (_, l) => <span className="mono" translate="no">{formatQty(l.quantity)} {l.unit}</span> },
                    { title: 'Billed before', width: 110, align: 'right', render: (_, l) => <span className="mono" translate="no">{formatQty(billedElsewhere(l))}</span> },
                    { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => <Money value={v} paise /> },
                    {
                      title: 'This bill',
                      width: 130,
                      render: (_, l) => (
                        <Form.Item name={['qty', l.id]} noStyle>
                          <QuantityInput unit={l.unit} aria-label={`This bill quantity of ${l.description}`} />
                        </Form.Item>
                      ),
                    },
                  ]}
                />
              </>
            )}
          </FormSection>
        )}
        <FormSection title="Retention">
          <Form.Item
            name="retentionRelease"
            label="Retention to pay back"
            tooltip="Retention kept on their earlier bills, paid back on this one: often half with the final bill and the rest after the defects liability period"
            extra={held !== undefined ? <span translate="no">{formatINR(held, true)} held{toNumber(held) > 0 ? `, half is ${formatINR(halfOfHeld(held), true)}` : ''}</span> : null}
            rules={[
              { required: isRelease, message: 'Enter the retention to pay back' },
              {
                validator: (_, v: number | null | undefined) =>
                  v && held !== undefined && v > toNumber(held) ? Promise.reject(new Error(`Pay back at most ${formatINR(held, true)}, the retention held`)) : Promise.resolve(),
              },
            ]}
          >
            <MoneyInput style={{ maxWidth: 240 }} />
          </Form.Item>
        </FormSection>
        <FormSection title="Back-charges and documents">
          <LineTable
            name="charges"
            label="Back-charge"
            addText="Add back-charge"
            newLine={() => ({ kindCode: undefined, amount: null, note: '' })}
            columns={[
              {
                key: 'kind',
                title: 'For',
                width: 240,
                render: (f) => (
                  <Form.Item name={[f.name, 'kindCode']} noStyle rules={[{ required: true, message: 'Choose what the back-charge is for' }]}>
                    <Select aria-label="Back-charge for" options={kinds.options} placeholder="Cleaning, damage…" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
              {
                key: 'amount',
                title: 'Amount',
                width: 150,
                render: (f) => (
                  <Form.Item name={[f.name, 'amount']} noStyle rules={[{ required: true, message: 'Enter the back-charge amount' }]}>
                    <MoneyInput aria-label="Back-charge amount" />
                  </Form.Item>
                ),
              },
              {
                key: 'note',
                title: 'Details',
                render: (f) => (
                  <Form.Item
                    name={[f.name, 'note']}
                    noStyle
                    dependencies={[['charges', f.name, 'kindCode']]}
                    rules={[({ getFieldValue }) => ({ required: getFieldValue(['charges', f.name, 'kindCode']) === BACK_CHARGE_OTHER, message: 'Say what the other charge is for' })]}
                  >
                    <Input aria-label="Back-charge details" maxLength={200} placeholder="Debris left at block B" />
                  </Form.Item>
                ),
              },
            ]}
          />
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Form.Item name="docs" label="Their invoice or other documents">
            <PhotoUpload max={4} />
          </Form.Item>
          {wo && (
            <Typography.Paragraph type="secondary" style={{ fontSize: tk.type.caption.fontSize, marginBottom: 0 }}>
              {isRelease ? 'A retention release takes no work and deducts nothing but its back-charges.' : <>Deducted on saving: retention {wo.retentionPct}%, TDS {wo.tdsPct}%
              {toNumber(wo.advanceAmount) > 0 ? `, advance recovery ${wo.advanceRecoveryPct}% (${formatINR(toNumber(wo.advanceAmount) - toNumber(wo.advanceRecovered), true)} left)` : ''}, and material issued to them at our rates. GST {wo.gstRate}% is added.</>}
            </Typography.Paragraph>
          )}
        </FormSection>
      </Form>
    </FormShell>
  );
}
