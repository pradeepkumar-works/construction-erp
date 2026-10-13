'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { ProjectDetail, ProjectStatus, ProjectType } from '@erp/shared';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivityTemplates, useUsers } from '@/lib/queries';

interface FormValues {
  code: string;
  name: string;
  type: ProjectType;
  status?: ProjectStatus;
  clientName?: string;
  consultantName?: string;
  location?: string;
  workOrderNo?: string;
  description?: string;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  contractValue?: number | null;
  projectManagerId?: string;
  applyTemplate?: boolean;
}

export function ProjectFormModal({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project?: ProjectDetail | null;
  onSaved?: (id: string) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: users } = useUsers();
  const isEdit = !!project;
  const { data: templates } = useActivityTemplates(open && !project);
  const type = Form.useWatch('type', form);
  const template = templates?.find((t) => t.projectType === type);

  useEffect(() => {
    if (!open) return;
    if (project) {
      form.setFieldsValue({
        code: project.code,
        name: project.name,
        type: project.type,
        status: project.status,
        clientName: project.clientName ?? undefined,
        consultantName: project.consultantName ?? undefined,
        location: project.location ?? undefined,
        workOrderNo: project.workOrderNo ?? undefined,
        description: project.description ?? undefined,
        dates: [project.startDate ? dayjs(project.startDate) : null, project.endDate ? dayjs(project.endDate) : null],
        contractValue: project.contractValue ? Number(project.contractValue) : null,
        projectManagerId: project.projectManagerId ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ status: 'PLANNED', type: 'ROAD', applyTemplate: true });
    }
  }, [open, project, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = {
        code: values.code.trim(),
        name: values.name.trim(),
        type: values.type,
        status: values.status,
        clientName: values.clientName || undefined,
        consultantName: values.consultantName || undefined,
        location: values.location || undefined,
        workOrderNo: values.workOrderNo || undefined,
        description: values.description || undefined,
        startDate: values.dates?.[0] ? values.dates[0].format('YYYY-MM-DD') : undefined,
        endDate: values.dates?.[1] ? values.dates[1].format('YYYY-MM-DD') : undefined,
        contractValue: values.contractValue !== null && values.contractValue !== undefined ? String(values.contractValue) : undefined,
        projectManagerId: values.projectManagerId || undefined,
        ...(isEdit ? {} : { applyTemplate: !!values.applyTemplate }),
      };
      if (isEdit && project) return (await api.patch<ProjectDetail>(`/projects/${project.id}`, body)).data;
      return (await api.post<ProjectDetail>('/projects', body)).data;
    },
    onSuccess: (data) => {
      message.success(isEdit ? 'Project updated' : 'Project created');
      qc.invalidateQueries();
      onClose();
      onSaved?.(data.id);
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const managers = (users ?? []).filter((u) => u.isActive && ['PROJECT_MANAGER', 'MANAGEMENT', 'ADMIN'].includes(u.roleKey));

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit project' : 'New project'}
      okText={isEdit ? 'Save changes' : 'Create project'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      width={720}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
          <Form.Item name="code" label="Project code" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="RD-2026-01" />
          </Form.Item>
          <Form.Item name="name" label="Project name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Highway widening Km 12 to Km 28" />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Required' }]}>
            <Select options={PROJECT_TYPES.map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))} />
          </Form.Item>
          <Form.Item name="projectManagerId" label="Project manager">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select" options={managers.map((u) => ({ value: u.id, label: `${u.fullName} (${u.roleName})` }))} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="clientName" label="Client">
            <Input />
          </Form.Item>
          <Form.Item name="consultantName" label="Consultant / PMC">
            <Input />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input />
          </Form.Item>
          <Form.Item name="workOrderNo" label="Work order no.">
            <Input />
          </Form.Item>
          <Form.Item name="dates" label="Start / end date">
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD MMM YYYY" allowEmpty={[true, true]} />
          </Form.Item>
          <Form.Item name="contractValue" label="Contract value (₹)">
            <InputNumber<number> style={{ width: '100%' }} min={0} formatter={(v) => (v === undefined || v === null ? '' : Number(v).toLocaleString('en-IN'))} parser={(v) => Number((v ?? '').replace(/[^\d.]/g, ''))} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        {!isEdit ? (
          <Form.Item name="applyTemplate" valuePropName="checked" style={{ marginBottom: 0 }} extra="Scheduled across the start and end dates; planned quantities are filled in later. Templates are under Activity Templates.">
            <Checkbox>Add the {template ? `${template.items.length} ` : ''}standard {type ? PROJECT_TYPE_LABELS[type as ProjectType].toLowerCase() : ''} activities</Checkbox>
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
