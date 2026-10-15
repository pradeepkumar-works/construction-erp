'use client';

import React, { useEffect, useMemo } from 'react';
import { App, DatePicker, Form, Input, Modal, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, NcrDto, NcrSeverity } from '@erp/shared';
import { NCR_SEVERITIES, NCR_SEVERITY_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useProject, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';

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

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;

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

  const people = useMemo(() => {
    if (!project) return [];
    const list = [
      ...(project.projectManagerId ? [{ value: project.projectManagerId, label: `${project.projectManagerName} (Project Manager)` }] : []),
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
      });
    } else {
      form.setFieldsValue({
        projectId: prefill?.projectId ?? projectId,
        title: prefill?.title,
        description: prefill?.description,
        location: prefill?.location ?? undefined,
        activityId: prefill?.activityId ?? undefined,
        severity: 'MINOR',
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
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={ncr ? `Update ${ncr.ncrNo}` : 'Raise NCR'} okText={editing ? 'Save' : 'Raise NCR'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={680} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        {prefill?.source ? <Typography.Paragraph type="secondary">From {prefill.source}.</Typography.Paragraph> : null}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Select project"
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            onChange={() => form.setFieldsValue({ activityId: undefined, actionById: undefined })}
          />
        </Form.Item>
        <Form.Item name="title" label="Non-conformance" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input maxLength={200} placeholder="Honeycombing at the base of column C4" />
        </Form.Item>
        <Form.Item name="description" label="Details" rules={[{ required: true, whitespace: true, message: 'Say what is wrong and against which requirement' }]}>
          <Input.TextArea rows={3} maxLength={4000} placeholder="What is wrong, against which drawing or specification, and what must be done" />
        </Form.Item>
        <Form.Item name="severity" label="Severity">
          <Segmented options={NCR_SEVERITIES.map((s) => ({ value: s, label: NCR_SEVERITY_LABELS[s] }))} />
        </Form.Item>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="activityId" label="Activity (optional)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input maxLength={200} placeholder="Chainage, grid, floor or zone" />
          </Form.Item>
        </div>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="actionById" label="To be rectified by">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={people} placeholder="Site engineer or contractor's in-charge" />
          </Form.Item>
          <Form.Item name="dueDate" label="Rectify by">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </div>
        <Form.Item name="photos" label="Photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
