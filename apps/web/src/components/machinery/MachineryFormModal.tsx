'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AttachmentDto, EquipmentDto, MachineryLogDto } from '@erp/shared';
import { MAX_LOG_HOURS, engineLogDraft, hoursAboveEngine, machineryLogProblem } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivities, useMachineDay, useProjects } from '@/lib/queries';
import { formatQty } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { EquipmentSelect } from '@/components/common/SearchSelect';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { recordPage } from '@/components/approvals/queue';

interface FormValues {
  projectId: string;
  equipmentId: string;
  date: dayjs.Dayjs;
  hoursWorked: number;
  idleHours?: number;
  breakdownHours?: number;
  dieselLitres?: number;
  meterStart?: number;
  meterEnd?: number;
  operatorName?: string;
  activityId?: string;
  workDone?: string;
  breakdownNote?: string;
  remarks?: string;
  photos?: AttachmentDto[];
}

/** A new log for a machine and day the tracker read (Engine hours, Make the log). */
export interface MachineryPrefill {
  projectId: string | null;
  equipmentId: string;
  equipmentLabel: string;
  date: string;
}

/** The boxes the tracker's day fills (item 146), and only while no one has typed in them. */
const FROM_TRACKER = ['hoursWorked', 'idleHours', 'meterStart', 'meterEnd'] as const;

