'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, QualityTestDto, TestKind, TestResult } from '@erp/shared';
import { TEST_KINDS, TEST_KIND_DEFAULTS, TEST_KIND_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useActivities, useProjects } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId: string;
  kind: TestKind;
  title: string;
  activityId?: string;
  location?: string;
  sampledOn: dayjs.Dayjs;
  specification?: string;
  unit?: string;
  specMin?: string | null;
  specMax?: string | null;
  result?: TestResult;
  remarks?: string;
  photos?: AttachmentDto[];
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : String(v));

/** Record a test (a sample taken), or (with `test`) change one. Readings are entered on the test itself. */
export function TestFormModal({ open, onClose, projectId, test }: { open: boolean; onClose: () => void; projectId?: string; test?: QualityTestDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!test;
  const fixedProject = test?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const kind = Form.useWatch('kind', form);
  const sampledOn = Form.useWatch('sampledOn', form);
  const specMin = Form.useWatch('specMin', form);
  const specMax = Form.useWatch('specMax', form);
  const hasSpec = num(specMin) !== null || num(specMax) !== null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (test) {
      form.setFieldsValue({
        projectId: test.projectId,
        kind: test.kind,
        title: test.title,
        activityId: test.activityId ?? undefined,
        location: test.location ?? undefined,
        sampledOn: dayjs(test.sampledOn),
        specification: test.specification ?? undefined,
        unit: test.unit ?? undefined,
        specMin: test.specMin,
        specMax: test.specMax,
        result: test.result,
        remarks: test.remarks ?? undefined,
        photos: test.attachments,
      });
    } else {
      form.setFieldsValue({ projectId, kind: 'CONCRETE_CUBE', sampledOn: dayjs(), unit: TEST_KIND_DEFAULTS.CONCRETE_CUBE.unit, result: 'PENDING' });
    }
  }, [open, projectId, test, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const body = {
        kind: v.kind,
        title: v.title.trim(),
        activityId: v.activityId ?? (editing ? null : undefined),
        location: t(v.location),
        sampledOn: v.sampledOn.format('YYYY-MM-DD'),
        specification: t(v.specification),
        unit: v.unit?.trim() ?? null,
        specMin: num(v.specMin),
        specMax: num(v.specMax),
        // Without a specification the result is as recorded; with one, the readings decide it.
        ...(num(v.specMin) === null && num(v.specMax) === null ? { result: v.result ?? 'PENDING' } : {}),
        remarks: t(v.remarks),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
      };
      return test ? (await api.patch<QualityTestDto>(`/quality/tests/${test.id}`, body)).data : (await api.post<QualityTestDto>('/quality/tests', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(editing ? `${x.testNo} updated` : `${x.testNo} recorded`);
      qc.invalidateQueries({ queryKey: ['quality'] });
    },
    meta: FAIL_NOTICE,
  });

  const plan = kind && !editing ? TEST_KIND_DEFAULTS[kind].readings : [];
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={test ? `Update ${test.testNo}` : 'Record a test'} okText={editing ? 'Save' : 'Record test'} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormSection title="Sample">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Select project"
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
              onChange={() => form.setFieldsValue({ activityId: undefined })}
            />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="kind" label="Test" rules={[{ required: true, message: 'Choose the test' }]}>
              <Select
                options={TEST_KINDS.map((k) => ({ value: k, label: TEST_KIND_LABELS[k] }))}
                onChange={(k: TestKind) => {
                  // Follow the kind's usual unit unless one was typed.
                  const prev = form.getFieldValue('unit');
                  if (!prev || TEST_KINDS.some((x) => TEST_KIND_DEFAULTS[x].unit === prev)) form.setFieldValue('unit', TEST_KIND_DEFAULTS[k].unit);
                }}
              />
            </Form.Item>
            <Form.Item name="sampledOn" label="Sampled on" rules={[{ required: true, message: 'Pick the date' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="title" label="What was sampled" rules={[{ required: true, whitespace: true, message: 'Say what was sampled' }]}>
            <Input maxLength={200} placeholder={kind === 'CONCRETE_CUBE' ? 'M25 cubes, first floor slab bays 1 to 4' : kind === 'FIELD_DENSITY' ? 'Embankment layer 4, sand replacement' : 'Fly ash bricks, lot 4'} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="activityId" label="Activity (optional)">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
            </Form.Item>
            <Form.Item name="location" label="Location">
              <Input maxLength={200} placeholder="Chainage, grid, floor or pour" />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Specification and result">
          <Form.Item name="specification" label="Specification">
            <Input maxLength={300} placeholder="Not less than 25 N/mm² at 28 days (IS 456)" />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="specMin" label="Lowest that passes">
              <InputNumber<string> stringMode style={{ width: '100%' }} min="0" placeholder="e.g. 25" />
            </Form.Item>
            <Form.Item name="specMax" label="Highest that passes">
              <InputNumber<string> stringMode style={{ width: '100%' }} min="0" />
            </Form.Item>
            <Form.Item name="unit" label="Unit">
              <UnitInput maxLength={30} />
            </Form.Item>
          </FormGrid>
          {hasSpec ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
              {kind === 'CONCRETE_CUBE' ? 'The 28-day result decides pass or fail; the 7-day one is for information.' : 'The result decides pass or fail against these limits.'}
            </Typography.Paragraph>
          ) : (
            <Form.Item name="result" label="Result" tooltip="Without limits to judge by, record the result here once known">
              <Segmented
                options={[
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'PASS', label: 'Pass' },
                  { value: 'FAIL', label: 'Fail' },
                ]}
              />
            </Form.Item>
          )}
          {plan.length > 0 && sampledOn ? (
            <Typography.Paragraph type="secondary">
              Readings: {plan.map((r) => `${r.label} on ${formatDate(sampledOn.add(r.days, 'day').format('YYYY-MM-DD'))}`).join(', ')}. Site and QA/QC are reminded when each falls due.
            </Typography.Paragraph>
          ) : null}
        </FormSection>
        <FormSection title="Notes">
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} placeholder="Lab, supplier, batch or truck number" />
          </Form.Item>
          <Form.Item name="photos" label="Photos / lab reports">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
