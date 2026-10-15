'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, MaintenanceJobDto, MaintenanceKind } from '@erp/shared';
import { MAINTENANCE_KINDS, MAINTENANCE_KIND_LABELS, MAX_PAGE_SIZE, canManageMaintenance } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEquipment } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';

interface FormValues {
  equipmentId: string;
  kind: MaintenanceKind;
  date: dayjs.Dayjs;
  meterReading?: number | null;
  description: string;
  workshop?: string;
  photos?: AttachmentDto[];
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 16 } as const;

/** Report a breakdown or raise a service job card, or (with `job`) change an open one. */
export function JobFormModal({
  open,
  onClose,
  projectId,
  job,
  kind,
  equipmentId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  job?: MaintenanceJobDto | null;
  kind?: MaintenanceKind;
  equipmentId?: string;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { user } = useAuth();
  const manager = !!user && canManageMaintenance(user.roleKey);
  const { data: equipment } = useEquipment({ pageSize: MAX_PAGE_SIZE, projectId }, open);
  const editing = !!job;
  const watchedKind = Form.useWatch('kind', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (job)
      form.setFieldsValue({
        equipmentId: job.equipmentId,
        kind: job.kind,
        date: dayjs(job.date),
        meterReading: job.meterReading === null ? null : Number(job.meterReading),
        description: job.description,
        workshop: job.workshop ?? undefined,
        photos: job.attachments,
      });
    else form.setFieldsValue({ kind: kind ?? 'BREAKDOWN', date: dayjs(), equipmentId: equipmentId as string });
  }, [open, job, kind, equipmentId, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        kind: v.kind,
        date: v.date.format('YYYY-MM-DD'),
        meterReading: v.meterReading === undefined || v.meterReading === null ? null : String(v.meterReading),
        description: v.description.trim(),
        workshop: v.workshop?.trim() || null,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
      };
      return job ? (await api.patch<MaintenanceJobDto>(`/maintenance/jobs/${job.id}`, body)).data : (await api.post<MaintenanceJobDto>('/maintenance/jobs', { equipmentId: v.equipmentId, ...body })).data;
    },
    onSuccess: (j) => {
      message.success(editing ? `${j.jobNo} saved` : j.kind === 'BREAKDOWN' ? `${j.jobNo} reported` : `${j.jobNo} raised`);
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const breakdown = (watchedKind ?? kind) !== 'SERVICE';
  return (
    <Modal
      open={open}
      title={editing ? `Change ${job?.jobNo}` : breakdown ? 'Report a breakdown' : 'Raise a service job card'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Save' : breakdown ? 'Report' : 'Raise job card'}
      okButtonProps={{ loading: save.isPending }}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <div style={grid}>
          <Form.Item name="equipmentId" label="Machine" rules={[{ required: true, message: 'Pick the machine' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              disabled={editing}
              placeholder="Machine or vehicle"
              options={(equipment?.items ?? []).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}${e.projectName && !projectId ? ` (${e.projectName})` : ''}` }))}
            />
          </Form.Item>
          {manager ? (
            <Form.Item name="kind" label="Job">
              <Select options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: MAINTENANCE_KIND_LABELS[k] }))} />
            </Form.Item>
          ) : (
            <Form.Item name="kind" hidden>
              <Input />
            </Form.Item>
          )}
        </div>
        <div style={grid}>
          <Form.Item name="date" label={breakdown ? 'Stopped on' : 'Date'} rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
          </Form.Item>
          <Form.Item name="meterReading" label="Hour meter / km">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="description" label={breakdown ? 'What broke down' : 'Work to do'} rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input.TextArea rows={3} maxLength={2000} placeholder={breakdown ? 'Hydraulic hose burst on the boom; machine stopped at Ch 14+600' : '250-hour service: oil, filters, greasing'} />
        </Form.Item>
        <Form.Item name="workshop" label="Workshop / mechanic">
          <Input maxLength={200} placeholder="Optional" />
        </Form.Item>
        <Form.Item name="photos" label="Photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