/** Log a machine's day, or (with `log`) fix a returned log and resubmit it. */
export function MachineryFormModal({ open, onClose, projectId, log, prefill }: { open: boolean; onClose: () => void; projectId?: string; log?: MachineryLogDto | null; prefill?: MachineryPrefill | null }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  const editing = !!log;
  const fixedProject = log?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const breakdown = Form.useWatch('breakdownHours', form);
  const equipmentId = Form.useWatch('equipmentId', form);
  const date = Form.useWatch('date', form);
  const worked = Form.useWatch('hoursWorked', form);
  const idle = Form.useWatch('idleHours', form);
  // What the machine's tracker read that day, for a new log (item 146).
  const day = useMachineDay(editing || !open ? undefined : equipmentId, date ? date.format('YYYY-MM-DD') : undefined).data ?? null;
  const filled = useRef<Partial<Record<(typeof FROM_TRACKER)[number], number | null>>>({});

  // Machines deployed at the chosen project first, then the rest of the fleet.
  const hereFirst = useCallback((a: EquipmentDto, b: EquipmentDto) => Number(b.projectId === selectedProject) - Number(a.projectId === selectedProject), [selectedProject]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (log) {
      const n = (v: string | null) => (v === null ? undefined : Number(v));
      form.setFieldsValue({
        projectId: log.projectId,
        equipmentId: log.equipmentId,
        date: dayjs(log.date),
        hoursWorked: Number(log.hoursWorked),
        idleHours: n(log.idleHours),
        breakdownHours: n(log.breakdownHours),
        dieselLitres: n(log.dieselLitres),
        meterStart: n(log.meterStart),
        meterEnd: n(log.meterEnd),
        operatorName: log.operatorName ?? undefined,
        activityId: log.activityId ?? undefined,
        workDone: log.workDone ?? undefined,
        breakdownNote: log.breakdownNote ?? undefined,
        remarks: log.remarks ?? undefined,
        photos: log.attachments,
      });
    } else if (prefill) {
      form.setFieldsValue({ projectId: prefill.projectId ?? projectId, equipmentId: prefill.equipmentId, date: dayjs(prefill.date) });
    } else {
      form.setFieldsValue({ projectId, date: dayjs() });
    }
    filled.current = {};
  }, [open, projectId, log, prefill, form]);

  // The tracker's day fills the hours and meter; a box someone typed in is left as it is.
  useEffect(() => {
    if (!open || editing) return;
    const draft = day ? engineLogDraft(day) : null;
    const next: Partial<FormValues> = {};
    for (const k of FROM_TRACKER) {
      const current = form.getFieldValue(k) as number | undefined | null;
      const ours = k in filled.current && filled.current[k] === (current ?? null);
      if (current !== undefined && current !== null && !ours) continue;
      const v = draft ? draft[k] : null;
      next[k] = v ?? undefined;
      filled.current[k] = v;
    }
    form.setFieldsValue(next);
  }, [day, open, editing, form]);
  const above = day ? hoursAboveEngine(Number(worked ?? 0) + Number(idle ?? 0), Number(day.engineHours)) : null;

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const s = (x: number | undefined) => (x === undefined || x === null ? (editing ? null : undefined) : String(x));
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const body = {
        equipmentId: v.equipmentId,
        date: v.date.format('YYYY-MM-DD'),
        hoursWorked: String(v.hoursWorked),
        idleHours: String(v.idleHours ?? 0),
        breakdownHours: String(v.breakdownHours ?? 0),
        dieselLitres: s(v.dieselLitres),
        meterStart: s(v.meterStart),
        meterEnd: s(v.meterEnd),
        operatorName: t(v.operatorName),
        activityId: v.activityId ?? (editing ? null : undefined),
        workDone: t(v.workDone),
        breakdownNote: t(v.breakdownNote),
        remarks: t(v.remarks),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return log ? (await api.patch(`/machinery-logs/${log.id}`, body)).data : (await api.post('/machinery-logs', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: { id: string }) => {
      notify.saved(editing ? 'Machinery log resubmitted for approval' : 'Machinery log submitted for approval', recordPage('MACHINERY', x.id));
      qc.invalidateQueries();
    },
    meta: FAIL_NOTICE,
  });

  const submit = async (v: FormValues) => {
    const problem = machineryLogProblem(v);
    // FormShell says it at the top of the form.
    if (problem) throw new Error(problem);
    return mutation.mutateAsync(v);
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      title={log ? `${editActionLabel(log.status)} · ${log.equipmentCode}` : 'New machinery log'}
      okText={editing ? 'Resubmit for approval' : 'Submit'}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        {log?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${log.reviewedByName ?? 'approver'}`} description={log.reviewNote} />}
        <FormSection title="Machine and hours">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Choose the project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} onChange={() => form.setFieldValue('activityId', undefined)} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="equipmentId" label="Equipment" rules={[{ required: true, message: 'Choose the machine' }]}>
              <EquipmentSelect
                sortRows={hereFirst}
                selected={log ? { value: log.equipmentId, label: `${log.equipmentCode} - ${log.equipmentName}` } : prefill ? { value: prefill.equipmentId, label: prefill.equipmentLabel } : null}
              />
            </Form.Item>
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={3}>
            <Form.Item name="hoursWorked" label="Hours worked" rules={[{ required: true, message: 'Enter the hours worked' }]}>
              <InputNumber style={{ width: '100%' }} min={0} max={MAX_LOG_HOURS} step={0.5} />
            </Form.Item>
            <Form.Item name="idleHours" label="Idle hours">
              <InputNumber style={{ width: '100%' }} min={0} max={MAX_LOG_HOURS} step={0.5} />
            </Form.Item>
            <Form.Item name="breakdownHours" label="Breakdown hours">
              <InputNumber style={{ width: '100%' }} min={0} max={MAX_LOG_HOURS} step={0.5} />
            </Form.Item>
          </FormGrid>
          {day ? (
            <Typography.Paragraph style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: -8 }}>
              <Typography.Text type="secondary">
                {`From the tracker: the engine ran ${formatQty(day.engineHours)} h${day.idleHours !== null ? `, ${formatQty(day.idleHours)} idle` : ''}${day.meterStart !== null ? `, meter ${formatQty(day.meterStart)} to ${formatQty(day.meterEnd ?? day.meterStart)}` : ''}. Check it and change what is not right.`}
              </Typography.Text>
              {above !== null ? (
                <span style={{ display: 'block', color: themeColor('colorWarningText') }}>{`That is ${formatQty(above)} h more than the engine ran; the approver sees it.`}</span>
              ) : null}
            </Typography.Paragraph>
          ) : null}
          {Number(breakdown) > 0 ? (
            <Form.Item name="breakdownNote" label="What broke down" rules={[{ required: true, whitespace: true, message: 'Say what broke down' }]}>
              <Input placeholder="Hydraulic hose burst; mechanic attended" maxLength={500} />
            </Form.Item>
          ) : null}
        </FormSection>
        <FormSection title="Meter, diesel and work">
          <FormGrid cols={3}>
            <Form.Item name="meterStart" label="Hour meter start">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="meterEnd" label="Hour meter end">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="dieselLitres" label="Fuel filled">
              <QuantityInput unit="L" />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="operatorName" label="Operator">
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="activityId" label="Activity">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="workDone" label="Work done">
            <Input placeholder="Excavation for drain, Ch. 2+400 to 2+520" maxLength={500} />
          </Form.Item>
        </FormSection>
        <FormSection title="Notes and photos">
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Form.Item name="photos" label="Photos (hour meter, log sheet)">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
