'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { ActivityDto, ProjectMemberDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useBoq, useChecklists } from '@/lib/queries';
import { UnitInput } from '@/components/common/UnitInput';

interface FormValues {
  name: string;
  boqItemId?: string | null;
  unit: string;
  plannedQty: number;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  responsibleId?: string | null;
  checklistTemplateId?: string | null;
  holdPoint?: boolean;
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
      };
      if (isEdit && activity) return (await api.patch(`/projects/${projectId}/activities/${activity.id}`, body)).data;
      return (await api.post(`/projects/${projectId}/activities`, body)).data;
    },
    onSuccess: () => {
      message.success(isEdit ? 'Activity updated' : 'Activity added');
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const onBoqChange = (id?: string) => {
    const item = boq?.find((b) => b.id === id);
    if (item) {
      form.setFieldsValue({ unit: item.unit });
      if (!form.getFieldValue('name')) form.setFieldsValue({ name: item.description.slice(0, 80) });
      if (!form.getFieldValue('plannedQty')) form.setFieldsValue({ plannedQty: Number(item.revisedQty ?? item.originalQty) });
    }
  };

  return (
    <Modal open={open} title={isEdit ? 'Edit activity' : 'Add activity'} okText={isEdit ? 'Save' : 'Add activity'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="boqItemId" label="Linked BOQ item">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Optional - pick a BOQ item to link" onChange={onBoqChange} options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} - ${b.description}` }))} />
        </Form.Item>
        <Form.Item name="name" label="Activity name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="GSB laying" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0 16px' }}>
          <Form.Item name="unit" label="Unit" rules={[{ required: true, message: 'Required' }]}>
            <UnitInput placeholder="Cum" />
          </Form.Item>
          <Form.Item name="plannedQty" label="Planned qty" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="dates" label="Planned start / end">
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD MMM YYYY" allowEmpty={[true, true]} />
          </Form.Item>
        </div>
        <Form.Item name="responsibleId" label="Responsible">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Project member" options={members.map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px', alignItems: 'end' }}>
          <Form.Item name="checklistTemplateId" label="Inspection checklist">
            <Select allowClear placeholder={checklists?.length ? 'None' : 'No checklist yet (Inspections > Checklists)'} options={(checklists ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="holdPoint" valuePropName="checked" tooltip="Progress of this activity is approved only after a passed inspection at the same location">
            <Checkbox>Hold point</Checkbox>
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
