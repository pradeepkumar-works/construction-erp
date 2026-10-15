'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, TimePicker } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, SafetyIncidentDto, SafetyIncidentType } from '@erp/shared';
import { INJURY_TYPES, SAFETY_INCIDENT_TYPES, SAFETY_INCIDENT_TYPE_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';

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

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 16 } as const;

/** Report an incident or a near miss, or (with `incident`) change one. */
export function IncidentFormModal({ open, onClose, projectId, incident, nearMiss }: { open: boolean; onClose: () => void; projectId?: string; incident?: SafetyIncidentDto | null; nearMiss?: boolean }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
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
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title={editing ? `Change ${incident?.incidentNo}` : nearMiss ? 'Report a near miss' : 'Report an incident'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Save' : 'Report'}
      okButtonProps={{ loading: save.isPending }}
      width={720}
      destroyOnHidden
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!projectId || editing}>
          <Select showSearch optionFilterProp="label" placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <div style={grid}>
          <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Pick one' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Near miss, first aid..." options={SAFETY_INCIDENT_TYPES.map((t) => ({ value: t, label: SAFETY_INCIDENT_TYPE_LABELS[t] }))} />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
          </Form.Item>
          <Form.Item name="time" label="Time">
            <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} />
          </Form.Item>
        </div>
        <Form.Item name="location" label="Where" rules={[{ required: true, whitespace: true, message: 'Where did it happen?' }]}>
          <Input maxLength={200} placeholder="Chainage, block and floor, yard" />
        </Form.Item>
        <Form.Item name="description" label="What happened" rules={[{ required: true, whitespace: true, message: 'Describe what happened' }]}>
          <Input.TextArea rows={3} maxLength={4000} />
        </Form.Item>
        {injury ? (
          <div style={grid}>
            <Form.Item name="injuredCount" label="People hurt" initialValue={1}>
              <InputNumber min={1} max={500} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="injuredNames" label="Names" style={{ gridColumn: 'span 2' }}>
              <Input maxLength={1000} placeholder="Name (trade)" />
            </Form.Item>
            {type === 'LOST_TIME' ? (
              <Form.Item name="daysLost" label="Days off work">
                <InputNumber min={0} max={3650} style={{ width: '100%' }} />
              </Form.Item>
            ) : null}
          </div>
        ) : null}
        <Form.Item name="contractor" label="Whose workers">
          <Input maxLength={200} placeholder="Labour contractor or subcontractor" />
        </Form.Item>
        <Form.Item name="immediateAction" label="Immediate action">
          <Input.TextArea rows={2} maxLength={2000} placeholder="First aid given, area cordoned off, work stopped" />
        </Form.Item>
        {editing ? (
          <div style={grid}>
            <Form.Item name="rootCause" label="Root cause">
              <Input.TextArea rows={2} maxLength={2000} />
            </Form.Item>
            <Form.Item name="correctiveAction" label="Corrective action">
              <Input.TextArea rows={2} maxLength={2000} />
            </Form.Item>
          </div>
        ) : null}
        <Form.Item name="photos" label="Photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
