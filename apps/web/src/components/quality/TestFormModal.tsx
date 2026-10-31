'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Segmented, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AttachmentDto, QualityTestDto, TestKind, TestResult, TestTypeDto } from '@erp/shared';
import { CALIBRATION_STATE_LABELS, TEST_RESULT_LABELS, TEST_KINDS, TEST_KIND_DEFAULTS, TEST_KIND_LABELS, comparePipeCodes, segmentLabel } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useActivities, useInstruments, usePipeNetwork, useProjects, useQaLabs, useTestTypes } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

interface FormValues {
  projectId: string;
  testTypeCode?: string;
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
  segmentIds?: string[];
  labId?: string | null;
  sentOn?: dayjs.Dayjs | null;
  labReportNo?: string;
  reportOn?: dayjs.Dayjs | null;
  labCharge?: number | null;
  instrumentId?: string | null;
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : String(v));

/** Where a new test comes from (item 137): a line of the tests due register, or a pour's cube set. */
export interface TestPrefill {
  testTypeCode?: string;
  planLineId?: string;
  pourId?: string;
  title?: string;
  location?: string;
  activityId?: string;
  specMin?: string | null;
  /** Shown above the form: "For POUR-2026-0004" */
  note?: string;
}

/** The fields a test type fills: what it is recorded as, its unit and limits. */
function typeFields(t: TestTypeDto) {
  return { kind: t.kind, unit: t.unit, specMin: t.specMin === null ? null : String(t.specMin), specMax: t.specMax === null ? null : String(t.specMax) };
}

