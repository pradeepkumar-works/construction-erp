'use client';

import React, { useEffect } from 'react';
import { Alert, Form, Input, Segmented, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, FundPurpose, PaymentMode, PaymentRequestDto } from '@erp/shared';
import { FUND_PURPOSES, FUND_PURPOSE_LABELS, RECEIPT_MODES, RECEIPT_MODE_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useImprests } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { VendorSelect } from '@/components/common/SearchSelect';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { recordPage } from '@/components/approvals/queue';
import { PAYMENT_QUERY_KEYS } from './PaymentFormModal';

type GoesTo = 'imprest' | 'party';

interface FormValues {
  projectId?: string;
  purpose?: FundPurpose;
  goesTo: GoesTo;
  imprestId?: string;
  vendorId?: string;
  amount: number | null;
  neededBy?: dayjs.Dayjs | null;
  mode: PaymentMode;
  raisedAtProjectId?: string;
  reason?: string;
  files?: AttachmentDto[];
}

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);

/**
 * A site asks head office for money: for wages, a local purchase or a petty contractor, released into the
 * site's imprest or paid to a party on account, optionally on behalf of another site. It goes to approval through the
 * matrix like any payment request; with `request`, a returned one is fixed and resubmitted.
 */
export function FundRequestFormModal({ open, onClose, request, projectId: fixedProject }: { open: boolean; onClose: () => void; request?: PaymentRequestDto | null; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = !!request;
  const projectId = Form.useWatch('projectId', form) as string | undefined;
  const goesTo = (Form.useWatch('goesTo', form) as GoesTo | undefined) ?? 'imprest';
  const { data: imprests } = useImprests({ projectId, active: true }, open && !editing && !!projectId);
  const imprestOptions = (imprests ?? []).map((i) => ({ value: i.id, label: `${i.holderName} · ${formatINR(i.cashInHand, true)} in hand` }));

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (request)
      form.setFieldsValue({
        projectId: request.projectId,
        purpose: request.purpose ?? undefined,
        goesTo: request.imprestId ? 'imprest' : 'party',
        amount: toNumber(request.amount),
        neededBy: request.neededBy ? dayjs(request.neededBy) : null,
        mode: request.mode,
        reason: request.reason ?? undefined,
        files: request.attachments,
      });
    else form.setFieldsValue({ projectId: fixedProject, goesTo: 'imprest', mode: 'BANK' });
  }, [open, request, fixedProject, form]);

  // The site's one imprest is the usual choice: pick it when there is only one.
  useEffect(() => {
    if (!open || editing || goesTo !== 'imprest') return;
    const current = form.getFieldValue('imprestId') as string | undefined;
    if (imprests && !imprests.some((i) => i.id === current)) form.setFieldsValue({ imprestId: imprests.length === 1 ? imprests[0].id : undefined });
  }, [open, editing, goesTo, imprests, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        amount: String(v.amount ?? 0),
        mode: v.mode,
        neededBy: ymd(v.neededBy),
        reason: v.reason?.trim() || null,
        purpose: v.purpose,
        attachmentIds: (v.files ?? []).map((f) => f.id),
        submit: true,
      };
      if (request) return (await api.patch<PaymentRequestDto>(`/payment-requests/${request.id}`, body)).data;
      return (
        await api.post<PaymentRequestDto>('/payment-requests', {
          ...body,
          id: crypto.randomUUID(),
          kind: 'FUND_REQUEST',
          projectId: v.projectId,
          ...(v.goesTo === 'imprest' ? { imprestId: v.imprestId } : { vendorId: v.vendorId }),
          raisedAtProjectId: v.raisedAtProjectId || undefined,
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

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={request ? `${editActionLabel(request.status)} · ${request.requestNo}` : 'Request funds'}
      okText={editing ? 'Resubmit for approval' : 'Send for approval'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : 'fund-request'}
    >
      <Form form={form} layout="vertical">
        {request?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${request.reviewedByName ?? 'approver'}`} description={request.reviewNote} />}
        {editing ? (
          <Typography.Paragraph type="secondary">
            {request.projectName}: {request.targetLabel}
          </Typography.Paragraph>
        ) : (
          <>
            <FormGrid cols={2}>
              <Form.Item name="projectId" label="For the site" rules={[{ required: true, message: 'Choose the site the money is for' }]}>
                <ProjectSelect aria-label="For the site" placeholder="Choose the site" allowClear={false} onChange={() => form.setFieldsValue({ imprestId: undefined })} />
              </Form.Item>
              <Form.Item name="purpose" label="For" rules={[{ required: true, message: 'Choose what the money is for' }]}>
                <Select options={FUND_PURPOSES.map((p) => ({ value: p, label: FUND_PURPOSE_LABELS[p] }))} placeholder="Wages, local purchase…" />
              </Form.Item>
            </FormGrid>
            <Form.Item name="goesTo" label="Goes to">
              <Segmented
                options={[
                  { value: 'imprest', label: "The site's imprest" },
                  { value: 'party', label: 'A party, on account' },
                ]}
              />
            </Form.Item>
            {goesTo === 'imprest' ? (
              <Form.Item
                name="imprestId"
                label="Imprest"
                rules={[{ required: true, message: 'Choose the imprest to release it into' }]}
                extra={projectId && imprests && !imprests.length ? 'This site has no open imprest. Accounts open one under Site imprest, or ask for a payment to a party.' : undefined}
              >
                <Select options={imprestOptions} placeholder={projectId ? 'Who holds the cash' : 'Choose the site first'} disabled={!projectId} />
              </Form.Item>
            ) : (
              <Form.Item name="vendorId" label="Party" rules={[{ required: true, message: 'Choose the party to pay' }]} extra="Paid on account; their bill takes it off later.">
                <VendorSelect prefer={['LABOUR_CONTRACTOR', 'SUBCONTRACTOR']} />
              </Form.Item>
            )}
          </>
        )}
        {editing && (
          <Form.Item name="purpose" label="For" rules={[{ required: true, message: 'Choose what the money is for' }]}>
            <Select options={FUND_PURPOSES.map((p) => ({ value: p, label: FUND_PURPOSE_LABELS[p] }))} />
          </Form.Item>
        )}
        <FormGrid cols={3}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount needed' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="neededBy" label="Needed by">
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="mode" label="Pay by">
            <Select options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="reason" label="What it is for" rules={[{ required: true, whitespace: true, message: 'Say what the money is for, e.g. the week’s wages of the helpers' }]}>
          <Input.TextArea rows={2} maxLength={1000} placeholder="Weekly wages of the local helpers on the WMM stretch" />
        </Form.Item>
        {!editing && (
          <Form.Item name="raisedAtProjectId" label="Asking from another site" extra="When you ask on behalf of the site above from a site of your own.">
            <ProjectSelect aria-label="Asking from another site" placeholder="This site" />
          </Form.Item>
        )}
        <Form.Item name="files" label="Wage sheet, quotation or letter">
          <PhotoUpload max={4} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface ReleaseValues {
  date: dayjs.Dayjs;
  amount: number | null;
  mode: PaymentMode;
  reference?: string;
}

/** Release an approved fund request into its imprest: a paid advance that raises the holder's cash in hand. */
export function ReleaseFundsModal({ request, onClose }: { request: PaymentRequestDto | null; onClose: () => void }) {
  const [form] = Form.useForm<ReleaseValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (!request) return;
    form.resetFields();
    form.setFieldsValue({ date: dayjs(), amount: toNumber(request.outstanding), mode: request.mode });
  }, [request, form]);
  const mutation = useMutation({
    mutationFn: async (v: ReleaseValues) =>
      (await api.post<PaymentRequestDto>(`/payment-requests/${request!.id}/release`, { date: v.date.format('YYYY-MM-DD'), amount: v.amount === null ? undefined : String(v.amount), mode: v.mode, reference: v.reference?.trim() || undefined })).data,
    onSuccess: (r) => {
      notify.saved(`${r.requestNo}: released into ${r.imprestHolderName ? `${r.imprestHolderName}'s` : 'the'} imprest`, recordPage('PAYMENT_REQUEST', r.id));
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ['imprests'] });
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!request} onClose={onClose} form={form} layout="modal" title={request ? `Release · ${request.requestNo}` : 'Release'} okText="Release" onSubmit={(v) => mutation.mutateAsync(v)}>
      {request ? (
        <p className="text-muted" style={{ marginTop: 0 }}>
          Into {request.imprestHolderName}&apos;s imprest at {request.projectName}: {formatINR(request.outstanding, true)} left of {formatINR(request.amount, true)}.
        </p>
      ) : null}
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="date" label="Released on" rules={[{ required: true, message: 'Choose the day the money went out' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount released' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="mode" label="Paid by">
            <Select options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
          </Form.Item>
          <Form.Item name="reference" label="Reference">
            <Input placeholder="UTR, cheque or voucher no." maxLength={100} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}
