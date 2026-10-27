'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import type { ActivityDto, ProjectMemberDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useActivities, useBoq, useChecklists, useStructure } from '@/lib/queries';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';

interface FormValues {
  name: string;
  boqItemId?: string | null;
  unit: string;
  plannedQty: number;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  responsibleId?: string | null;
  checklistTemplateId?: string | null;
  holdPoint?: boolean;
  workElementId?: string | null;
  parentActivityId?: string | null;
  weightPct?: number | null;
}

export function ActivityFormModal({
  open,
  onClose,
  projectId,
  activity,
  members,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  activity?: ActivityDto | null;
  members: ProjectMemberDto[];
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: boq } = useBoq(projectId);
  const { data: checklists } = useChecklists();
  const { data: structure } = useStructure(open ? projectId : undefined);
  const { data: activities } = useActivities(open ? projectId : undefined);
  const isEdit = !!activity;

  useEffect(() => {
    if (!open) return;
    if (activity) {
      form.setFieldsValue({
        name: activity.name,
        boqItemId: activity.boqItemId,
        unit: activity.unit,
        plannedQty: Number(activity.plannedQty),
        dates: [activity.plannedStart ? dayjs(activity.plannedStart) : null, activity.plannedEnd ? dayjs(activity.plannedEnd) : null],
        responsibleId: activity.responsibleId,
        checklistTemplateId: activity.checklistTemplateId,
        holdPoint: activity.holdPoint,
        workElementId: activity.workElementId,
        parentActivityId: activity.parentActivityId,
        weightPct: activity.weightPct !== null ? Number(activity.weightPct) : null,
      });
    } else {
      form.resetFields();
    }
  }, [open, activity, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        name: v.name.trim(),
        boqItemId: v.boqItemId || null,
        unit: v.unit.trim(),
        plannedQty: String(v.plannedQty),
        plannedStart: v.dates?.[0] ? v.dates[0].format('YYYY-MM-DD') : null,
        plannedEnd: v.dates?.[1] ? v.dates[1].format('YYYY-MM-DD') : null,
        responsibleId: v.responsibleId || null,
        checklistTemplateId: v.checklistTemplateId || null,
        holdPoint: !!v.holdPoint,
        workElementId: v.workElementId || null,
        parentActivityId: v.parentActivityId || null,
        weightPct: v.weightPct !== null && v.weightPct !== undefined ? String(v.weightPct) : null,
      };
      if (isEdit && activity) return (await api.patch(`/projects/${projectId}/activities/${activity.id}`, body)).data;
      return (await api.post(`/projects/${projectId}/activities`, body)).data;
    },
    onSuccess: () => {
      message.success(isEdit ? 'Activity updated' : 'Activity added');
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: FAIL_NOTICE,
  });

  const onBoqChange = (id?: string) => {
    const item = boq?.find((b) => b.id === id);
    if (item) {
      form.setFieldsValue({ unit: item.unit });
      if (!form.getFieldValue('name')) form.setFieldsValue({ name: item.description.slice(0, 80) });
      if (!form.getFieldValue('plannedQty')) form.setFieldsValue({ plannedQty: Number(item.revisedQty ?? item.originalQty) });
    }
  };

  const unit = Form.useWatch('unit', form);
  const parentId = Form.useWatch('parentActivityId', form);
  // A sub-activity's parent is a top-level activity with no progress of its own; an activity that has parts cannot become one.
  const parents = (activities ?? []).filter((a) => !a.parentActivityId && a.id !== activity?.id && (a.isSummary || Number(a.executedQty) === 0));
  const canBePart = !activity?.isSummary;

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={isEdit ? 'Edit activity' : 'New activity'} okText="Save" onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="boqItemId" label="Linked BOQ item">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Optional - pick a BOQ item to link" onChange={onBoqChange} options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} - ${b.description}` }))} />
        </Form.Item>
        <Form.Item name="name" label="Activity name" rules={[{ required: true, whitespace: true, message: 'Name the activity, e.g. GSB laying' }]}>
          <Input placeholder="GSB laying" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="unit" label="Unit" rules={[{ required: true, whitespace: true, message: 'Enter the unit, e.g. Cum' }]}>
            <UnitInput placeholder="Cum" />
          </Form.Item>
          <Form.Item name="plannedQty" label="Planned qty" rules={[{ required: true, message: 'Enter the planned quantity' }]}>
            <QuantityInput unit={unit} />
          </Form.Item>
          <Form.Item name="dates" label="Planned start / end">
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD MMM YYYY" allowEmpty={[true, true]} />
          </Form.Item>
          <Form.Item name="responsibleId" label="Responsible">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Project member" options={members.map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` }))} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="workElementId" label="Component" tooltip={parentId ? 'A sub-activity sits in its activity’s component' : 'Where the activity sits in the work breakdown'}>
            <Select
              allowClear
              disabled={!!parentId}
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={structure?.elements.length ? 'None' : 'No breakdown yet (Structure tab)'}
              options={(structure?.elements ?? []).map((e) => ({ value: e.id, label: `${e.code} ${e.name}` }))}
            />
          </Form.Item>
          <Form.Item name="parentActivityId" label="Part of activity" tooltip="An RCC item is often reported as its reinforcement, shuttering and concrete. Progress goes against the parts, and the activity shows them weighted.">
            <Select
              allowClear
              disabled={!canBePart}
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={canBePart ? 'None (top level)' : 'Has parts of its own'}
              options={parents.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
          <Form.Item name="weightPct" label="Weight" tooltip="Share of its activity or component. Left empty, it shares what the others leave by BOQ value.">
            <InputNumber min={0} max={100} step={1} suffix="%" style={{ width: '100%' }} placeholder="Auto" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="checklistTemplateId" label="Inspection checklist">
            <Select allowClear placeholder={checklists?.length ? 'None' : 'No checklist yet (Inspections > Checklists)'} options={(checklists ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="holdPoint" valuePropName="checked" style={{ alignSelf: 'end' }} tooltip="Progress of this activity is approved only after a passed inspection at the same location">
            <Checkbox>Hold point</Checkbox>
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}
