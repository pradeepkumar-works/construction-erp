'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, MachineryLogDto } from '@erp/shared';
import { MAX_LOG_HOURS, MAX_PAGE_SIZE, machineryLogProblem } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useEquipment, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';

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

const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' } as const;

/** Log a machine's day, or (with `log`) fix a returned log and resubmit it. */
export function MachineryFormModal({ open, onClose, projectId, log }: { open: boolean; onClose: () => void; projectId?: string; log?: MachineryLogDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!log;
  const fixedProject = log?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const { data: equipment, isLoading: eqLoading } = useEquipment({ pageSize: MAX_PAGE_SIZE }, open);
  const breakdown = Form.useWatch('breakdownHours', form);

  // Machines deployed at the chosen project first, then the rest of the fleet.
  const equipmentOptions = useMemo(() => {
    const all = equipment?.items ?? [];
    const here = all.filter((e) => e.projectId === selectedProject);
    const other = all.filter((e) => e.projectId !== selectedProject);
    const opt = (e: (typeof all)[number]) => ({ value: e.id, label: `${e.code} · ${e.name}` });
    return [
      ...(here.length ? [{ label: 'At this project', options: here.map(opt) }] : []),
      ...(other.length ? [{ label: here.length ? 'Elsewhere / yard' : 'All equipment', options: other.map(opt) }] : []),
    ];
  }, [equipment, selectedProject]);

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
    onSuccess: () => {
      message.success(editing ? 'Machinery log resubmitted for approval' : 'Machinery log submitted for approval');
      qc.invalidateQueries();
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const onFinish = (v: FormValues) => {
    const problem = machineryLogProblem(v);
    if (problem) {
      message.error(problem);
      return;
    }
    mutation.mutate(v);
  };

  return (
    <Modal
      open={open}
      title={log ? `${editActionLabel(log.status)} · ${log.equipmentCode}` : 'Log machinery'}
      okText={editing ? 'Resubmit for approval' : 'Submit'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      width={680}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ marginTop: 8 }}>
        {log?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${log.reviewedByName ?? 'approver'}`} description={log.reviewNote} />}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px' }}>
          <Form.Item name="equipmentId" label="Equipment" rules={[{ required: true, message: 'Required' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} loading={eqLoading} placeholder="Select machine" options={equipmentOptions} />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </div>
        <div style={grid3}>
          <Form.Item name="hoursWorked" label="Hours worked" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} max={MAX_LOG_HOURS} step={0.5} />
          </Form.Item>
          <Form.Item name="idleHours" label="Idle hours">
            <InputNumber style={{ width: '100%' }} min={0} max={MAX_LOG_HOURS} step={0.5} />
          </Form.Item>
          <Form.Item name="breakdownHours" label="Breakdown hours">
            <InputNumber style={{ width: '100%' }} min={0} max={MAX_LOG_HOURS} step={0.5} />
          </Form.Item>
        </div>
        {Number(breakdown) > 0 ? (
          <Form.Item name="breakdownNote" label="What broke down" rules={[{ required: true, whitespace: true, message: 'Required when there are breakdown hours' }]}>
            <Input placeholder="Hydraulic hose burst; mechanic attended" maxLength={500} />
          </Form.Item>
        ) : null}
        <div style={grid3}>
          <Form.Item name="meterStart" label="Hour meter start">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="meterEnd" label="Hour meter end">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="dieselLitres" label="Diesel filled (L)">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="operatorName" label="Operator">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="activityId" label="Activity">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
        </div>
        <Form.Item name="workDone" label="Work done">
          <Input placeholder="Excavation for drain, Ch. 2+400 to 2+520" maxLength={500} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="photos" label="Photos (hour meter, log sheet)">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
