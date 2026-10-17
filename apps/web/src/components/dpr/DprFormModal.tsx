'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, DailyReportDto, Weather } from '@erp/shared';
import { MANPOWER_CATEGORIES, WEATHER_LABELS, WEATHER_OPTIONS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAttendanceDay, useDprList, useProjects } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  weather?: Weather;
  siteCondition?: string;
  manpower?: { category: string; count: number }[];
  machinery?: { name: string; hours: number }[];
  materialReceived?: string;
  workExecuted: string;
  testsConducted?: string;
  safetyObservations?: string;
  issues?: string;
  nextDayPlan?: string;
  photos?: AttachmentDto[];
}

/** Create a DPR, or (with `entry`) edit a draft / rejected / changes-requested one and resubmit it. */
export function DprFormModal({ open, onClose, projectId, defaultProjectId, entry }: { open: boolean; onClose: () => void; projectId?: string; /** A new entry starts on this project (the header's), still changeable. */ defaultProjectId?: string; entry?: DailyReportDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;

  // New DPR: manpower comes from the day's attendance sheet until the user edits it by hand.
  const watchedProject = Form.useWatch('projectId', form);
  const watchedDate = Form.useWatch('date', form);
  const dayStr = watchedDate ? dayjs(watchedDate).format('YYYY-MM-DD') : undefined;
  const attendance = useAttendanceDay(open && !editing ? watchedProject : undefined, open && !editing ? dayStr : undefined);
  const attendanceSheet = attendance.data?.sheet ?? null;
  const [manpowerEdited, setManpowerEdited] = useState(false);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const applyAttendance = () => {
    if (!attendanceSheet) return;
    form.setFieldsValue({ manpower: attendanceSheet.manpower.map((m) => ({ ...m })) });
    setFilledFrom(attendanceSheet.id);
    setManpowerEdited(false);
  };
  useEffect(() => {
    if (!open || editing || !attendanceSheet || manpowerEdited || filledFrom === attendanceSheet.id) return;
    form.setFieldsValue({ manpower: attendanceSheet.manpower.map((m) => ({ ...m })) });
    setFilledFrom(attendanceSheet.id);
  }, [open, editing, attendanceSheet, manpowerEdited, filledFrom, form]);

  // New DPR: what the gang and machines were on the project's previous report, said so, with Clear (UX item 79). The
  // day's attendance still wins for manpower.
  const prevDay = dayStr ? dayjs(dayStr).subtract(1, 'day').format('YYYY-MM-DD') : undefined;
  const previous = useDprList({ projectId: watchedProject, to: prevDay, pageSize: 1 }, open && !editing && !!watchedProject && !!prevDay).data?.items[0];
  const [copiedFrom, setCopiedFrom] = useState<DailyReportDto | null>(null);
  const [copyCleared, setCopyCleared] = useState(false);
  useEffect(() => {
    if (!open || editing || !previous || copyCleared || attendance.isLoading || copiedFrom?.id === previous.id) return;
    const v = form.getFieldsValue(['manpower', 'machinery']) as Pick<FormValues, 'manpower' | 'machinery'>;
    const takeManpower = !attendanceSheet && !manpowerEdited && !v.manpower?.length && previous.manpower.length > 0;
    const takeMachinery = !v.machinery?.length && previous.machinery.length > 0;
    if (!takeManpower && !takeMachinery) return;
    form.setFieldsValue({
      ...(takeManpower ? { manpower: previous.manpower.map((m) => ({ ...m })) } : {}),
      ...(takeMachinery ? { machinery: previous.machinery.map((m) => ({ ...m })) } : {}),
    });
    setCopiedFrom(previous);
  }, [open, editing, previous, copyCleared, attendance.isLoading, attendanceSheet, manpowerEdited, copiedFrom, form]);
  const clearCopied = () => {
    form.setFieldsValue({ ...(filledFrom ? {} : { manpower: [] }), machinery: [] });
    setCopiedFrom(null);
    setCopyCleared(true);
    setManpowerEdited(true);
  };

  useEffect(() => {
    if (!open) return;
    setManpowerEdited(false);
    setFilledFrom(null);
    setCopiedFrom(null);
    setCopyCleared(false);
    form.resetFields();
    if (entry) {
      form.setFieldsValue({
        projectId: entry.projectId,
        date: dayjs(entry.date),
        weather: entry.weather ?? undefined,
        siteCondition: entry.siteCondition ?? undefined,
        manpower: entry.manpower,
        machinery: entry.machinery,
        materialReceived: entry.materialReceived ?? undefined,
        workExecuted: entry.workExecuted,
        testsConducted: entry.testsConducted ?? undefined,
        safetyObservations: entry.safetyObservations ?? undefined,
        issues: entry.issues ?? undefined,
        nextDayPlan: entry.nextDayPlan ?? undefined,
        photos: entry.attachments,
      });
    } else {
      form.setFieldsValue({
        projectId: projectId ?? defaultProjectId,
        date: dayjs(),
        weather: 'SUNNY',
        siteCondition: 'Workable',
        manpower: [],
        machinery: [],
      });
    }
  }, [open, projectId, defaultProjectId, entry, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const blank = editing ? null : undefined;
      const body = {
        date: v.date.format('YYYY-MM-DD'),
        weather: v.weather ?? blank,
        siteCondition: v.siteCondition || blank,
        manpower: (v.manpower ?? []).filter((m) => m && m.category),
        machinery: (v.machinery ?? []).filter((m) => m && m.name),
        materialReceived: v.materialReceived || blank,
        workExecuted: v.workExecuted,
        testsConducted: v.testsConducted || blank,
        safetyObservations: v.safetyObservations || blank,
        issues: v.issues || blank,
        nextDayPlan: v.nextDayPlan || blank,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return entry ? (await api.patch(`/dpr/${entry.id}`, body)).data : (await api.post('/dpr', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: () => {
      message.success(editing ? 'DPR resubmitted for approval' : 'DPR submitted for approval');
      qc.invalidateQueries();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={entry ? `${editActionLabel(entry.status)} · DPR ${dayjs(entry.date).format('DD MMM YYYY')}` : 'New Daily Progress Report'}
      okText={editing ? 'Resubmit DPR' : 'Submit DPR'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : `dpr:${projectId ?? 'any'}`}
      width={820}
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(changed) => {
          if ('manpower' in changed) setManpowerEdited(true);
        }}
      >
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <FormSection title="The day">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date of the report' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="weather" label="Weather">
              <Select options={WEATHER_OPTIONS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }))} />
            </Form.Item>
            <Form.Item name="siteCondition" label="Site condition">
              <Input placeholder="Workable / Waterlogged" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="workExecuted" label="Work executed" rules={[{ required: true, whitespace: true, message: 'Say what work was done today' }]}>
            <Input.TextArea rows={3} placeholder="Summary of work done today" />
          </Form.Item>
        </FormSection>

        <FormSection
          title="Manpower and machinery"
          extra={
            !editing && attendanceSheet ? (
              filledFrom === attendanceSheet.id && !manpowerEdited ? (
                <Typography.Text type="success" style={{ fontSize: 12 }}>
                  From attendance: {attendanceSheet.totalWorkers} workers recorded by {attendanceSheet.recordedByName}
                </Typography.Text>
              ) : (
                <Typography.Link style={{ fontSize: 12 }} onClick={applyAttendance}>
                  Use attendance ({attendanceSheet.totalWorkers} workers)
                </Typography.Link>
              )
            ) : !editing && attendance.data && !attendanceSheet ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                No attendance recorded for this day yet
              </Typography.Text>
            ) : null
          }
        >
          {copiedFrom && !editing ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title={`Copied from the DPR of ${formatDate(copiedFrom.date)}: check the numbers for today`}
              action={
                <Typography.Link onClick={clearCopied} style={{ fontSize: 12 }}>
                  Clear
                </Typography.Link>
              }
            />
          ) : null}
          <FormGrid cols={2}>
            <Form.Item label="Manpower" required={false}>
              <LineTable
                name="manpower"
                label="Manpower"
                addText="Add category"
                newLine={() => ({ count: 1 })}
                columns={[
                  {
                    key: 'category',
                    title: 'Category',
                    render: (f) => (
                      <Form.Item name={[f.name, 'category']} noStyle rules={[{ required: true, message: '' }]}>
                        <Select style={{ width: '100%', minWidth: 120 }} placeholder="Category" options={MANPOWER_CATEGORIES.map((c) => ({ value: c, label: c }))} />
                      </Form.Item>
                    ),
                  },
                  {
                    key: 'count',
                    title: 'Nos',
                    width: 90,
                    align: 'right',
                    render: (f) => (
                      <Form.Item name={[f.name, 'count']} noStyle rules={[{ required: true, message: '' }]}>
                        <InputNumber min={0} precision={0} placeholder="Nos" inputMode="numeric" style={{ width: '100%' }} />
                      </Form.Item>
                    ),
                  },
                ]}
              />
            </Form.Item>
            <Form.Item label="Machinery">
              <LineTable
                name="machinery"
                label="Machinery"
                addText="Add machine"
                newLine={() => ({ hours: 8 })}
                columns={[
                  {
                    key: 'name',
                    title: 'Equipment',
                    render: (f) => (
                      <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, message: '' }]}>
                        <Input placeholder="Equipment" style={{ minWidth: 120 }} />
                      </Form.Item>
                    ),
                  },
                  {
                    key: 'hours',
                    title: 'Hours',
                    width: 90,
                    align: 'right',
                    render: (f) => (
                      <Form.Item name={[f.name, 'hours']} noStyle rules={[{ required: true, message: '' }]}>
                        <InputNumber min={0} max={24} placeholder="Hrs" inputMode="decimal" style={{ width: '100%' }} />
                      </Form.Item>
                    ),
                  },
                ]}
              />
            </Form.Item>
          </FormGrid>
        </FormSection>

        <FormSection title="Notes">
          <FormGrid cols={2}>
            <Form.Item name="materialReceived" label="Material received">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="testsConducted" label="Tests conducted">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="safetyObservations" label="Safety observations">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="issues" label="Issues / hindrances">
              <Input.TextArea rows={2} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="nextDayPlan" label="Next day plan">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="photos" label="Site photos" extra="Photos of the work done today; they go with the report.">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
