'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Select, TimePicker } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, SafetyIncidentDto, SafetyIncidentType } from '@erp/shared';
import { INJURY_TYPES, SAFETY_INCIDENT_TYPES, SAFETY_INCIDENT_TYPE_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId: string;
  type: SafetyIncidentType;
  date: dayjs.Dayjs;
  time?: dayjs.Dayjs | null;
  location: string;
  description: string;
  injuredCount?: number | null;
  injuredNames?: string;
  contractor?: string;
  immediateAction?: string;
  rootCause?: string;
  correctiveAction?: string;
  daysLost?: number | null;
  photos?: AttachmentDto[];
}

/** Report an incident or a near miss, or (with `incident`) change one. */
export function IncidentFormModal({ open, onClose, projectId, incident, nearMiss }: { open: boolean; onClose: () => void; projectId?: string; incident?: SafetyIncidentDto | null; nearMiss?: boolean }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const type = Form.useWatch('type', form);
  const injury = !!type && INJURY_TYPES.includes(type);
  const editing = !!incident;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (incident)
      form.setFieldsValue({
        projectId: incident.projectId,
        type: incident.type,
        date: dayjs(incident.date),
        time: incident.time ? dayjs(`2000-01-01T${incident.time}`) : null,
        location: incident.location,
        description: incident.description,
        injuredCount: incident.injuredCount || null,
        injuredNames: incident.injuredNames ?? undefined,
        contractor: incident.contractor ?? undefined,
        immediateAction: incident.immediateAction ?? undefined,
        rootCause: incident.rootCause ?? undefined,
        correctiveAction: incident.correctiveAction ?? undefined,
        daysLost: incident.daysLost,
        photos: incident.attachments,
      });
    else form.setFieldsValue({ projectId: projectId as string, type: nearMiss ? 'NEAR_MISS' : undefined, date: dayjs(), time: dayjs() });
  }, [open, incident, projectId, nearMiss, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || null;
      const hurt = INJURY_TYPES.includes(v.type);
      const body = {
        type: v.type,
        date: v.date.format('YYYY-MM-DD'),
        time: v.time ? v.time.format('HH:mm') : null,
        location: v.location.trim(),
        description: v.description.trim(),
        injuredCount: hurt ? (v.injuredCount ?? 1) : 0,
        injuredNames: hurt ? t(v.injuredNames) : null,
        contractor: t(v.contractor),
        immediateAction: t(v.immediateAction),
        rootCause: t(v.rootCause),
        correctiveAction: t(v.correctiveAction),
        daysLost: v.type === 'LOST_TIME' ? (v.daysLost ?? null) : null,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
      };
      return incident
        ? (await api.patch<SafetyIncidentDto>(`/safety/incidents/${incident.id}`, body)).data
        : (await api.post<SafetyIncidentDto>('/safety/incidents', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(editing ? `${x.incidentNo} saved` : `${x.incidentNo} reported`);
      qc.invalidateQueries({ queryKey: ['safety'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      title={editing ? `Edit ${incident?.incidentNo}` : nearMiss ? 'Report near miss' : 'Report incident'}
      okText={editing ? 'Save' : 'Report'}
      draftKey={editing ? undefined : `${nearMiss ? 'near-miss' : 'incident'}:${projectId ?? 'any'}`}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <FormSection title="The incident">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId || editing}>
            <ProjectSelect allowClear={false} placeholder="Choose the project" style={{ width: '100%' }} />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Choose the type' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Near miss, first aid…" options={SAFETY_INCIDENT_TYPES.map((t) => ({ value: t, label: SAFETY_INCIDENT_TYPE_LABELS[t] }))} />
            </Form.Item>
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
            </Form.Item>
            <Form.Item name="time" label="Time">
              <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="location" label="Where" rules={[{ required: true, whitespace: true, message: 'Enter where it happened' }]}>
            <Input maxLength={200} placeholder="Chainage, block and floor, yard" />
          </Form.Item>
          <Form.Item name="description" label="What happened" rules={[{ required: true, whitespace: true, message: 'Describe what happened' }]}>
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
          <Form.Item name="photos" label="Photos">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
        <FormSection title="People and action">
          {injury ? (
            <>
              <FormGrid cols={2}>
                <Form.Item name="injuredCount" label="People hurt" initialValue={1}>
                  <InputNumber min={1} max={500} precision={0} inputMode="numeric" style={{ width: '100%' }} />
                </Form.Item>
                {type === 'LOST_TIME' ? (
                  <Form.Item name="daysLost" label="Days off work">
                    <InputNumber min={0} max={3650} precision={0} inputMode="numeric" style={{ width: '100%' }} />
                  </Form.Item>
                ) : null}
              </FormGrid>
              <Form.Item name="injuredNames" label="Names">
                <Input maxLength={1000} placeholder="Name (trade)" />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="contractor" label="Whose workers">
            <Input maxLength={200} placeholder="Labour contractor or subcontractor" />
          </Form.Item>
          <Form.Item name="immediateAction" label="Immediate action">
            <Input.TextArea rows={2} maxLength={2000} placeholder="First aid given, area cordoned off, work stopped" />
          </Form.Item>
          {editing ? (
            <FormGrid cols={2}>
              <Form.Item name="rootCause" label="Root cause">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
              <Form.Item name="correctiveAction" label="Corrective action">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </FormGrid>
          ) : null}
        </FormSection>
      </Form>
    </FormShell>
  );
}
