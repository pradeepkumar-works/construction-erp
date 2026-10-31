'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect } from 'react';
import { App, AutoComplete, Form, Input, InputNumber } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ToolboxTalkDto } from '@erp/shared';
import { TOOLBOX_TOPICS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormShell } from '@/components/form/FormShell';

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

/**
 * Record a toolbox talk (topic, who gave it, how many attended, the signed sheet), or change one. `prefill` starts a new
 * one from today's talk (its project, topic and points).
 */
export function TalkFormModal({
  open,
  onClose,
  projectId,
  talk,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  talk?: ToolboxTalkDto | null;
  prefill?: { projectId: string; topic: string; notes: string } | null;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { user } = useAuth();

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
    else
      form.setFieldsValue({
        projectId: (prefill?.projectId ?? projectId) as string,
        date: dayjs(),
        conductedBy: user?.fullName,
        durationMinutes: prefill ? 5 : 15,
        ...(prefill ? { topic: prefill.topic, notes: prefill.notes } : {}),
      });
  }, [open, talk, projectId, prefill, user, form]);

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
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={680} title={talk ? `Edit ${talk.talkNo}` : 'Record toolbox talk'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId || !!talk || !!prefill}>
          <ProjectSelect allowClear={false} placeholder="Choose the project" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="topic" label="Topic" rules={[{ required: true, whitespace: true, message: 'Enter the topic' }]}>
          <AutoComplete options={TOOLBOX_TOPICS.map((t) => ({ value: t }))} showSearch={{ filterOption: (input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} placeholder="Pick or type a topic" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
          </Form.Item>
          <Form.Item name="conductedBy" label="Given by" rules={[{ required: true, whitespace: true, message: 'Enter who gave the talk' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="attendeeCount" label="Attended" rules={[{ required: true, message: 'Enter how many attended' }]}>
            <InputNumber min={1} max={2000} precision={0} inputMode="numeric" style={{ width: '100%' }} suffix="workers" />
          </Form.Item>
          <Form.Item name="durationMinutes" label="Duration (min)">
            <InputNumber min={1} max={480} precision={0} inputMode="numeric" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="contractor" label="Contractor">
          <Input maxLength={200} placeholder="Labour contractor or subcontractor; empty for our own workers" />
        </Form.Item>
        <Form.Item name="attendees" label="Names">
          <Input.TextArea rows={2} maxLength={4000} placeholder="Or attach the signed attendance sheet" />
        </Form.Item>
        <Form.Item name="notes" label="Points covered">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        <Form.Item name="photos" label="Photo / signed sheet">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
