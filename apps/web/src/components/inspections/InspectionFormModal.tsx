'use client';

import React, { useEffect } from 'react';
import { Alert, App, DatePicker, Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, InspectionDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useChecklists, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { themeFontSize } from '@/lib/theme';

interface FormValues {
  projectId: string;
  activityId: string;
  date: dayjs.Dayjs;
  location: string;
  checklistTemplateId?: string | null;
  remarks?: string;
  photos?: AttachmentDto[];
}

/** Request an inspection of an activity at a location, or (with `inspection`) change a returned request and request it again. */
export function InspectionFormModal({ open, onClose, projectId, inspection }: { open: boolean; onClose: () => void; projectId?: string; inspection?: InspectionDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const { data: checklists } = useChecklists();
  const editing = !!inspection;
  const fixedProject = inspection?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const activityId = Form.useWatch('activityId', form);
  const templateId = Form.useWatch('checklistTemplateId', form);
  const activity = activities?.find((a) => a.id === activityId);
  const template = checklists?.find((c) => c.id === templateId);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (inspection) {
      form.setFieldsValue({
        projectId: inspection.projectId,
        activityId: inspection.activityId,
        date: dayjs(inspection.date),
        location: inspection.location,
        checklistTemplateId: checklists?.find((c) => c.name === inspection.checklistName)?.id ?? null,
        remarks: inspection.remarks ?? undefined,
        photos: inspection.attachments,
      });
    } else {
      form.setFieldsValue({ projectId, date: dayjs() });
    }
    // checklists only name the current checklist when editing; loading them later must not reset the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, inspection, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body: Record<string, unknown> = {
        activityId: v.activityId,
        date: v.date.format('YYYY-MM-DD'),
        location: v.location.trim(),
        remarks: v.remarks?.trim() || (editing ? null : undefined),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      // Only a changed checklist starts the points afresh on an edit.
      const before = checklists?.find((c) => c.name === inspection?.checklistName)?.id ?? null;
      if (!editing || (v.checklistTemplateId ?? null) !== before) body.checklistTemplateId = v.checklistTemplateId ?? null;
      return inspection ? (await api.patch(`/inspections/${inspection.id}`, body)).data : (await api.post('/inspections', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: InspectionDto) => {
      message.success(`${x.inspectionNo} ${editing ? 'requested again' : 'requested'}`);
      qc.invalidateQueries();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title={inspection ? `${editActionLabel(inspection.status)} · ${inspection.inspectionNo}` : 'Request inspection'}
      okText={editing ? 'Request again' : 'Request inspection'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : `inspection:${projectId ?? 'any'}`}
    >
      <Form form={form} layout="vertical">
        {inspection?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Note from ${inspection.reviewedByName ?? 'the inspector'}`} description={inspection.reviewNote} />}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldsValue({ activityId: undefined })} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="activityId" label="Activity" rules={[{ required: true, message: 'Choose the activity' }]} extra={activity?.holdPoint ? 'Hold point: its progress is approved after this passes.' : undefined}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Select activity"
              disabled={!selectedProject}
              options={(activities ?? []).map((a) => ({ value: a.id, label: a.holdPoint ? `${a.name} (hold point)` : a.name }))}
              onChange={(id) => form.setFieldValue('checklistTemplateId', activities?.find((a) => a.id === id)?.checklistTemplateId ?? null)}
            />
          </Form.Item>
          <Form.Item name="date" label="Ready on" rules={[{ required: true, message: 'Pick the date it is ready' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="location" label="Location" rules={[{ required: true, whitespace: true, message: 'Say where, e.g. the chainage, grid or floor' }]}>
          <Input maxLength={200} placeholder="Chainage, grid, floor or zone, e.g. First floor slab, bays 1 to 4" />
        </Form.Item>
        <Form.Item name="checklistTemplateId" label="Checklist" extra={template ? `${template.items.length} points: ${template.items.slice(0, 3).join('; ')}${template.items.length > 3 ? '; …' : ''}` : 'Without a checklist the inspector passes or fails it with a note.'}>
          <Select allowClear placeholder="No checklist" options={(checklists ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} placeholder="What is ready, and anything the inspector should know" />
        </Form.Item>
        <Form.Item name="photos" label="Photos">
          <PhotoUpload />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), margin: 0 }}>
          QA/QC is told at once. They check each point and pass it, fail it or ask for re-inspection after rectification.
        </Typography.Paragraph>
      </Form>
    </FormShell>
  );
}
