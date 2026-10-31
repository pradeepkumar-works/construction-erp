'use client';

import React, { useEffect, useMemo } from 'react';
import { App, Checkbox, Form, Input, Segmented, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AttachmentDto, NcrDto, NcrSeverity } from '@erp/shared';
import { NCR_SEVERITIES, NCR_SEVERITY_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useActivities, useMasterList, useProject, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId: string;
  title: string;
  description: string;
  location?: string;
  severity: NcrSeverity;
  activityId?: string;
  actionById?: string;
  dueDate?: dayjs.Dayjs | null;
  photos?: AttachmentDto[];
  category?: string | null;
  raisedByClient?: boolean;
}

/** A simple list's entries as Select options by code (item 137 part 2), keeping a switched-off entry a record still has. */
export function useMasterOptions(slug: string, current?: string | null, enabled = true) {
  const { data } = useMasterList(slug, false, enabled);
  const entries = data?.entries ?? [];
  const options = entries.filter((e) => e.isActive || e.code === current).map((e) => ({ value: e.code, label: e.name }));
  const nameOf = (code: string | null | undefined) => (code ? (entries.find((e) => e.code === code)?.name ?? code) : null);
  return { options, nameOf };
}

/** An NCR raised from a failed test or inspection starts from it. */
export interface NcrPrefill {
  projectId: string;
  title?: string;
  description?: string;
  location?: string | null;
  activityId?: string | null;
  qualityTestId?: string;
  inspectionId?: string;
  /** "TST-2026-0004" or "INS-2026-0003", shown in the form */
  source?: string;
}

/** Raise a non-conformance report, or (with `ncr`) change one that is not closed. */
export function NcrFormModal({ open, onClose, projectId, ncr, prefill, onSaved }: { open: boolean; onClose: () => void; projectId?: string; ncr?: NcrDto | null; prefill?: NcrPrefill | null; onSaved?: (x: NcrDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!ncr;
  const fixedProject = ncr?.projectId ?? prefill?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const { data: project } = useProject(selectedProject);
  const categories = useMasterOptions('ncr-category', ncr?.category, open);

  const people = useMemo(() => {
    if (!project) return [];
    const list = [
      ...(project.projectManagerId ? [{ value: project.projectManagerId, label: `${project.projectManagerName} (project manager)` }] : []),
      ...project.members.filter((m) => m.userId !== project.projectManagerId).map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` })),
    ];
    if (ncr?.actionById && !list.some((o) => o.value === ncr.actionById)) list.push({ value: ncr.actionById, label: ncr.actionByName ?? 'Current' });
    return list;
  }, [project, ncr]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (ncr) {
      form.setFieldsValue({
        projectId: ncr.projectId,
        title: ncr.title,
        description: ncr.description,
        location: ncr.location ?? undefined,
        severity: ncr.severity,
        activityId: ncr.activityId ?? undefined,
        actionById: ncr.actionById ?? undefined,
        dueDate: ncr.dueDate ? dayjs(ncr.dueDate) : null,
        photos: ncr.attachments,
        category: ncr.category,
        raisedByClient: ncr.raisedByClient,
      });
    } else {
      form.setFieldsValue({
        projectId: prefill?.projectId ?? projectId,
        title: prefill?.title,
        description: prefill?.description,
        location: prefill?.location ?? undefined,
        activityId: prefill?.activityId ?? undefined,
        severity: 'MINOR',
        raisedByClient: false,
        dueDate: dayjs().add(7, 'day'),
      });
    }
  }, [open, projectId, ncr, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        title: v.title.trim(),
        description: v.description.trim(),
        location: v.location?.trim() || (editing ? null : undefined),
        severity: v.severity,
        activityId: v.activityId ?? (editing ? null : undefined),
        actionById: v.actionById ?? (editing ? null : undefined),
        dueDate: v.dueDate ? v.dueDate.format('YYYY-MM-DD') : null,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        category: v.category ?? null,
        raisedByClient: !!v.raisedByClient,
      };
      return ncr
        ? (await api.patch<NcrDto>(`/quality/ncrs/${ncr.id}`, body)).data
        : (await api.post<NcrDto>('/quality/ncrs', { projectId: v.projectId, qualityTestId: prefill?.qualityTestId, inspectionId: prefill?.inspectionId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(editing ? `${x.ncrNo} updated` : `${x.ncrNo} raised`);
      qc.invalidateQueries({ queryKey: ['quality'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      onSaved?.(x);
    },
    meta: FAIL_NOTICE,
  });

  // A new NCR keeps its draft per test or inspection it is raised from, or per project.
  const draftKey = editing ? undefined : `ncr:${prefill?.qualityTestId ?? prefill?.inspectionId ?? fixedProject ?? 'any'}`;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={680}
      title={ncr ? `Edit ${ncr.ncrNo}` : 'New NCR'}
      okText={editing ? 'Save' : 'Save NCR'}
      draftKey={draftKey}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        {prefill?.source ? <Typography.Paragraph type="secondary">From {prefill.source}.</Typography.Paragraph> : null}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Choose the project"
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
            onChange={() => form.setFieldsValue({ activityId: undefined, actionById: undefined })}
          />
        </Form.Item>
        <Form.Item name="title" label="Non-conformance" rules={[{ required: true, whitespace: true, message: 'Say what does not conform' }]}>
          <Input maxLength={200} placeholder="Honeycombing at the base of column C4" />
        </Form.Item>
        <Form.Item name="description" label="Details" rules={[{ required: true, whitespace: true, message: 'Say what is wrong and against which requirement' }]}>
          <Input.TextArea rows={3} maxLength={4000} placeholder="What is wrong, against which drawing or specification, and what must be done" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="severity" label="Severity">
            <Segmented options={NCR_SEVERITIES.map((s) => ({ value: s, label: NCR_SEVERITY_LABELS[s] }))} />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Workmanship, material…" options={categories.options} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="raisedByClient" valuePropName="checked">
          <Checkbox>Raised by the client or their consultant</Checkbox>
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="activityId" label="Activity (optional)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input maxLength={200} placeholder="Chainage, grid, floor or zone" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="actionById" label="Action by">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={people} placeholder="Site engineer or contractor's in-charge" />
          </Form.Item>
          <Form.Item name="dueDate" label="Due">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="photos" label="Photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
