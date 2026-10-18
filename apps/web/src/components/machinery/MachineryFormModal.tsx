'use client';

import React, { useCallback, useEffect } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, EquipmentDto, MachineryLogDto } from '@erp/shared';
import { MAX_LOG_HOURS, machineryLogProblem } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivities, useProjects } from '@/lib/queries';
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

/** Log a machine's day, or (with `log`) fix a returned log and resubmit it. */
export function MachineryFormModal({ open, onClose, projectId, log }: { open: boolean; onClose: () => void; projectId?: string; log?: MachineryLogDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  const editing = !!log;
  const fixedProject = log?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const breakdown = Form.useWatch('breakdownHours', form);

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
    } else {
      form.setFieldsValue({ projectId, date: dayjs() });
    }
  }, [open, projectId, log, form]);

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
      title={log ? `${editActionLabel(log.status)} · ${log.equipmentCode}` : 'Log machinery'}
      okText={editing ? 'Resubmit for approval' : 'Submit'}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        {log?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${log.reviewedByName ?? 'approver'}`} description={log.reviewNote} />}
        <FormSection title="Machine and hours">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldValue('activityId', undefined)} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="equipmentId" label="Equipment" rules={[{ required: true, message: 'Choose the machine' }]}>
              <EquipmentSelect sortRows={hereFirst} selected={log ? { value: log.equipmentId, label: `${log.equipmentCode} - ${log.equipmentName}` } : null} />
            </Form.Item>
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
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
            <Form.Item name="dieselLitres" label="Diesel filled">
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
