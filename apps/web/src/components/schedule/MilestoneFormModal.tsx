'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import type { MilestoneDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';

interface FormValues {
  name: string;
  dueDate: dayjs.Dayjs;
  achievedOn?: dayjs.Dayjs | null;
  note?: string;
}

/** Add or edit a milestone; `achieving` opens it to record the date it was reached. */
export function MilestoneFormModal({ open, onClose, projectId, milestone, achieving }: { open: boolean; onClose: () => void; projectId: string; milestone?: MilestoneDto | null; achieving?: boolean }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isEdit = !!milestone;

  useEffect(() => {
    if (!open) return;
    if (milestone)
      form.setFieldsValue({
        name: milestone.name,
        dueDate: dayjs(milestone.dueDate),
        achievedOn: milestone.achievedOn ? dayjs(milestone.achievedOn) : achieving ? dayjs() : null,
        note: milestone.note ?? undefined,
      });
    else form.resetFields();
  }, [open, milestone, achieving, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = { name: v.name.trim(), dueDate: v.dueDate.format('YYYY-MM-DD'), achievedOn: v.achievedOn ? v.achievedOn.format('YYYY-MM-DD') : null, note: v.note?.trim() || null };
      if (milestone) return (await api.patch<MilestoneDto>(`/projects/${projectId}/milestones/${milestone.id}`, body)).data;
      return (await api.post<MilestoneDto>(`/projects/${projectId}/milestones`, body)).data;
    },
    onSuccess: (m) => {
      message.success(m.achievedOn && !milestone?.achievedOn ? `${m.name} marked achieved` : isEdit ? 'Milestone saved' : 'Milestone added');
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={achieving ? 'Mark milestone achieved' : isEdit ? 'Edit milestone' : 'Add a milestone'} okText={achieving ? 'Mark achieved' : 'Save'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="name" label="Milestone" rules={[{ required: true, min: 2, message: 'Name the milestone' }]}>
          <Input placeholder="Km 12 to Km 20 handed over" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="dueDate" label="Due on" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="achievedOn" label="Achieved on" tooltip="Leave empty until the milestone is reached">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Contract clause, who certifies it" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
