'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, Form, Input, Select, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DebitNoteDto, DebitNoteReason, VendorBillDto } from '@erp/shared';
import { DEBIT_NOTE_REASONS, DEBIT_NOTE_REASON_LABELS, GST_RATES } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useVendorBill, useVendorBills } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';

/** The bill a debit note goes against, as the bill's record knows it. */
export interface DebitNoteBill {
  billType: 'VENDOR_BILL' | 'SUBCONTRACT_BILL';
  billId: string;
  label: string;
  vendorName: string;
  billDate: string;
  /** Still unpaid on the bill: the most the note may take off */
  outstanding: string;
}

/** A GRN rejected at QA/QC or returned to the supplier: the note is against one of its order's approved bills. */
export interface DebitNoteGrn {
  stockEntryId: string;
  entryNo: string;
  projectId: string;
  purchaseOrderId: string | null;
  vendorId: string | null;
  reason: DebitNoteReason;
  lines: { purchaseOrderLineId: string | null; itemName: string; unit: string; quantity: number }[];
}

interface LineValue {
  description?: string;
  quantity?: number | null;
  unit?: string;
  rate?: number | null;
  amount?: number | null;
  gstRate?: number;
}

interface FormValues {
  vendorBillId?: string;
  date: dayjs.Dayjs;
  reason: DebitNoteReason;
  remarks?: string;
  lines: LineValue[];
}

const priced = (l: LineValue | undefined) => l?.quantity != null && l?.rate != null && toNumber(l.quantity) > 0;
const lineAmount = (l: LineValue | undefined) => (priced(l) ? Math.round(toNumber(l!.quantity) * toNumber(l!.rate) * 100) / 100 : toNumber(l?.amount));
const lineGst = (l: LineValue | undefined) => Math.round(lineAmount(l) * toNumber(l?.gstRate)) / 100;

/** GRN lines at the chosen bill's rates and GST, where the bill has the same PO line. */
const grnLines = (grn: DebitNoteGrn, bill: VendorBillDto | undefined): LineValue[] =>
  grn.lines.map((l) => {
    const b = bill?.lines.find((x) => x.purchaseOrderLineId && x.purchaseOrderLineId === l.purchaseOrderLineId);
    const what = grn.reason === 'RETURNED' ? 'returned' : 'rejected at QA/QC';
    return { description: `${l.itemName}, ${what} (${grn.entryNo})`.slice(0, 200), quantity: l.quantity, unit: l.unit, rate: b ? toNumber(b.rate) : null, gstRate: b ? toNumber(b.gstRate) : 18 };
  });

/**
 * Raise a debit note (v5 item 91): what the vendor or subcontractor owes back on an approved bill (short supply, billed
 * in excess, rejected, returned, a rate difference), taken off what is still unpaid on it. Lines take a quantity and
 * rate, or a lump sum. From a GRN, the form picks among its order's approved bills and starts from the GRN's lines.
 */
