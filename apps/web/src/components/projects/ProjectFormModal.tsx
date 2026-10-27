'use client';

import React, { useEffect, useRef } from 'react';
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Select, Typography } from 'antd';
import { AimOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { ContractModel, ProjectDetail, ProjectStatus, ProjectType } from '@erp/shared';
import { CONTRACT_MODELS, CONTRACT_MODEL_LABELS, DEFAULT_SITE_RADIUS_M, PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivityTemplates } from '@/lib/queries';
import { ClientSelect, UserSelect } from '@/components/common/SearchSelect';
import { inSentence } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { currentPosition } from '@/components/staff/staffUi';

interface FormValues {
  code: string;
  name: string;
  type: ProjectType;
  status?: ProjectStatus;
  contractModel?: ContractModel;
  clientId?: string | null;
  consultantName?: string;
  location?: string;
  workOrderNo?: string;
  description?: string;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  contractValue?: number | null;
  projectManagerId?: string;
  applyTemplate?: boolean;
  /** Attendance extras (v5 item 97): where the site is, for GPS check-in */
  siteLat?: number | null;
  siteLng?: number | null;
  siteRadiusM?: number | null;
  siteCheckInStrict?: boolean;
}

/** Who can manage a project. */
const MANAGER_ROLES = ['PROJECT_MANAGER', 'MANAGEMENT', 'ADMIN'] as const;

export function ProjectFormModal({
  open,
  onClose,
  project,
  onSaved,
  initialType,
}: {
  open: boolean;
  onClose: () => void;
  project?: ProjectDetail | null;
  onSaved?: (id: string) => void;
  /** A new project's type to start with, e.g. a central store from Central stores (v6 item 106) */
  initialType?: ProjectType;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
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
        contractModel: project.contractModel,
        clientId: project.clientId,
        consultantName: project.consultantName ?? undefined,
        location: project.location ?? undefined,
        workOrderNo: project.workOrderNo ?? undefined,
        description: project.description ?? undefined,
        dates: [project.startDate ? dayjs(project.startDate) : null, project.endDate ? dayjs(project.endDate) : null],
        contractValue: project.contractValue ? Number(project.contractValue) : null,
        projectManagerId: project.projectManagerId ?? undefined,
        siteLat: project.siteLat === null ? null : Number(project.siteLat),
        siteLng: project.siteLng === null ? null : Number(project.siteLng),
        siteRadiusM: project.siteRadiusM,
        siteCheckInStrict: project.siteCheckInStrict,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ status: initialType === 'STORE' ? 'ACTIVE' : 'PLANNED', type: initialType ?? 'ROAD', applyTemplate: initialType !== 'STORE' });
    }
  }, [open, project, form, initialType]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = {
        code: values.code.trim(),
        name: values.name.trim(),
        type: values.type,
        status: values.status,
        contractModel: values.contractModel,
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
        ...(isEdit ? {} : { applyTemplate: !!values.applyTemplate && values.type !== 'STORE' }),
        siteLat: values.siteLat ?? (isEdit ? null : undefined),
        siteLng: values.siteLng ?? (isEdit ? null : undefined),
        siteRadiusM: values.siteRadiusM ?? (isEdit ? null : undefined),
        siteCheckInStrict: !!values.siteCheckInStrict,
      };
      if (isEdit && project) return (await api.patch<ProjectDetail>(`/projects/${project.id}`, body)).data;
      return (await api.post<ProjectDetail>('/projects', body)).data;
    },
    onSuccess: (data) => {
      notify.saved(isEdit ? `${data.name} updated` : `${data.name} created`, `/projects/${data.id}`);
      qc.invalidateQueries();
      saved.current = data.id;
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={() => {
        onClose();
        const id = saved.current;
        saved.current = null;
        if (id && onSaved) afterFormLeaves(() => onSaved(id));
      }}
      form={form}
      layout="drawer"
      title={isEdit ? (project?.type === 'STORE' ? 'Edit store' : 'Edit project') : initialType === 'STORE' ? 'New central store' : 'New project'}
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
            <Form.Item name="contractModel" label="Contract type" tooltip="Item rate pays measured BOQ quantities. Lump sum and EPC pay in stages; their components are weighed by the billing breakup.">
              <Select options={CONTRACT_MODELS.map((m) => ({ value: m, label: CONTRACT_MODEL_LABELS[m] }))} placeholder="Item rate" />
            </Form.Item>
          </FormGrid>
          {!isEdit && type !== 'STORE' ? (
            <Form.Item name="applyTemplate" valuePropName="checked" style={{ marginBottom: 0 }} extra="Scheduled across the start and end dates; planned quantities are filled in later. Templates are under Activity templates.">
              <Checkbox>Add the {template ? `${template.items.length} ` : ''}standard {type ? inSentence(PROJECT_TYPE_LABELS[type as ProjectType]) : ''} activities</Checkbox>
            </Form.Item>
          ) : null}
        </FormSection>
        <FormSection title="Site location for check-in">
          <Typography.Paragraph type="secondary">Staff check-ins record where the phone is; one further from the site than the radius is flagged.</Typography.Paragraph>
          <FormGrid cols={3}>
            <Form.Item
              name="siteLat"
              label="Latitude"
              dependencies={['siteLng']}
              rules={[{ validator: (_, v) => (v == null && form.getFieldValue('siteLng') != null ? Promise.reject(new Error('Enter the latitude too, or clear the longitude')) : Promise.resolve()) }]}
            >
              <InputNumber style={{ width: '100%' }} min={-90} max={90} precision={6} step={0.0001} placeholder="20.296100" />
            </Form.Item>
            <Form.Item
              name="siteLng"
              label="Longitude"
              dependencies={['siteLat']}
              rules={[{ validator: (_, v) => (v == null && form.getFieldValue('siteLat') != null ? Promise.reject(new Error('Enter the longitude too, or clear the latitude')) : Promise.resolve()) }]}
            >
              <InputNumber style={{ width: '100%' }} min={-180} max={180} precision={6} step={0.0001} placeholder="85.824500" />
            </Form.Item>
            <Form.Item name="siteRadiusM" label="Radius" extra={`Default ${DEFAULT_SITE_RADIUS_M} m`}>
              <InputNumber style={{ width: '100%' }} min={25} max={10000} step={50} precision={0} suffix="m" placeholder={String(DEFAULT_SITE_RADIUS_M)} />
            </Form.Item>
          </FormGrid>
          <Button
            icon={<AimOutlined />}
            style={{ marginBottom: 16 }}
            onClick={async () => {
              const at = await currentPosition();
              if (!at) {
                message.warning('Could not get your location. Allow location for this site in the browser, or type the coordinates.');
                return;
              }
              form.setFieldsValue({ siteLat: at.lat, siteLng: at.lng });
              message.success(`Location set, accurate to about ${at.accuracyM} m`);
            }}
          >
            Use my location
          </Button>
          <Form.Item
            name="siteCheckInStrict"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
            dependencies={['siteLat']}
            rules={[{ validator: (_, v) => (v && form.getFieldValue('siteLat') == null ? Promise.reject(new Error('Set the site location first')) : Promise.resolve()) }]}
            extra="The site manager can still mark anyone in the staff register."
          >
            <Checkbox>Refuse a check-in from outside the radius</Checkbox>
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
