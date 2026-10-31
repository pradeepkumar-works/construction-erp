'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AutoComplete, Button, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AiDraftDto, AttachmentDto, DailyReportDto, DprBuiltInKey, DprFormDef, Weather } from '@erp/shared';
import { STANDARD_DPR_FORM, WEATHER_LABELS, WEATHER_OPTIONS, dprLabel, dprMissing, dprRequires, dprSectionFields, dprShows, ownFieldsOf } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAttendanceDay, useDpr, useDprList, useDprWorkOptions } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { aiFlagItem, draftDate } from '@/components/ai/drafts';
import { themeFontSize } from '@/lib/theme';
import { recordPage } from '@/components/approvals/queue';
import { DprLinesField, copiedLine, followNorms, lineValues, linesBody, type DprLineValues } from './DprLinesField';
import { OwnFieldItems, extraBody } from './OwnFields';

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
  /** The work done, line by line (item 127) */
  lines?: DprLineValues[];
  /** The day's fields of the company's own (item 134 part 2), by key */
  extra?: Record<string, unknown>;
}

/** Create a DPR, or (with `entry`) edit a draft / rejected / changes-requested one and resubmit it. */
export function DprFormModal({ open, onClose, projectId, defaultProjectId, entry, prefill }: { open: boolean; onClose: () => void; projectId?: string; /** A new entry starts on this project (the header's), still changeable. */ defaultProjectId?: string; entry?: DailyReportDto | null; /** Filled in by Ask Nirmaan from rough notes (AI item 71) */ prefill?: AiDraftDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;
  const draft = entry ? null : prefill;
  const now = Form.useWatch([], { form, preserve: true }) as Partial<FormValues> | undefined;

  // New DPR: manpower comes from the day's attendance sheet until the user edits it by hand.
  const watchedProject = Form.useWatch('projectId', form);
  const watchedDate = Form.useWatch('date', form);
  const dayStr = watchedDate ? dayjs(watchedDate).format('YYYY-MM-DD') : undefined;
  const attendance = useAttendanceDay(open && !editing ? watchedProject : undefined, open && !editing ? dayStr : undefined);
  const options = useDprWorkOptions(open ? watchedProject : undefined, dayStr).data;
  const headCount = Form.useWatch('manpower', form) as FormValues['manpower'];
  // An entry opened from a list has no lines yet: they load before the form can save them.
  const full = useDpr(open && entry && !entry.lines ? entry.id : undefined).data;
  const withLines = entry?.lines ? entry : full;
  const linesReady = !editing || !!withLines;
  // The project type's form (item 134 part 2): a new report takes the type's latest, an edit keeps its own.
  const formDto = editing ? (withLines?.form ?? entry?.form) : options?.form;
  const def: DprFormDef = formDto?.def ?? STANDARD_DPR_FORM;
  const shows = (key: DprBuiltInKey) => dprShows(def, key, { progressFromDpr: options?.progressFromDpr });
  const field = (key: DprBuiltInKey) => ({
    label: dprLabel(def, key),
    rules: dprRequires(def, key) && key !== 'photos' ? [{ required: true, whitespace: true, message: dprMissing(def, key) }] : undefined,
  });
  // The edit's lines go in once they are known: with the entry (opened from its page) or when the full report loads. The
  // reset below fills them too, as it empties the form after this effect has run.
  const linesFor = useRef<string | null>(null);
  const withLinesNow = useRef(withLines);
  useEffect(() => {
    withLinesNow.current = withLines;
    if (!open || !withLines || linesFor.current === withLines.id) return;
    form.setFieldsValue({ lines: (withLines.lines ?? []).map(lineValues) });
    linesFor.current = withLines.id;
  }, [open, withLines, form]);
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
  const previousFull = useDpr(open && !editing && previous && previous.lineCount > 0 ? previous.id : undefined).data;
  const watchedLines = Form.useWatch('lines', { form, preserve: true }) as DprLineValues[] | undefined;
  const copyLines = () => {
    if (!previousFull?.lines) return;
    form.setFieldsValue({ lines: [...(watchedLines ?? []).filter((l) => l?.activityId), ...previousFull.lines.map(copiedLine)] });
  };
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
    // Manpower the user dictated stays; otherwise the attendance sheet fills it as usual.
    setManpowerEdited(!entry && !!prefill?.values.manpower);
    setFilledFrom(null);
    setCopiedFrom(null);
    setCopyCleared(false);
    linesFor.current = null;
    form.resetFields();
    if (entry) {
      const known = withLinesNow.current;
      if (known?.id === entry.id) {
        form.setFieldsValue({ lines: (known.lines ?? []).map(lineValues) });
        linesFor.current = known.id;
      }
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
        extra: { ...entry.extra },
      });
    } else {
      form.setFieldsValue({
        projectId: projectId ?? defaultProjectId,
        date: dayjs(),
        weather: 'SUNNY',
        siteCondition: 'Workable',
        manpower: [],
        machinery: [],
        lines: [],
        extra: {},
      });
      if (prefill) {
        const v = prefill.values as Partial<Omit<FormValues, 'date'>> & { date?: string };
        form.setFieldsValue({
          projectId: prefill.projectId,
          date: draftDate(v.date) ?? dayjs(),
          weather: v.weather,
          siteCondition: v.siteCondition,
          ...(v.manpower ? { manpower: v.manpower } : {}),
          machinery: v.machinery ?? [],
          materialReceived: v.materialReceived,
          workExecuted: v.workExecuted,
          testsConducted: v.testsConducted,
          safetyObservations: v.safetyObservations,
          issues: v.issues,
          nextDayPlan: v.nextDayPlan,
          extra: v.extra ?? {},
        });
      }
    }
  }, [open, projectId, defaultProjectId, entry, prefill, form]);

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
        workExecuted: v.workExecuted?.trim() ?? '',
        // On an edit the lines are the complete list, so they are sent only once they have loaded.
        ...(linesReady ? { lines: linesBody(v.lines) } : {}),
        testsConducted: v.testsConducted || blank,
        safetyObservations: v.safetyObservations || blank,
        issues: v.issues || blank,
        nextDayPlan: v.nextDayPlan || blank,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        extra: extraBody(v.extra),
        // A new report says the form version it was filled on; an edit keeps the report's own.
        ...(editing ? {} : { formId: options?.form.id ?? undefined }),
        submit: true,
      };
      return entry ? (await api.patch(`/dpr/${entry.id}`, body)).data : (await api.post('/dpr', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: { id: string }) => {
      notify.saved(editing ? 'DPR resubmitted for approval' : 'DPR submitted for approval', recordPage('DPR', x.id));
      qc.invalidateQueries();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={entry ? `${editActionLabel(entry.status)} · DPR ${dayjs(entry.date).format('DD MMM YYYY')}` : 'New daily report'}
      okText={editing ? 'Resubmit for approval' : 'Submit for approval'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : `dpr:${projectId ?? 'any'}`}
      aiDraft={draft}
      width={980}
      allValues
      okDisabled={!linesReady}
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(changed) => {
          if ('manpower' in changed) setManpowerEdited(true);
          followNorms(form, changed, options);
        }}
      >
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <FormSection title="The day">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <ProjectSelect allowClear={false} placeholder="Choose the project" style={{ width: '100%' }} />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date of the report' }]} {...aiFlagItem(draft, 'date', watchedDate)}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            {dprSectionFields(def, 'DAY').map((key) =>
              key === 'weather' ? (
                <Form.Item key={key} name="weather" {...field(key)}>
                  <Select options={WEATHER_OPTIONS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }))} />
                </Form.Item>
              ) : (
                <Form.Item key={key} name="siteCondition" {...field(key)}>
                  <Input placeholder="Workable / Waterlogged" />
                </Form.Item>
              ),
            )}
            <OwnFieldItems fields={ownFieldsOf(def, 'DAY')} path={['extra']} />
          </FormGrid>
        </FormSection>

        <FormSection
          title="Work done"
          extra={
            !editing && shows('lines') && previousFull?.lines?.length ? (
              <Button type="link" size="small" onClick={copyLines} style={{ padding: 0, fontSize: themeFontSize('fontSizeSM') }}>
                Copy {previousFull.lines.length} lines from {formatDate(previousFull.date)}
              </Button>
            ) : null
          }
        >
          {shows('lines') ? (
            <>
              <Typography.Paragraph type="secondary">One line for each activity worked on: where and how much today, and what else the form asks for each. Activities planned for this week come first.</Typography.Paragraph>
              <DprLinesField options={options} headCount={headCount} def={def} />
            </>
          ) : null}
          <Form.Item
            name="workExecuted"
            label={watchedLines?.some((l) => l?.activityId) ? 'Other work and notes' : 'Work done today'}
            extra={watchedLines?.some((l) => l?.activityId) ? 'Left empty, it is written from the lines.' : undefined}
            style={{ marginTop: 16 }}
            dependencies={['lines']}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, v: string | undefined) =>
                  v?.trim() || ((getFieldValue('lines') ?? []) as DprLineValues[]).some((l) => l?.activityId) ? Promise.resolve() : Promise.reject(new Error('Say what work was done today, or add a work line')),
              }),
            ]}
            {...aiFlagItem(draft, 'workExecuted', now?.workExecuted)}
          >
            <Input.TextArea rows={3} placeholder="Summary of work done today" />
          </Form.Item>
        </FormSection>

        {shows('manpower') || shows('machinery') ? (
          <FormSection
            title="Labour and machinery"
            extra={
              !editing && attendanceSheet ? (
                filledFrom === attendanceSheet.id && !manpowerEdited ? (
                  <Typography.Text type="success" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    From attendance: {attendanceSheet.totalWorkers} workers recorded by {attendanceSheet.recordedByName}
                  </Typography.Text>
                ) : (
                  <Button type="link" size="small" onClick={applyAttendance} style={{ padding: 0, fontSize: themeFontSize('fontSizeSM') }}>
                    Use attendance ({attendanceSheet.totalWorkers} workers)
                  </Button>
                )
              ) : !editing && attendance.data && !attendanceSheet ? (
                <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
                  <Button type="link" size="small" onClick={clearCopied} style={{ padding: 0, fontSize: themeFontSize('fontSizeSM') }}>
                    Clear
                  </Button>
                }
              />
            ) : null}
            <FormGrid cols={2}>
              {shows('manpower') ? (
                <Form.Item label={dprLabel(def, 'manpower')} required={dprRequires(def, 'manpower')}>
                  <LineTable
                    name="manpower"
                    label="Labour"
                    addText="Add category"
                    newLine={() => ({ count: 1 })}
                    columns={[
                      {
                        key: 'category',
                        title: 'Trade',
                        render: (f) => (
                          <Form.Item name={[f.name, 'category']} noStyle rules={[{ required: true, message: 'Choose the trade' }]}>
                            <Select style={{ width: '100%', minWidth: 120 }} placeholder="Trade" aria-label={`Trade ${f.name + 1}`} options={def.lines.crewCategories.map((c) => ({ value: c, label: c }))} />
                          </Form.Item>
                        ),
                      },
                      {
                        key: 'count',
                        title: 'Workers',
                        width: 90,
                        align: 'right',
                        render: (f) => (
                          <Form.Item name={[f.name, 'count']} noStyle rules={[{ required: true, message: 'Enter the number of workers' }]}>
                            <InputNumber min={0} precision={0} placeholder="Workers" inputMode="numeric" aria-label={`Workers of trade ${f.name + 1}`} style={{ width: '100%' }} />
                          </Form.Item>
                        ),
                      },
                    ]}
                  />
                </Form.Item>
              ) : null}
              {shows('machinery') ? (
                <Form.Item label={dprLabel(def, 'machinery')} required={dprRequires(def, 'machinery')}>
                  <LineTable
                    name="machinery"
                    label="Machinery"
                    addText="Add machine"
                    newLine={() => ({ hours: 8 })}
                    columns={[
                      {
                        key: 'name',
                        title: 'Machine',
                        render: (f) => (
                          <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, message: 'Enter the machine' }]}>
                            <AutoComplete placeholder="Machine" aria-label={`Machine ${f.name + 1}`} options={def.lines.machineNames.map((m) => ({ value: m }))} style={{ width: '100%', minWidth: 120 }} />
                          </Form.Item>
                        ),
                      },
                      {
                        key: 'hours',
                        title: 'Hours',
                        width: 90,
                        align: 'right',
                        render: (f) => (
                          <Form.Item name={[f.name, 'hours']} noStyle rules={[{ required: true, message: 'Enter the hours' }]}>
                            <InputNumber min={0} max={24} placeholder="Hours" inputMode="decimal" aria-label={`Hours of machine ${f.name + 1}`} style={{ width: '100%' }} />
                          </Form.Item>
                        ),
                      },
                    ]}
                  />
                </Form.Item>
              ) : null}
            </FormGrid>
          </FormSection>
        ) : null}

        <FormSection title="Notes">
          <FormGrid cols={2}>
            {dprSectionFields(def, 'NOTES')
              .filter((key) => key !== 'photos')
              .map((key) => (
                <Form.Item key={key} name={key} {...field(key)} {...aiFlagItem(draft, key, now?.[key as keyof FormValues] as string | undefined)}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              ))}
          </FormGrid>
          {shows('photos') ? (
            <Form.Item
              name="photos"
              label={dprLabel(def, 'photos')}
              required={def.minPhotos > 0}
              extra={def.minPhotos ? `At least ${def.minPhotos} photo${def.minPhotos === 1 ? '' : 's'} of the work done today; they go with the report.` : 'Photos of the work done today; they go with the report.'}
              rules={
                def.minPhotos
                  ? [
                      {
                        validator: (_, v: AttachmentDto[] | undefined) =>
                          (v?.length ?? 0) + (watchedLines ?? []).reduce((n, l) => n + (l?.photos?.length ?? 0), 0) >= def.minPhotos
                            ? Promise.resolve()
                            : Promise.reject(new Error(def.minPhotos === 1 ? 'Add a site photo' : `Add at least ${def.minPhotos} site photos`)),
                      },
                    ]
                  : undefined
              }
            >
              <PhotoUpload max={Math.max(6, def.minPhotos)} />
            </Form.Item>
          ) : null}
        </FormSection>
      </Form>
    </FormShell>
  );
}
