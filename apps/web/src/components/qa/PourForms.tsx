'use client';

import React, { useEffect } from 'react';
import { Alert, Form, Input, InputNumber, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { POUR_SOURCES, POUR_SOURCE_LABELS, cubeSetsFor, type PourDto, type PourSource } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivities } from '@/lib/queries';
import { DatePicker } from '@/components/common/DatePicker';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface PourForm {
  projectId: string;
  activityId: string;
  date: dayjs.Dayjs;
  location: string;
  grade: string;
  plannedVolume: number;
  source: PourSource;
  supplier?: string;
  remarks?: string;
}

const GRADES = ['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50'];

/** Plan a pour, or (with `pour`) change a planned one. */
export function PourFormModal({ open, onClose, projectId, pour, onSaved }: { open: boolean; onClose: () => void; projectId?: string; pour?: PourDto | null; onSaved?: (p: PourDto) => void }) {
  const [form] = Form.useForm<PourForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const project = Form.useWatch('projectId', form) ?? pour?.projectId ?? projectId;
  const volume = Form.useWatch('plannedVolume', form);
  const { data: activities } = useActivities(project);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      pour
        ? { projectId: pour.projectId, activityId: pour.activityId, date: dayjs(pour.date), location: pour.location, grade: pour.grade, plannedVolume: Number(pour.plannedVolume), source: pour.source, supplier: pour.supplier ?? '', remarks: pour.remarks ?? '' }
        : { projectId, date: dayjs(), source: 'RMC', grade: 'M25' },
    );
  }, [open, pour, projectId, form]);
  const save = useMutation({
    mutationFn: async (v: PourForm) => {
      const body = { activityId: v.activityId, date: v.date.format('YYYY-MM-DD'), location: v.location.trim(), grade: v.grade, plannedVolume: String(v.plannedVolume), source: v.source, supplier: v.supplier?.trim() || null, remarks: v.remarks?.trim() || null };
      return pour ? (await api.patch<PourDto>(`/qa/pours/${pour.id}`, body)).data : (await api.post<PourDto>('/qa/pours', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved(pour ? `${p.pourNo} saved` : `${p.pourNo} planned`);
      onSaved?.(p);
    },
    meta: FAIL_NOTICE,
  });
  const sets = cubeSetsFor(volume);
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={640} title={pour ? `Edit ${pour.pourNo}` : 'Plan pour'} okText={pour ? 'Save' : 'Plan pour'} onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label="Project" hidden={!!pour || !!projectId} rules={[{ required: true, message: 'Choose the project' }]}>
          <ProjectSelect allowClear={false} placeholder="Choose the project" onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="activityId" label="Activity" rules={[{ required: true, message: 'Choose the activity being poured' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} disabled={!project} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="date" label="Pour on" rules={[{ required: true, message: 'Pick the day' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="location" label="Location" rules={[{ required: true, whitespace: true, message: 'Say where, such as Block A first floor slab' }]}>
          <Input maxLength={200} placeholder="Block A, first floor slab, bays 1 to 4" />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="grade" label="Grade" rules={[{ required: true, message: 'Choose the grade' }]}>
            <Select showSearch options={GRADES.map((g) => ({ value: g, label: g }))} />
          </Form.Item>
          <Form.Item name="plannedVolume" label="Volume (m³)" rules={[{ required: true, message: 'Give the volume in m³' }]} extra={sets ? `${sets} cube set${sets === 1 ? '' : 's'} by IS 456` : undefined}>
            <InputNumber min={0.1} max={100000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="source" label="Concrete">
            <Segmented options={POUR_SOURCES.map((s) => ({ value: s, label: POUR_SOURCE_LABELS[s] }))} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="supplier" label="Supplier or plant">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input maxLength={1000} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** Record a planned pour as poured: the volume placed and the day. */
export function PouredModal({ pour, onClose }: { pour: PourDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ volume: number; date: dayjs.Dayjs; remarks?: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (!pour) return;
    form.resetFields();
    const day = dayjs(pour.date).isAfter(dayjs(), 'day') ? dayjs() : dayjs(pour.date);
    form.setFieldsValue({ volume: Number(pour.plannedVolume), date: day });
  }, [pour, form]);
  const save = useMutation({
    mutationFn: async (v: { volume: number; date: dayjs.Dayjs; remarks?: string }) => (await api.post<PourDto>(`/qa/pours/${pour!.id}/poured`, { volume: String(v.volume), date: v.date.format('YYYY-MM-DD'), remarks: v.remarks?.trim() || null })).data,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved(`${p.pourNo} recorded as poured`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!pour} onClose={onClose} form={form} layout="modal" width={480} projectDefault={false} title={pour ? `Record pour ${pour.pourNo}` : 'Record pour'} okText="Record pour" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {pour && !pour.cardPassed ? (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="The pour card has not passed. The pour is recorded and flagged in the register." />
        ) : null}
        <FormGrid cols={2}>
          <Form.Item name="volume" label="Volume poured (m³)" rules={[{ required: true, message: 'Give the volume poured' }]}>
            <InputNumber min={0.1} max={100000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="date" label="Poured on" rules={[{ required: true, message: 'Pick the day' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} placeholder="Trucks, slump, any interruption" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
