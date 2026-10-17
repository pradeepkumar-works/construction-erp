'use client';

import React, { useEffect, useRef } from 'react';
import { App, Checkbox, DatePicker, Form, Input, Select } from 'antd';
import dayjs from 'dayjs';
import type { ProjectDetail, ProjectStatus, ProjectType } from '@erp/shared';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivityTemplates } from '@/lib/queries';
import { ClientSelect, UserSelect } from '@/components/common/SearchSelect';
import { inSentence } from '@/lib/format';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

interface FormValues {
  code: string;
  name: string;
  type: ProjectType;
  status?: ProjectStatus;
  clientId?: string | null;
  consultantName?: string;
  location?: string;
  workOrderNo?: string;
  description?: string;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  contractValue?: number | null;
  projectManagerId?: string;
  applyTemplate?: boolean;
}

/** Who can manage a project. */
const MANAGER_ROLES = ['PROJECT_MANAGER', 'MANAGEMENT', 'ADMIN'] as const;

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
  const isEdit = !!project;
  const { data: templates } = useActivityTemplates(open && !project);
  const type = Form.useWatch('type', form);
  const template = templates?.find((t) => t.projectType === type);
  // The saved project, handed to `onSaved` once the form has closed (e.g. to open it).
  const saved = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (project) {
      form.setFieldsValue({
        code: project.code,
        name: project.name,
        type: project.type,
        status: project.status,
        clientId: project.clientId,
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
        // Without a client from the master an older free-text client name is left as it is.
        ...(values.clientId ? { clientId: values.clientId } : isEdit && project?.clientId ? { clientId: null } : {}),
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
      saved.current = data.id;
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={() => {
        onClose();
        if (saved.current) onSaved?.(saved.current);
        saved.current = null;
      }}
      form={form}
      layout="drawer"
      title={isEdit ? 'Edit project' : 'New project'}
      okText={isEdit ? 'Save changes' : 'Create project'}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Project">
          <FormGrid cols={2}>
            <Form.Item name="code" label="Project code" rules={[{ required: true, whitespace: true, message: 'Enter the project code, e.g. RD-2026-01' }]}>
              <Input placeholder="RD-2026-01" />
            </Form.Item>
            <Form.Item name="name" label="Project name" rules={[{ required: true, whitespace: true, message: 'Enter the project name' }]}>
              <Input placeholder="Highway widening Km 12 to Km 28" />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={3}>
            <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Choose the type' }]}>
              <Select options={PROJECT_TYPES.map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))} />
            </Form.Item>
            <Form.Item name="projectManagerId" label="Project manager">
              <UserSelect
                roles={MANAGER_ROLES}
                allowClear
                selected={project?.projectManagerId && project.projectManagerName ? { value: project.projectManagerId, label: project.projectManagerName } : null}
              />
            </Form.Item>
          </FormGrid>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
        </FormSection>
        <FormSection title="Client and contract">
          <FormGrid cols={2}>
            <Form.Item name="clientId" label="Client" extra={!project?.clientId && project?.clientName ? `Now: ${project.clientName} (not in the client master)` : 'Add clients under Billing → Clients, or from the Contract tab.'}>
              <ClientSelect allowClear />
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
            <Form.Item name="contractValue" label="Contract value">
              <MoneyInput />
            </Form.Item>
          </FormGrid>
          {!isEdit ? (
            <Form.Item name="applyTemplate" valuePropName="checked" style={{ marginBottom: 0 }} extra="Scheduled across the start and end dates; planned quantities are filled in later. Templates are under Activity Templates.">
              <Checkbox>Add the {template ? `${template.items.length} ` : ''}standard {type ? inSentence(PROJECT_TYPE_LABELS[type as ProjectType]) : ''} activities</Checkbox>
            </Form.Item>
          ) : null}
        </FormSection>
      </Form>
    </FormShell>
  );
}
