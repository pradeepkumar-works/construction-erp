'use client';

import React, { useEffect } from 'react';
import { Alert, App, Checkbox, DatePicker, Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, RaBillDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

interface FormValues {
  projectId: string;
  billDate: dayjs.Dayjs;
  measuredUpTo: dayjs.Dayjs;
  isFinal?: boolean;
  otherDeduction?: number | null;
  otherDeductionNote?: string;
  remarks?: string;
  files?: AttachmentDto[];
}

/**
 * Prepare the next RA bill of a project, or (with `bill`) change one that is not approved yet. The API picks the approved
 * measurements up to the date and prices them; saving as a draft shows the abstract before it goes for approval.
 */
export function BillFormModal({ open, onClose, projectId, defaultProjectId, bill, onSaved }: { open: boolean; onClose: () => void; projectId?: string; /** A new bill starts on this project (the header's), still changeable. */ defaultProjectId?: string; bill?: RaBillDto | null; onSaved?: (b: RaBillDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!bill;
  const fixedProject = bill?.projectId ?? projectId;
  const billDate = Form.useWatch('billDate', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (bill) {
      form.setFieldsValue({
        projectId: bill.projectId,
        billDate: dayjs(bill.billDate),
        measuredUpTo: dayjs(bill.measuredUpTo),
        isFinal: bill.isFinal,
        otherDeduction: Number(bill.otherDeduction) || null,
        otherDeductionNote: bill.otherDeductionNote ?? undefined,
        remarks: bill.remarks ?? undefined,
        files: bill.attachments,
      });
    } else {
      form.setFieldsValue({ projectId: projectId ?? defaultProjectId, billDate: dayjs(), measuredUpTo: dayjs() });
    }
  }, [open, projectId, defaultProjectId, bill, form]);

  const mutation = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const body = {
        billDate: v.billDate.format('YYYY-MM-DD'),
        measuredUpTo: v.measuredUpTo.format('YYYY-MM-DD'),
        isFinal: !!v.isFinal,
        otherDeduction: String(v.otherDeduction ?? 0),
        otherDeductionNote: v.otherDeductionNote?.trim() || null,
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.files ?? []).map((f) => f.id),
        submit,
      };
      return bill ? (await api.patch<RaBillDto>(`/ra-bills/${bill.id}`, body)).data : (await api.post<RaBillDto>('/ra-bills', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (b, { submit }) => {
      message.success(submit ? `${b.billLabel} submitted for approval` : `${b.billLabel} saved as a draft`);
      qc.invalidateQueries();
      onSaved?.(b);
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={bill ? `${bill.status === 'DRAFT' ? 'Edit' : editActionLabel(bill.status)} · ${bill.billLabel}` : 'New RA bill'}
      okText={bill && bill.status !== 'DRAFT' ? 'Resubmit for approval' : 'Submit for approval'}
      secondaryText={editing ? 'Save' : 'Save as draft'}
      onSubmit={(v, draft) => mutation.mutateAsync({ v, submit: !draft })}
      layout="modal"
      width={640}
      draftKey={bill ? undefined : `ra-bill:${projectId ?? 'any'}`}
    >
      <Form form={form} layout="vertical">
        {bill?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${bill.reviewedByName ?? 'approver'}`} description={bill.reviewNote} />}
        <Typography.Paragraph type="secondary">
          The bill takes the approved measurements dated up to the date you give that no earlier bill took, prices them at the BOQ rates and applies the
          project&apos;s contract terms (GST, retention, advance recovery, TDS and cess). Measurements approved later are picked up when the bill is submitted.
        </Typography.Paragraph>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="billDate" label="Bill date" rules={[{ required: true, message: 'Pick the bill date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item
            name="measuredUpTo"
            label="Measurements up to"
            dependencies={['billDate']}
            rules={[
              { required: true, message: 'Pick the date measurements go up to' },
              ({ getFieldValue }) => ({
                validator: async (_, v: dayjs.Dayjs | undefined) => {
                  const bd = getFieldValue('billDate') as dayjs.Dayjs | undefined;
                  if (v && bd && v.isAfter(bd, 'day')) throw new Error('Cannot be after the bill date');
                },
              }),
            ]}
          >
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(billDate ?? dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="otherDeduction" label="Other deduction" extra="Water, electricity, hire of client's equipment">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="otherDeductionNote" label="What it is for">
            <Input maxLength={200} placeholder="e.g. Water charges" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="isFinal" valuePropName="checked">
          <Checkbox>This is the final bill of the work</Checkbox>
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="files" label="Covering letter or documents">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
