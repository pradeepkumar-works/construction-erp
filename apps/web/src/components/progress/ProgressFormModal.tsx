'use client';

import React, { useEffect } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, ProgressEntryDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { SectorInputs, sectorBody, sectorFormValues, typedLocation, type SectorFormValues } from '@/components/sector/SectorInputs';

interface FormValues extends SectorFormValues {
  projectId: string;
  activityId: string;
  date: dayjs.Dayjs;
  quantity: number;
  location?: string;
  manpowerCount?: number;
  machineryUsed?: string;
  remarks?: string;
  photos?: AttachmentDto[];
}

/**
 * Create a progress entry, or (with `entry`) edit an existing draft / rejected / changes-requested
 * entry and resubmit it for approval in one go.
 */
export function ProgressFormModal({ open, onClose, projectId, entry }: { open: boolean; onClose: () => void; projectId?: string; entry?: ProgressEntryDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities, isLoading: actLoading } = useActivities(selectedProject);
  const selectedActivity = Form.useWatch('activityId', form);
  const activity = activities?.find((a) => a.id === selectedActivity);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (entry) {
      form.setFieldsValue({
        projectId: entry.projectId,
        activityId: entry.activityId,
        date: dayjs(entry.date),
        quantity: Number(entry.quantity),
        location: typedLocation(entry),
        ...sectorFormValues(entry),
        manpowerCount: entry.manpowerCount ?? undefined,
        machineryUsed: entry.machineryUsed ?? undefined,
        remarks: entry.remarks ?? undefined,
        photos: entry.attachments,
      });
    } else {
      form.setFieldsValue({ projectId, date: dayjs() });
    }
  }, [open, projectId, entry, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        activityId: v.activityId,
        date: v.date.format('YYYY-MM-DD'),
        quantity: String(v.quantity),
        location: v.location || (editing ? null : undefined),
        ...sectorBody(v, editing),
        manpowerCount: v.manpowerCount ?? (editing ? null : undefined),
        machineryUsed: v.machineryUsed || (editing ? null : undefined),
        remarks: v.remarks || (editing ? null : undefined),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return entry ? (await api.patch(`/progress/${entry.id}`, body)).data : (await api.post('/progress', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: () => {
      message.success(editing ? 'Progress entry resubmitted for approval' : 'Progress entry submitted for approval');
      qc.invalidateQueries();
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={entry ? `${editActionLabel(entry.status)} · ${entry.activityName}` : 'New progress entry'} okText={editing ? 'Resubmit for approval' : 'Submit'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px' }}>
          <Form.Item name="activityId" label="Activity" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              loading={actLoading}
              disabled={!selectedProject}
              placeholder={selectedProject ? 'Select activity' : 'Select a project first'}
              options={(activities ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.unit})` }))}
            />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="quantity" label={`Quantity executed${activity ? ` (${activity.unit})` : ''}`} rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="manpowerCount" label="Manpower">
            <InputNumber style={{ width: '100%' }} min={0} precision={0} />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input placeholder="Grid, side, structure" />
          </Form.Item>
        </div>
        <SectorInputs projectId={selectedProject} />
        <Form.Item name="machineryUsed" label="Machinery used">
          <Input placeholder="Excavator x1, Tipper x4" />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="photos" label="Site photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