/** Record a test (a sample taken), or (with `test`) change one. Readings are entered on the test itself. */
export function TestFormModal({ open, onClose, projectId, test, prefill }: { open: boolean; onClose: () => void; projectId?: string; test?: QualityTestDto | null; prefill?: TestPrefill | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!test;
  const fixedProject = test?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const kind = Form.useWatch('kind', form);
  const { data: types } = useTestTypes();
  const typeCode = Form.useWatch('testTypeCode', form);
  const type = types?.find((t) => t.code === typeCode) ?? null;
  const sampledOn = Form.useWatch('sampledOn', form);
  const specMin = Form.useWatch('specMin', form);
  const specMax = Form.useWatch('specMax', form);
  // A hydraulic test names the pipes it covers (item 126); a pass marks their testing done.
  const { data: network } = usePipeNetwork(open && kind === 'HYDRAULIC' ? selectedProject : undefined);
  const pipeOptions = (network?.segments ?? [])
    .filter((s) => s.scope === 'PROPOSED')
    .sort((a, b) => comparePipeCodes(a.code, b.code))
    .map((s) => ({ value: s.id, label: segmentLabel(s) }));
  const hasSpec = num(specMin) !== null || num(specMax) !== null;
  // Where the sample was tested (item 137 part 2): a lab, the day sent and its report, and the machine used.
  const { data: labs } = useQaLabs(open);
  const { data: register } = useInstruments(undefined, open);
  const labId = Form.useWatch('labId', form);
  const sentOn = Form.useWatch('sentOn', form);
  const labOptions = (labs ?? []).filter((l) => l.active || l.id === test?.labId).map((l) => ({ value: l.id, label: l.name }));
  const instrumentOptions = (register?.items ?? [])
    .filter((i) => i.id === test?.instrumentId || (i.active && (!i.projectId || i.projectId === selectedProject) && (!labId || !i.labId || i.labId === labId)))
    .map((i) => ({ value: i.id, label: i.state === 'OK' ? i.name : `${i.name} (${CALIBRATION_STATE_LABELS[i.state].toLowerCase()})` }));

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
        segmentIds: test.segments.map((x) => x.id),
        testTypeCode: test.testTypeCode ?? undefined,
        labId: test.labId,
        sentOn: test.sentOn ? dayjs(test.sentOn) : null,
        labReportNo: test.labReportNo ?? undefined,
        reportOn: test.reportOn ? dayjs(test.reportOn) : null,
        labCharge: test.labCharge === null ? null : Number(test.labCharge),
        instrumentId: test.instrumentId,
      });
    } else {
      // Cubes are the usual test, as before test types; a line of the plan or a pour names its own.
      form.setFieldsValue({ projectId, testTypeCode: 'CUBE', kind: 'CONCRETE_CUBE', sampledOn: dayjs(), unit: TEST_KIND_DEFAULTS.CONCRETE_CUBE.unit, result: 'PENDING' });
      if (prefill) form.setFieldsValue({ title: prefill.title, location: prefill.location, activityId: prefill.activityId, testTypeCode: prefill.testTypeCode });
    }
  }, [open, projectId, test, prefill, form]);

  // A prefilled test type fills its fields once the types are in; a pour's grade sets the lowest that passes.
  useEffect(() => {
    if (!open || test || !prefill?.testTypeCode || !types) return;
    const t = types.find((x) => x.code === prefill.testTypeCode);
    if (t) form.setFieldsValue({ ...typeFields(t), ...(prefill.specMin ? { specMin: prefill.specMin } : {}) });
  }, [open, test, prefill, types, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const chosen = types?.find((x) => x.code === v.testTypeCode) ?? null;
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
        ...(v.segmentIds !== undefined ? { segmentIds: v.segmentIds ?? [] } : {}),
        testTypeCode: v.testTypeCode ?? (editing ? null : undefined),
        labId: v.labId ?? null,
        sentOn: v.labId && v.sentOn ? v.sentOn.format('YYYY-MM-DD') : null,
        labReportNo: v.labId ? v.labReportNo?.trim() || null : null,
        reportOn: v.labId && v.sentOn && v.reportOn ? v.reportOn.format('YYYY-MM-DD') : null,
        labCharge: v.labId && v.labCharge != null ? v.labCharge.toFixed(2) : null,
        instrumentId: v.instrumentId ?? null,
        // A new test of a type takes the type's readings, due from the day sampled.
        ...(!editing && chosen ? { readings: chosen.readings.map((r) => ({ label: r.label, dueOn: v.sampledOn.add(r.days, 'day').format('YYYY-MM-DD') })) } : {}),
        ...(!editing && prefill?.planLineId ? { planLineId: prefill.planLineId } : {}),
        ...(!editing && prefill?.pourId ? { pourId: prefill.pourId } : {}),
      };
      return test ? (await api.patch<QualityTestDto>(`/quality/tests/${test.id}`, body)).data : (await api.post<QualityTestDto>('/quality/tests', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(editing ? `${x.testNo} updated` : `${x.testNo} recorded`);
      qc.invalidateQueries({ queryKey: ['quality'] });
    },
    meta: FAIL_NOTICE,
  });

  const plan = editing ? [] : type ? type.readings : kind ? TEST_KIND_DEFAULTS[kind].readings : [];
  const typeOptions = (types ?? []).map((t) => ({ value: t.code, label: t.method ? `${t.name} (${t.method})` : t.name }));
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={test ? `Edit ${test.testNo}` : 'Record test'} okText={editing ? 'Save' : 'Record test'} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {prefill?.note && !editing ? <Typography.Paragraph type="secondary">{prefill.note}</Typography.Paragraph> : null}
        <FormSection title="Sample">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Choose the project"
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              onChange={() => form.setFieldsValue({ activityId: undefined })}
            />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="testTypeCode" label="Test" hidden={editing && !test?.testTypeCode} rules={editing ? [] : [{ required: true, message: 'Choose the test' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Concrete cube strength…"
                options={typeOptions}
                onChange={(code: string) => {
                  const t = types?.find((x) => x.code === code);
                  if (t) form.setFieldsValue(typeFields(t));
                }}
              />
            </Form.Item>
            <Form.Item name="kind" label="Recorded as" hidden={!editing || !!test?.testTypeCode} rules={[{ required: true, message: 'Choose what it is recorded as' }]}>
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
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
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
          {kind === 'HYDRAULIC' && pipeOptions.length ? (
            <Form.Item name="segmentIds" label="Pipes tested" extra="A pass marks these pipes tested on the pipe network.">
              <Select mode="multiple" allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="P-12, P-13…" options={pipeOptions} maxTagCount="responsive" />
            </Form.Item>
          ) : null}
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
                  { value: 'PENDING', label: TEST_RESULT_LABELS.PENDING },
                  { value: 'PASS', label: TEST_RESULT_LABELS.PASS },
                  { value: 'FAIL', label: TEST_RESULT_LABELS.FAIL },
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
        <FormSection title="Lab">
          <FormGrid cols={2}>
            <Form.Item name="labId" label="Tested at" extra={labOptions.length ? undefined : 'Add the labs your samples go to in Masters › Labs.'}>
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="The site lab, an NABL lab…" options={labOptions} />
            </Form.Item>
            <Form.Item name="sentOn" label="Sent on" rules={[{ validator: async (_, d?: dayjs.Dayjs | null) => { if (d && sampledOn && d.isBefore(sampledOn, 'day')) throw new Error('Pick a day on or after the day sampled'); } }]}>
              <DatePicker style={{ width: '100%' }} disabled={!labId} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </FormGrid>
          {labId ? (
            <FormGrid cols={3}>
              <Form.Item name="reportOn" label="Report on" rules={[{ validator: async (_, d?: dayjs.Dayjs | null) => { if (d && sentOn && d.isBefore(sentOn, 'day')) throw new Error('Pick a day on or after the day sent'); } }]}>
                <DatePicker style={{ width: '100%' }} disabled={!sentOn} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item name="labReportNo" label="Lab report no.">
                <Input maxLength={60} translate="no" />
              </Form.Item>
              <Form.Item name="labCharge" label="Charge">
                <MoneyInput />
              </Form.Item>
            </FormGrid>
          ) : null}
          <Form.Item name="instrumentId" label="Tested on" extra="The machine from the calibration register, so a test on one out of calibration shows.">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="CTM, scale…" options={instrumentOptions} />
          </Form.Item>
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
