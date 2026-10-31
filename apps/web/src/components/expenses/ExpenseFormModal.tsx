'use client';

import React, { useEffect } from 'react';
import { Alert, Form, Input, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AiDraftDto, AttachmentDto, ExpenseCategory, ExpenseDto, PaymentMode } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GSTIN_PATTERN, GST_RATES, GST_TOLERANCE, PAYMENT_MODES, PAYMENT_MODE_LABELS, gstFor } from '@erp/shared';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, MoneyInput, upper } from '@/components/form/inputs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivities } from '@/lib/queries';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { formatINR } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { VendorPicker } from '@/components/vendors/VendorPicker';
import { aiFlagItem, draftDate } from '@/components/ai/drafts';
import { themeFontSize } from '@/lib/theme';
import { recordPage } from '@/components/approvals/queue';

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  category: ExpenseCategory;
  description: string;
  vendor?: string;
  vendorGstin?: string;
  billNo?: string;
  amount: number;
  gstRate: number;
  gstAmount?: number;
  paymentMode: PaymentMode;
  activityId?: string;
  remarks?: string;
  photos?: AttachmentDto[];
}

/** File a site expense, or (with `expense`) fix a returned one and resubmit it. */
export function ExpenseFormModal({ open, onClose, projectId, defaultProjectId, expense, prefill }: { open: boolean; onClose: () => void; projectId?: string; /** A new entry starts on this project (the header's), still changeable. */ defaultProjectId?: string; expense?: ExpenseDto | null; /** Filled in by Ask Nirmaan (AI item 71) */ prefill?: AiDraftDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = !!expense;
  const fixedProject = expense?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const amount = Form.useWatch('amount', form);
  const rate = Form.useWatch('gstRate', form);
  const typedGst = Form.useWatch('gstAmount', form);
  const computedGst = amount ? gstFor(amount, rate ?? 0) : 0;
  const gst = typedGst ?? computedGst;
  const photos = Form.useWatch('photos', form);
  const draft = expense ? null : prefill;
  const category = Form.useWatch('category', form);
  const paymentMode = Form.useWatch('paymentMode', form);
  const gstRateNow = Form.useWatch('gstRate', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (expense) {
      form.setFieldsValue({
        projectId: expense.projectId,
        date: dayjs(expense.date),
        category: expense.category,
        description: expense.description,
        vendor: expense.vendor ?? undefined,
        vendorGstin: expense.vendorGstin ?? undefined,
        billNo: expense.billNo ?? undefined,
        amount: Number(expense.amount),
        gstRate: Number(expense.gstRate),
        gstAmount: Math.abs(Number(expense.gstAmount) - gstFor(expense.amount, expense.gstRate)) > 0.001 ? Number(expense.gstAmount) : undefined,
        paymentMode: expense.paymentMode,
        activityId: expense.activityId ?? undefined,
        remarks: expense.remarks ?? undefined,
        photos: expense.attachments,
      });
    } else {
      form.setFieldsValue({ projectId: projectId ?? defaultProjectId, date: dayjs(), gstRate: 0, paymentMode: 'CASH' });
      if (prefill) {
        const v = prefill.values;
        form.setFieldsValue({ ...(v as Partial<FormValues>), projectId: prefill.projectId, date: draftDate(v.date) ?? dayjs() });
      }
    }
  }, [open, projectId, defaultProjectId, expense, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const body = {
        date: v.date.format('YYYY-MM-DD'),
        category: v.category,
        description: v.description.trim(),
        vendor: t(v.vendor),
        vendorGstin: t(v.vendorGstin?.toUpperCase()),
        billNo: t(v.billNo),
        amount: String(v.amount),
        gstRate: String(v.gstRate ?? 0),
        gstAmount: v.gstAmount === undefined || v.gstAmount === null ? null : String(v.gstAmount),
        paymentMode: v.paymentMode,
        activityId: v.activityId ?? (editing ? null : undefined),
        remarks: t(v.remarks),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return expense ? (await api.patch(`/expenses/${expense.id}`, body)).data : (await api.post('/expenses', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: ExpenseDto) => {
      notify.saved(editing ? `${x.expenseNo} resubmitted for approval` : `${x.expenseNo} submitted for approval`, recordPage('EXPENSE', x.id));
      qc.invalidateQueries();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={expense ? `${editActionLabel(expense.status)} · ${expense.expenseNo}` : 'New site expense'}
      okText={editing ? 'Resubmit for approval' : 'Submit for approval'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      layout="modal"
      width={680}
      draftKey={editing ? undefined : `expense:${projectId ?? 'any'}`}
      aiDraft={draft}
    >
      <Form form={form} layout="vertical">
        {expense?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${expense.reviewedByName ?? 'approver'}`} description={expense.reviewNote} />}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <ProjectSelect allowClear={false} placeholder="Choose the project" onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Choose the category' }]} {...aiFlagItem(draft, 'category', category)}>
            <Select placeholder="Choose the category" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))} />
          </Form.Item>
          <Form.Item name="date" label="Bill date" rules={[{ required: true, message: 'Choose the bill date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="description" label="What was it for" rules={[{ required: true, whitespace: true, message: 'Say what it was for' }]}>
          <Input maxLength={300} placeholder="e.g. Hydraulic hose for grader GRD-01" />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="vendor" label="Vendor">
            <VendorPicker onPick={(v) => v.gstin && !form.getFieldValue('vendorGstin') && form.setFieldValue('vendorGstin', v.gstin)} />
          </Form.Item>
          <Form.Item name="vendorGstin" label="Vendor GSTIN" normalize={upper} rules={[{ validator: async (_, v) => (!v || GSTIN_PATTERN.test(String(v).trim().toUpperCase()) ? undefined : Promise.reject(new Error('A GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5'))) }]}>
            <Input {...CODE_INPUT} maxLength={15} />
          </Form.Item>
          <Form.Item name="billNo" label="Bill no.">
            <Input maxLength={60} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={4}>
          <Form.Item name="amount" label="Taxable value" rules={[{ required: true, message: 'Enter the amount before GST' }]}>
            <MoneyInput min={0.01} />
          </Form.Item>
          <Form.Item name="gstRate" label="GST %" {...aiFlagItem(draft, 'gstRate', gstRateNow)}>
            <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
          </Form.Item>
          <Form.Item
            name="gstAmount"
            label="GST on bill"
            tooltip={`Leave empty to use ${rate ?? 0}% of the amount. A typed value must be within ₹${GST_TOLERANCE} of it.`}
            rules={[{ validator: async (_, v) => (v === undefined || v === null || Math.abs(Number(v) - computedGst) <= GST_TOLERANCE ? undefined : Promise.reject(new Error(`Expected about ₹${computedGst.toFixed(2)}`))) }]}
          >
            <MoneyInput placeholder={computedGst.toFixed(2)} />
          </Form.Item>
          <Form.Item label="Total">
            <Typography.Text strong style={{ fontSize: themeFontSize('fontSizeLG'), lineHeight: '32px' }}>
              {formatINR((Number(amount) || 0) + (Number(gst) || 0), true)}
            </Typography.Text>
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="paymentMode" label="Paid by" rules={[{ required: true, message: 'Choose how it was paid' }]} {...aiFlagItem(draft, 'paymentMode', paymentMode)}>
            <Select options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
          </Form.Item>
          <Form.Item name="activityId" label="Activity">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="photos" label="Bill / receipt photo" extra={!photos?.length ? 'Attach the bill; the PM may send expenses without one back.' : undefined}>
          <PhotoUpload />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
