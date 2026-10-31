'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect } from 'react';
import { App, Checkbox, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, WorkPermitDto, WorkPermitType } from '@erp/shared';
import { PERMIT_MAX_DAYS, PERMIT_PRECAUTIONS, WORK_PERMIT_TYPES, WORK_PERMIT_TYPE_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId: string;
  type: WorkPermitType;
  location: string;
  description: string;
  contractor?: string;
  workerCount?: number | null;
  workers?: string;
  validity: [dayjs.Dayjs, dayjs.Dayjs];
  precautions?: string[];
  otherPrecautions?: string;
  photos?: AttachmentDto[];
}

/** Standard precautions of the type ticked as boxes; anything else typed one per line. */
export const splitPrecautions = (type: WorkPermitType, list: string[]) => {
  const standard = PERMIT_PRECAUTIONS[type];
  return { ticked: list.filter((p) => standard.includes(p)), other: list.filter((p) => !standard.includes(p)).join('\n') };
};
export const joinPrecautions = (ticked: string[] | undefined, other: string | undefined) => [
  ...(ticked ?? []),
  ...(other ?? '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean),
];

/** Ask for a permit to work, or change a request before it is issued. */
export function PermitFormModal({ open, onClose, projectId, permit }: { open: boolean; onClose: () => void; projectId?: string; permit?: WorkPermitDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const type = Form.useWatch('type', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (permit) {
      const p = splitPrecautions(permit.type, permit.precautions);
      form.setFieldsValue({
        projectId: permit.projectId,
        type: permit.type,
        location: permit.location,
        description: permit.description,
        contractor: permit.contractor ?? undefined,
        workerCount: permit.workerCount,
        workers: permit.workers ?? undefined,
        validity: [dayjs(permit.validFrom), dayjs(permit.validTo)],
        precautions: p.ticked,
        otherPrecautions: p.other,
        photos: permit.attachments,
      });
    } else {
      const start = dayjs().add(1, 'hour').startOf('hour');
      form.setFieldsValue({ projectId: projectId as string, validity: [start, start.hour(18).isAfter(start) ? start.hour(18) : start.add(8, 'hour')] });
    }
  }, [open, permit, projectId, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || null;
      const body = {
        type: v.type,
        location: v.location.trim(),
        description: v.description.trim(),
        contractor: t(v.contractor),
        workerCount: v.workerCount ?? null,
        workers: t(v.workers),
        validFrom: v.validity[0].toISOString(),
        validTo: v.validity[1].toISOString(),
        precautions: joinPrecautions(v.precautions, v.otherPrecautions),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
      };
      return permit ? (await api.patch<WorkPermitDto>(`/safety/permits/${permit.id}`, body)).data : (await api.post<WorkPermitDto>('/safety/permits', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(permit ? `${x.permitNo} saved` : `${x.permitNo} requested`);
      qc.invalidateQueries({ queryKey: ['safety'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={permit ? `Edit ${permit.permitNo}` : 'Request permit to work'} okText={permit ? 'Save' : 'Request permit'} onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormSection title="Permit">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId || !!permit}>
            <ProjectSelect allowClear={false} placeholder="Choose the project" style={{ width: '100%' }} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="type" label="Work" rules={[{ required: true, message: 'Pick the kind of work' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Hot work, height…" options={WORK_PERMIT_TYPES.map((t) => ({ value: t, label: WORK_PERMIT_TYPE_LABELS[t] }))} onChange={() => form.setFieldsValue({ precautions: [] })} />
            </Form.Item>
            <Form.Item name="location" label="Where" rules={[{ required: true, whitespace: true, message: 'Where is the work?' }]}>
              <Input maxLength={200} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="description" label="The work" rules={[{ required: true, whitespace: true, message: 'What will be done?' }]}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Form.Item
            name="validity"
            label={`Valid (at most ${PERMIT_MAX_DAYS} days)`}
            rules={[
              { required: true, message: 'From when to when?' },
              {
                validator: (_, v?: [dayjs.Dayjs, dayjs.Dayjs]) =>
                  !v || v[1].diff(v[0], 'minute') <= PERMIT_MAX_DAYS * 24 * 60 ? Promise.resolve() : Promise.reject(new Error(`At most ${PERMIT_MAX_DAYS} days; take a new permit for longer work`)),
              },
            ]}
          >
            <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD MMM YYYY HH:mm" style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
        </FormSection>
        <FormSection title="Crew">
          <FormGrid cols={2}>
            <Form.Item name="contractor" label="Contractor">
              <Input maxLength={200} placeholder="Optional" />
            </Form.Item>
            <Form.Item name="workerCount" label="Workers">
              <InputNumber min={1} max={500} precision={0} inputMode="numeric" style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="workers" label="Names">
            <Input maxLength={2000} placeholder="Optional" />
          </Form.Item>
        </FormSection>
        <FormSection title="Precautions">
          {type ? (
            <Form.Item name="precautions" label="Precautions in place">
              <Checkbox.Group style={{ display: 'grid', gap: 4 }} options={PERMIT_PRECAUTIONS[type].map((p) => ({ value: p, label: p }))} />
            </Form.Item>
          ) : (
            <Typography.Paragraph type="secondary">Pick the kind of work to see its precautions.</Typography.Paragraph>
          )}
          <Form.Item name="otherPrecautions" label="Other precautions">
            <Input.TextArea rows={2} maxLength={2000} placeholder="One per line" />
          </Form.Item>
          <Form.Item name="photos" label="Photos / drawings">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
