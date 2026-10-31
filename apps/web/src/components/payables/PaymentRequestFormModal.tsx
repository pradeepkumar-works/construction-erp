'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, Form, Input, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, PaymentMode, PaymentRequestDto, PaymentRequestKind } from '@erp/shared';
import { PAYMENT_REQUEST_KINDS, PAYMENT_REQUEST_KIND_LABELS, RECEIPT_MODES, RECEIPT_MODE_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { usePayables, usePurchaseOrders, useWorkOrders } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { recordPage } from '@/components/approvals/queue';
import { PAYMENT_QUERY_KEYS } from './PaymentFormModal';
import { FundRequestFormModal } from './FundRequestFormModal';

/** What this form asks for; a site's fund request has its own form. */
const KINDS = PAYMENT_REQUEST_KINDS.filter((k) => k !== 'FUND_REQUEST');

/** What a request is for, when the form is opened from that bill or order (its id goes in as the matching field). */
export interface RequestFor {
  kind: PaymentRequestKind;
  vendorBillId?: string;
  subcontractBillId?: string;
  purchaseOrderId?: string;
  workOrderId?: string;
  label: string;
  vendorName: string;
  /** The most this request may ask for */
  open: string;
}

interface FormValues {
  kind: PaymentRequestKind;
  targetKey?: string;
  amount: number | null;
  neededBy?: dayjs.Dayjs | null;
  mode: PaymentMode;
  reason?: string;
  files?: AttachmentDto[];
}

const ids = (t: RequestFor) => ({
  vendorBillId: t.vendorBillId,
  subcontractBillId: t.subcontractBillId,
  purchaseOrderId: t.purchaseOrderId,
  workOrderId: t.workOrderId,
});
const keyOf = (t: RequestFor) => t.vendorBillId ?? t.subcontractBillId ?? t.purchaseOrderId ?? t.workOrderId ?? '';

/**
 * Ask for a bill to be paid or an advance released on an order, or (with `request`) fix a returned request
 * and resubmit it. It goes to approval through the matrix; accounts pays it once approved. A returned fund request
 * opens its own form.
 */
export function PaymentRequestFormModal(props: { open: boolean; onClose: () => void; target?: RequestFor | null; request?: PaymentRequestDto | null }) {
  if (props.request?.kind === 'FUND_REQUEST') return <FundRequestFormModal open={props.open} onClose={props.onClose} request={props.request} />;
  return <BillRequestFormModal {...props} />;
}

function BillRequestFormModal({ open, onClose, target, request }: { open: boolean; onClose: () => void; target?: RequestFor | null; request?: PaymentRequestDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = !!request;
  const choosing = open && !target && !editing;
  const kind = (Form.useWatch('kind', form) as PaymentRequestKind | undefined) ?? target?.kind ?? request?.kind;
  const { data: payables } = usePayables({}, choosing && kind === 'BILL');
  const { data: pos } = usePurchaseOrders({ status: 'APPROVED', pageSize: 100, sortBy: 'poDate', sortOrder: 'desc' }, choosing && kind === 'PO_ADVANCE');
  const { data: wos } = useWorkOrders(
    {
      status: 'APPROVED',
      open: true,
      pageSize: 100,
      sortBy: 'woDate',
      sortOrder: 'desc',
    },
    choosing && kind === 'WO_ADVANCE',
  );

  // What can be asked for, by kind: approved bills with something unpaid and no request already open on them, and
  // approved open orders with value left to advance on.
  const choices: RequestFor[] = useMemo(() => {
    if (kind === 'BILL')
      return (payables?.openBills ?? [])
        .filter((b) => !b.request)
        .map((b) => ({
          kind,
          ...(b.billType === 'VENDOR_BILL' ? { vendorBillId: b.billId } : { subcontractBillId: b.billId }),
          label: b.billLabel,
          vendorName: b.vendorName,
          open: b.outstanding,
        }));
    if (kind === 'PO_ADVANCE')
      return (pos?.items ?? [])
        .filter((o) => !o.closedAt && toNumber(o.total) - toNumber(o.advanceRequested) > 0)
        .map((o) => ({
          kind,
          purchaseOrderId: o.id,
          label: o.poNo,
          vendorName: o.vendorName,
          open: String(toNumber(o.total) - toNumber(o.advanceRequested)),
        }));
    if (kind === 'WO_ADVANCE')
      return (wos?.items ?? [])
        .filter((o) => toNumber(o.value) - toNumber(o.advanceRequested) > 0)
        .map((o) => ({
          kind,
          workOrderId: o.id,
          label: o.woNo,
          vendorName: o.vendorName,
          open: String(toNumber(o.value) - toNumber(o.advanceRequested)),
        }));
    return [];
  }, [kind, payables, pos, wos]);

  const targetKey = Form.useWatch('targetKey', form) as string | undefined;
  const chosen = target ?? choices.find((c) => keyOf(c) === targetKey);
  const most = request?.targetOpen ?? chosen?.open;
  const amount = Form.useWatch('amount', form) as number | null | undefined;
  const over = most !== undefined && amount ? toNumber(amount) - toNumber(most) : 0;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (request)
      form.setFieldsValue({
        kind: request.kind,
        amount: toNumber(request.amount),
        neededBy: request.neededBy ? dayjs(request.neededBy) : null,
        mode: request.mode,
        reason: request.reason ?? undefined,
        files: request.attachments,
      });
    else
      form.setFieldsValue({
        kind: target?.kind ?? 'BILL',
        mode: 'BANK',
        amount: target ? toNumber(target.open) : null,
      });
  }, [open, target, request, form]);

  // A new request starts at the most it may ask for.
  useEffect(() => {
    if (open && !editing && !target && chosen) form.setFieldsValue({ amount: toNumber(chosen.open) });
  }, [open, editing, target, chosen, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        amount: String(v.amount ?? 0),
        mode: v.mode,
        neededBy: v.neededBy ? v.neededBy.format('YYYY-MM-DD') : null,
        reason: v.reason?.trim() || null,
        attachmentIds: (v.files ?? []).map((f) => f.id),
        submit: true,
      };
      if (request) return (await api.patch<PaymentRequestDto>(`/payment-requests/${request.id}`, body)).data;
      return (
        await api.post<PaymentRequestDto>('/payment-requests', {
          ...body,
          id: crypto.randomUUID(),
          kind: chosen!.kind,
          ...ids(chosen!),
        })
      ).data;
    },
    onSuccess: (r) => {
      notify.saved(`${r.requestNo} ${editing ? 'resubmitted' : 'sent'} for approval`, recordPage('PAYMENT_REQUEST', r.id));
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    meta: FAIL_NOTICE,
  });

  const forLabel = request ? request.targetLabel : target?.label;
  const title = request
    ? `${editActionLabel(request.status)} · ${request.requestNo}`
    : target
      ? `${target.kind === 'BILL' ? 'Request payment' : 'Request advance'} · ${target.label}`
      : 'Request payment';

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={title}
      okText={editing ? 'Resubmit for approval' : 'Send for approval'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing || target ? undefined : 'payment-request'}
    >
      <Form form={form} layout="vertical">
        {request?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${request.reviewedByName ?? 'approver'}`} description={request.reviewNote} />}
        {!target && !editing && (
          <FormGrid cols={2}>
            <Form.Item name="kind" label="For" rules={[{ required: true, message: 'Choose what the payment is for' }]}>
              <Select
                options={KINDS.map((k) => ({
                  value: k,
                  label: PAYMENT_REQUEST_KIND_LABELS[k],
                }))}
                onChange={() => form.setFieldsValue({ targetKey: undefined, amount: null })}
              />
            </Form.Item>
            <Form.Item
              name="targetKey"
              label={kind === 'BILL' ? 'Bill' : kind === 'PO_ADVANCE' ? 'Purchase order' : 'Work order'}
              rules={[
                {
                  required: true,
                  message: kind === 'BILL' ? 'Choose the bill' : 'Choose the order',
                },
              ]}
            >
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                placeholder={kind === 'BILL' ? 'Approved bills with something unpaid' : 'Approved orders'}
                options={choices.map((c) => ({
                  value: keyOf(c),
                  label: `${c.label} · ${c.vendorName} · up to ${formatINR(c.open)}`,
                }))}
                notFoundContent={kind === 'BILL' ? 'No approved bill is waiting for a request' : 'No approved order has value left to advance'}
              />
            </Form.Item>
          </FormGrid>
        )}
        {(forLabel || chosen) && most !== undefined && most !== null && (
          <Typography.Paragraph type="secondary">
            {forLabel ?? chosen?.label} · {request?.vendorName ?? target?.vendorName ?? chosen?.vendorName}: at most <strong>{formatINR(most, true)}</strong> can be asked for
            {kind === 'BILL' ? ' (unpaid on the bill, less other open requests on it).' : ' (the order value, less advances already asked for).'}
          </Typography.Paragraph>
        )}
        <FormGrid cols={3}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount to pay' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="neededBy" label="Needed by">
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="mode" label="Pay by">
            <Select
              options={RECEIPT_MODES.map((m) => ({
                value: m,
                label: RECEIPT_MODE_LABELS[m],
              }))}
            />
          </Form.Item>
        </FormGrid>
        {over > 1 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`That is ${formatINR(over, true)} more than can be asked for.`} />}
        <Form.Item
          name="reason"
          label="Reason"
          rules={
            kind !== 'BILL'
              ? [
                  {
                    required: true,
                    whitespace: true,
                    message: 'Say why the advance is needed, e.g. the order terms',
                  },
                ]
              : []
          }
        >
          <Input.TextArea rows={2} maxLength={1000} placeholder={kind === 'BILL' ? 'Material is held at the plant until this is paid' : 'Mobilisation advance as per the work order terms'} />
        </Form.Item>
        <Form.Item name="files" label="Proforma invoice or letter">
          <PhotoUpload max={4} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
