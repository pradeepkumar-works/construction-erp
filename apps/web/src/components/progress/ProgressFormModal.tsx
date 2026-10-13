'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';

interface FormValues {
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

export function ProgressFormModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const selectedProject = Form.useWatch('projectId', form) ?? projectId;
  const { data: activities, isLoading: actLoading } = useActivities(selectedProject);
  const selectedActivity = Form.useWatch('activityId', form);
  const activity = activities?.find((a) => a.id === selectedActivity);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ projectId, date: dayjs() });
    }
  }, [open, projectId, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) =>
      (
        await api.post('/progress', {
          projectId: v.projectId,
          activityId: v.activityId,
          date: v.date.format('YYYY-MM-DD'),
          quantity: String(v.quantity),
          location: v.location || undefined,
          manpowerCount: v.manpowerCount ?? undefined,
          machineryUsed: v.machineryUsed || undefined,
          remarks: v.remarks || undefined,
          attachmentIds: (v.photos ?? []).map((p) => p.id),
          submit: true,
        })
      ).data,
    onSuccess: () => {
      message.success('Progress entry submitted for approval');
      qc.invalidateQueries();
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title="New progress entry" okText="Submit" onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!projectId}>
          <Select showSearch optionFilterProp="label" placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px' }}>
          <Form.Item name="activityId" label="Activity" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              optionFilterProp="label"
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
          <Form.Item name="location" label="Location / chainage">
            <Input placeholder="Km 14+200 to 14+600" />
          </Form.Item>
        </div>
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
