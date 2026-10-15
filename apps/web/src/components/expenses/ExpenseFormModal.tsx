'use client';

import React, { useEffect } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, ExpenseCategory, ExpenseDto, PaymentMode } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GSTIN_PATTERN, GST_RATES, GST_TOLERANCE, PAYMENT_MODES, PAYMENT_MODE_LABELS, gstFor } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useProjects } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { VendorPicker } from '@/components/vendors/VendorPicker';

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

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;

/** File a site expense, or (with `expense`) fix a returned one and resubmit it. */
export function ExpenseFormModal({ open, onClose, projectId, expense }: { open: boolean; onClose: () => void; projectId?: string; expense?: ExpenseDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
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
      form.setFieldsValue({ projectId, date: dayjs(), gstRate: 0, paymentMode: 'CASH' });
    }
  }, [open, projectId, expense, form]);

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
      message.success(editing ? `${x.expenseNo} resubmitted for approval` : `${x.expenseNo} submitted for approval`);
      qc.invalidateQueries();
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title={expense ? `${editActionLabel(expense.status)} · ${expense.expenseNo}` : 'New site expense'}
      okText={editing ? 'Resubmit for approval' : 'Submit'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      width={680}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        {expense?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${expense.reviewedByName ?? 'approver'}`} description={expense.reviewNote} />}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Required' }]}>
            <Select placeholder="Select" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))} />
          </Form.Item>
          <Form.Item name="date" label="Bill date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="What was it for" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input maxLength={300} placeholder="Hydraulic hose for grader GRD-01" />
        </Form.Item>
        <div style={grid('2fr 1.4fr 1fr')}>
          <Form.Item name="vendor" label="Vendor">
            <VendorPicker onPick={(v) => v.gstin && !form.getFieldValue('vendorGstin') && form.setFieldValue('vendorGstin', v.gstin)} />
          </Form.Item>
          <Form.Item name="vendorGstin" label="Vendor GSTIN" rules={[{ validator: async (_, v) => (!v || GSTIN_PATTERN.test(String(v).trim().toUpperCase()) ? undefined : Promise.reject(new Error('Not a valid GSTIN'))) }]}>
            <Input maxLength={15} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="billNo" label="Bill no.">
            <Input maxLength={60} />
          </Form.Item>
        </div>
        <div style={grid('1.2fr 1fr 1fr 1.2fr')}>
          <Form.Item name="amount" label="Taxable value (₹)" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} />
          </Form.Item>
          <Form.Item name="gstRate" label="GST %">
            <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
          </Form.Item>
          <Form.Item
            name="gstAmount"
            label="GST on bill"
            tooltip={`Leave empty to use ${rate ?? 0}% of the amount. A typed value must be within ₹${GST_TOLERANCE} of it.`}
            rules={[{ validator: async (_, v) => (v === undefined || v === null || Math.abs(Number(v) - computedGst) <= GST_TOLERANCE ? undefined : Promise.reject(new Error(`Expected about ₹${computedGst.toFixed(2)}`))) }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder={computedGst.toFixed(2)} />
          </Form.Item>
          <Form.Item label="Total">
            <Typography.Text strong style={{ fontSize: 16, lineHeight: '32px' }}>
              {formatINR((Number(amount) || 0) + (Number(gst) || 0), true)}
            </Typography.Text>
          </Form.Item>
        </div>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="paymentMode" label="Paid by" rules={[{ required: true }]}>
            <Select options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
          </Form.Item>
          <Form.Item name="activityId" label="Activity (optional)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
        </div>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="photos" label="Bill / receipt photo" extra={!photos?.length ? 'Attach the bill; the PM may send expenses without one back.' : undefined}>
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