export function DebitNoteFormModal({ open, bill, grn, onClose, onSaved }: { open: boolean; bill?: DebitNoteBill | null; grn?: DebitNoteGrn | null; onClose: () => void; onSaved?: (n: DebitNoteDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const lines = Form.useWatch('lines', { form, preserve: true }) as LineValue[] | undefined;
  const pickedId = Form.useWatch('vendorBillId', form) as string | undefined;
  const choices = useVendorBills(
    { status: 'APPROVED', projectId: grn?.projectId, ...(grn?.purchaseOrderId ? { purchaseOrderId: grn.purchaseOrderId } : { vendorId: grn?.vendorId ?? undefined }), pageSize: 50, sortBy: 'invoiceDate', sortOrder: 'desc' },
    open && !!grn,
  );
  const picked = useVendorBill(open && grn ? pickedId : undefined).data;
  const target: DebitNoteBill | null = bill ?? (picked ? { billType: 'VENDOR_BILL', billId: picked.id, label: `${picked.billNo} · ${picked.invoiceNo}`, vendorName: picked.vendorName, billDate: picked.invoiceDate, outstanding: picked.outstanding } : null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ date: dayjs(), reason: grn?.reason ?? 'SHORTAGE', lines: grn ? grnLines(grn, undefined) : [{ gstRate: 18 }] });
  }, [open, grn, form]);

  // The first approved bill of the order is the likely one; its rates fill the GRN's lines.
  const firstChoice = choices.data?.items[0]?.id;
  useEffect(() => {
    if (open && grn && firstChoice && !form.getFieldValue('vendorBillId')) form.setFieldValue('vendorBillId', firstChoice);
  }, [open, grn, firstChoice, form]);
  useEffect(() => {
    if (open && grn && picked) form.setFieldValue('lines', grnLines(grn, picked));
  }, [open, grn, picked, form]);

  const totals = useMemo(() => {
    const subtotal = (lines ?? []).reduce((s, l) => s + lineAmount(l), 0);
    const gst = (lines ?? []).reduce((s, l) => s + lineGst(l), 0);
    return { subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
  }, [lines]);
  const over = target ? totals.total - toNumber(target.outstanding) : 0;

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        id: crypto.randomUUID(),
        ...(target!.billType === 'VENDOR_BILL' ? { vendorBillId: target!.billId } : { subcontractBillId: target!.billId }),
        stockEntryId: grn?.stockEntryId,
        date: v.date.format('YYYY-MM-DD'),
        reason: v.reason,
        remarks: v.remarks?.trim() || null,
        lines: v.lines.map((l) => ({
          description: l.description!.trim(),
          unit: l.unit?.trim() || null,
          ...(priced(l) ? { quantity: String(l.quantity), rate: String(l.rate) } : { amount: String(l.amount ?? 0) }),
          gstRate: String(l.gstRate ?? 0),
        })),
      };
      return (await api.post<DebitNoteDto>('/debit-notes', body)).data;
    },
    onSuccess: (n) => {
      notify.saved(`${n.noteNo} raised: ${formatINR(n.total, true)} off ${n.billLabel}`, `/debit-notes/${n.id}`);
      for (const k of ['debit-notes', 'vendor-bills', 'subcontract-bills', 'payables', 'payment-requests']) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ['stock', 'waiting'] });
      onSaved?.(n);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={920}
      allValues
      title={target ? `New debit note · ${target.label}` : grn ? `New debit note · ${grn.entryNo}` : 'New debit note'}
      okText="Save debit note"
      okDisabled={!target || over > 1}
      onSubmit={(v) => save.mutateAsync(v)}
      footerExtra={
        <Typography.Text strong className="mono" style={{ marginInlineEnd: 8 }}>
          {formatINR(totals.total, true)}
        </Typography.Text>
      }
    >
      <Form form={form} layout="vertical">
        {grn ? (
          <Form.Item
            name="vendorBillId"
            label="Against the bill"
            rules={[{ required: true, message: 'Choose the approved bill the note is against' }]}
            extra={!choices.isLoading && !choices.data?.items.length ? 'No approved bill for this order yet: record and approve the bill first.' : undefined}
          >
            <Select
              loading={choices.isLoading}
              options={(choices.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.billNo} · ${b.invoiceNo} · ${formatINR(b.outstanding, true)} unpaid` }))}
            />
          </Form.Item>
        ) : null}
        {target ? (
          <Typography.Paragraph type="secondary">
            {target.vendorName}, bill of {formatDate(target.billDate)}: {formatINR(target.outstanding, true)} still unpaid, the most the note can take off.
          </Typography.Paragraph>
        ) : null}
        <FormGrid cols={2}>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Choose the reason' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={DEBIT_NOTE_REASONS.map((r) => ({ value: r, label: DEBIT_NOTE_REASON_LABELS[r] }))} />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date of the note' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || (!!target && d.isBefore(dayjs(target.billDate), 'day'))} />
          </Form.Item>
        </FormGrid>
        <LineTable
          name="lines"
          label="Debit note"
          min={1}
          newLine={() => ({ gstRate: 18 })}
          columns={[
            {
              title: 'What for',
              key: 'description',
              render: (f) => (
                <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Say what the line is for' }]}>
                  <Input aria-label={`What line ${f.name + 1} is for`} maxLength={200} style={{ minWidth: 200 }} />
                </Form.Item>
              ),
            },
            {
              title: 'Quantity',
              key: 'qty',
              width: 110,
              render: (f) => (
                <Form.Item name={[f.name, 'quantity']} noStyle>
                  <QuantityInput aria-label={`Quantity of line ${f.name + 1}`} />
                </Form.Item>
              ),
            },
            {
              title: 'Unit',
              key: 'unit',
              width: 80,
              render: (f) => (
                <Form.Item name={[f.name, 'unit']} noStyle>
                  <UnitInput aria-label={`Unit of line ${f.name + 1}`} maxLength={20} />
                </Form.Item>
              ),
            },
            {
              title: 'Rate',
              key: 'rate',
              width: 120,
              render: (f) => (
                <Form.Item name={[f.name, 'rate']} noStyle>
                  <MoneyInput aria-label={`Rate of line ${f.name + 1}`} />
                </Form.Item>
              ),
            },
            {
              title: 'Amount',
              key: 'amount',
              width: 130,
              align: 'right',
              render: (f) =>
                priced(lines?.[f.name]) ? (
                  <span className="mono" translate="no">
                    {formatINR(lineAmount(lines?.[f.name]), true)}
                  </span>
                ) : (
                  <Form.Item name={[f.name, 'amount']} noStyle rules={[{ required: true, message: 'Enter the amount, or the quantity and rate' }]}>
                    <MoneyInput aria-label={`Lump sum of line ${f.name + 1}`} placeholder="Lump sum" />
                  </Form.Item>
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
          ]}
          footer={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5} align="right">
                <Typography.Text type="secondary">Before GST {formatINR(totals.subtotal, true)} · GST {formatINR(totals.gst, true)} · Total</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <strong className="mono" translate="no">
                  {formatINR(totals.total, true)}
                </strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} colSpan={2} />
            </Table.Summary.Row>
          )}
        />
        {over > 1 ? <Alert type="error" showIcon style={{ margin: '12px 0' }} title={`The note is ${formatINR(over, true)} more than is still unpaid on the bill; record a refund from the supplier instead`} /> : null}
        <Form.Item name="remarks" label="Remarks" style={{ marginTop: 12 }}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
