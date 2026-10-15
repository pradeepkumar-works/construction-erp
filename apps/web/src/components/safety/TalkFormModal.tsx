'use client';

import React, { useEffect } from 'react';
import { App, AutoComplete, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ToolboxTalkDto } from '@erp/shared';
import { TOOLBOX_TOPICS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  topic: string;
  conductedBy: string;
  contractor?: string;
  attendeeCount: number;
  attendees?: string;
  durationMinutes?: number | null;
  notes?: string;
  photos?: AttachmentDto[];
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 16 } as const;

/** Record a toolbox talk (topic, who gave it, how many attended, the signed sheet), or change one. */
export function TalkFormModal({ open, onClose, projectId, talk }: { open: boolean; onClose: () => void; projectId?: string; talk?: ToolboxTalkDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: projects } = useProjects();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (talk)
      form.setFieldsValue({
        projectId: talk.projectId,
        date: dayjs(talk.date),
        topic: talk.topic,
        conductedBy: talk.conductedBy,
        contractor: talk.contractor ?? undefined,
        attendeeCount: talk.attendeeCount,
        attendees: talk.attendees ?? undefined,
        durationMinutes: talk.durationMinutes,
        notes: talk.notes ?? undefined,
        photos: talk.attachments,
      });
    else form.setFieldsValue({ projectId: projectId as string, date: dayjs(), conductedBy: user?.fullName, durationMinutes: 15 });
  }, [open, talk, projectId, user, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || null;
      const body = {
        date: v.date.format('YYYY-MM-DD'),
        topic: v.topic.trim(),
        conductedBy: v.conductedBy.trim(),
        contractor: t(v.contractor),
        attendeeCount: v.attendeeCount,
        attendees: t(v.attendees),
        durationMinutes: v.durationMinutes ?? null,
        notes: t(v.notes),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
      };
      return talk ? (await api.patch<ToolboxTalkDto>(`/safety/talks/${talk.id}`, body)).data : (await api.post<ToolboxTalkDto>('/safety/talks', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(`${x.talkNo} saved`);
      qc.invalidateQueries({ queryKey: ['safety'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title={talk ? `Change ${talk.talkNo}` : 'Record a toolbox talk'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save"
      okButtonProps={{ loading: save.isPending }}
      width={680}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!projectId || !!talk}>
          <Select showSearch optionFilterProp="label" placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <Form.Item name="topic" label="Topic" rules={[{ required: true, whitespace: true, message: 'What was it about?' }]}>
          <AutoComplete options={TOOLBOX_TOPICS.map((t) => ({ value: t }))} filterOption={(input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase())} placeholder="Pick or type a topic" />
        </Form.Item>
        <div style={grid}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
          </Form.Item>
          <Form.Item name="conductedBy" label="Given by" rules={[{ required: true, whitespace: true, message: 'Who gave it?' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="attendeeCount" label="Attended" rules={[{ required: true, message: 'How many?' }]}>
            <InputNumber min={1} max={2000} style={{ width: '100%' }} suffix="workers" />
          </Form.Item>
          <Form.Item name="durationMinutes" label="Minutes">
            <InputNumber min={1} max={480} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="contractor" label="Contractor's gang">
          <Input maxLength={200} placeholder="Optional" />
        </Form.Item>
        <Form.Item name="attendees" label="Names">
          <Input.TextArea rows={2} maxLength={4000} placeholder="Optional; or attach the signed attendance sheet" />
        </Form.Item>
        <Form.Item name="notes" label="Points covered">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        <Form.Item name="photos" label="Photo / signed sheet">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
