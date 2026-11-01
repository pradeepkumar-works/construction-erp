'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect } from 'react';
import { Alert, Form, Input, InputNumber, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AiDraftDto, AttachmentDto, ProgressEntryDto } from '@erp/shared';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useActivities, useDprWorkOptions } from '@/lib/queries';
import { LinkButton } from '@/components/common/LinkButton';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { aiFlagItem, draftDate } from '@/components/ai/drafts';
import { SectorInputs, sectorBody, sectorFormValues, typedLocation, type SectorFormValues } from '@/components/sector/SectorInputs';
import { recordPage } from '@/components/approvals/queue';

interface FormValues extends SectorFormValues {
  projectId: string;
  activityId: string;
  date: dayjs.Dayjs;
  quantity: number;
  location?: string;
  manpowerCount?: number;
  machineryUsed?: string;
  remarks?: string;
  photos?: AttachmentDto[];
}

/**
 * Create a progress entry, or (with `entry`) edit an existing draft / rejected / changes-requested
 * entry and resubmit it for approval in one go.
 */
export function ProgressFormModal({ open, onClose, projectId, defaultProjectId, entry, prefill }: { open: boolean; onClose: () => void; projectId?: string; /** A new entry starts on this project (the header's), still changeable. */ defaultProjectId?: string; entry?: ProgressEntryDto | null; /** Filled in by Ask Nirmaan */ prefill?: AiDraftDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities, isLoading: actLoading } = useActivities(selectedProject);
  // Progress from the DPR only: a new entry is a line of the day's DPR instead.
  const workOptions = useDprWorkOptions(open && !entry ? selectedProject : undefined).data;
  const dprOnly = !entry && !!workOptions?.progressFromDpr;
  const selectedActivity = Form.useWatch('activityId', form);
  const activity = activities?.find((a) => a.id === selectedActivity);
  const draft = entry ? null : prefill;
  const quantity = Form.useWatch('quantity', form);
  const date = Form.useWatch('date', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (entry) {
      form.setFieldsValue({
        projectId: entry.projectId,
        activityId: entry.activityId,
        date: dayjs(entry.date),
        quantity: Number(entry.quantity),
        location: typedLocation(entry),
        ...sectorFormValues(entry),
        manpowerCount: entry.manpowerCount ?? undefined,
        machineryUsed: entry.machineryUsed ?? undefined,
        remarks: entry.remarks ?? undefined,
        photos: entry.attachments,
      });
    } else {
      form.setFieldsValue({ projectId: projectId ?? defaultProjectId, date: dayjs() });
      if (prefill) {
        const v = prefill.values as Partial<Omit<FormValues, 'date'>> & { date?: string };
        form.setFieldsValue({ projectId: prefill.projectId, activityId: v.activityId, date: draftDate(v.date) ?? dayjs(), quantity: v.quantity, location: v.location, manpowerCount: v.manpowerCount, remarks: v.remarks });
      }
    }
  }, [open, projectId, defaultProjectId, entry, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        activityId: v.activityId,
        date: v.date.format('YYYY-MM-DD'),
        quantity: String(v.quantity),
        location: v.location || (editing ? null : undefined),
        ...sectorBody(v, editing),
        manpowerCount: v.manpowerCount ?? (editing ? null : undefined),
        machineryUsed: v.machineryUsed || (editing ? null : undefined),
        remarks: v.remarks || (editing ? null : undefined),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return entry ? (await api.patch(`/progress/${entry.id}`, body)).data : (await api.post('/progress', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: { id: string }) => {
      notify.saved(editing ? 'Progress entry resubmitted for approval' : 'Progress entry submitted for approval', recordPage('PROGRESS', x.id));
      qc.invalidateQueries();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={entry ? `${editActionLabel(entry.status)} · ${entry.activityName}` : 'New progress entry'}
      okText={editing ? 'Resubmit for approval' : 'Submit for approval'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      layout="modal"
      width={640}
      draftKey={editing ? undefined : `progress:${projectId ?? 'any'}`}
      aiDraft={draft}
      okDisabled={dprOnly}
    >
      <Form form={form} layout="vertical">
        {dprOnly ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="Your company records progress in the DPR"
            description="Add this work as a line of the day's DPR; it is approved with the DPR."
            action={
              <LinkButton href="/dpr" size="small">
                Daily reports
              </LinkButton>
            }
          />
        ) : null}
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <ProjectSelect allowClear={false} placeholder="Choose a project" style={{ width: '100%' }} onChange={() => form.setFieldValue('activityId', undefined)} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="activityId" label="Activity" rules={[{ required: true, message: 'Choose the activity' }]} {...aiFlagItem(draft, 'activityId', selectedActivity)}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              loading={actLoading}
              disabled={!selectedProject}
              placeholder={selectedProject ? 'Choose the activity' : 'Choose the project first'}
              options={(activities ?? []).filter((a) => !a.isSummary).map((a) => ({ value: a.id, label: `${a.name} (${a.unit})` }))}
            />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]} {...aiFlagItem(draft, 'date', date)}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="quantity" label="Quantity done" rules={[{ required: true, message: 'Enter the quantity done' }]} {...aiFlagItem(draft, 'quantity', quantity)}>
            <QuantityInput unit={activity?.unit} />
          </Form.Item>
          <Form.Item name="manpowerCount" label="Labour">
            <InputNumber style={{ width: '100%' }} min={0} precision={0} inputMode="numeric" />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input placeholder="Grid, side, structure" />
          </Form.Item>
        </FormGrid>
        <SectorInputs projectId={selectedProject} />
        <Form.Item name="machineryUsed" label="Machines used">
          <Input placeholder="Excavator x1, Tipper x4" />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="photos" label="Site photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
