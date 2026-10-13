'use client';

import React, { useEffect } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { AttachmentDto, DailyReportDto, Weather } from '@erp/shared';
import { MANPOWER_CATEGORIES, WEATHER_LABELS, WEATHER_OPTIONS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  weather?: Weather;
  siteCondition?: string;
  manpower?: { category: string; count: number }[];
  machinery?: { name: string; hours: number }[];
  materialReceived?: string;
  workExecuted: string;
  testsConducted?: string;
  safetyObservations?: string;
  issues?: string;
  nextDayPlan?: string;
  photos?: AttachmentDto[];
}

/** Create a DPR, or (with `entry`) edit a draft / rejected / changes-requested one and resubmit it. */
export function DprFormModal({ open, onClose, projectId, entry }: { open: boolean; onClose: () => void; projectId?: string; entry?: DailyReportDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (entry) {
      form.setFieldsValue({
        projectId: entry.projectId,
        date: dayjs(entry.date),
        weather: entry.weather ?? undefined,
        siteCondition: entry.siteCondition ?? undefined,
        manpower: entry.manpower,
        machinery: entry.machinery,
        materialReceived: entry.materialReceived ?? undefined,
        workExecuted: entry.workExecuted,
        testsConducted: entry.testsConducted ?? undefined,
        safetyObservations: entry.safetyObservations ?? undefined,
        issues: entry.issues ?? undefined,
        nextDayPlan: entry.nextDayPlan ?? undefined,
        photos: entry.attachments,
      });
    } else {
      form.setFieldsValue({
        projectId,
        date: dayjs(),
        weather: 'SUNNY',
        siteCondition: 'Workable',
        manpower: [{ category: 'Mason', count: 4 }, { category: 'Helper', count: 10 }],
        machinery: [],
      });
    }
  }, [open, projectId, entry, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const blank = editing ? null : undefined;
      const body = {
        date: v.date.format('YYYY-MM-DD'),
        weather: v.weather ?? blank,
        siteCondition: v.siteCondition || blank,
        manpower: (v.manpower ?? []).filter((m) => m && m.category),
        machinery: (v.machinery ?? []).filter((m) => m && m.name),
        materialReceived: v.materialReceived || blank,
        workExecuted: v.workExecuted,
        testsConducted: v.testsConducted || blank,
        safetyObservations: v.safetyObservations || blank,
        issues: v.issues || blank,
        nextDayPlan: v.nextDayPlan || blank,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return entry ? (await api.patch(`/dpr/${entry.id}`, body)).data : (await api.post('/dpr', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: () => {
      message.success(editing ? 'DPR resubmitted for approval' : 'DPR submitted for approval');
      qc.invalidateQueries();
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={entry ? `${editActionLabel(entry.status)} · DPR ${dayjs(entry.date).format('DD MMM YYYY')}` : 'New Daily Progress Report'} okText={editing ? 'Resubmit DPR' : 'Submit DPR'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={760} destroyOnHidden styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select showSearch optionFilterProp="label" placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="weather" label="Weather">
            <Select options={WEATHER_OPTIONS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }))} />
          </Form.Item>
          <Form.Item name="siteCondition" label="Site condition">
            <Input placeholder="Workable / Waterlogged" />
          </Form.Item>
        </div>
        <Form.Item name="workExecuted" label="Work executed" rules={[{ required: true, message: 'Required' }]}>
          <Input.TextArea rows={3} placeholder="Summary of work done today" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div>
            <Form.Item label="Manpower" style={{ marginBottom: 4 }}>
              <Form.List name="manpower">
                {(fields, { add, remove }) => (
                  <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                    {fields.map((f) => (
                      <div key={f.key} style={{ display: 'flex', gap: 6 }}>
                        <Form.Item name={[f.name, 'category']} noStyle rules={[{ required: true, message: '' }]}>
                          <Select style={{ flex: 1 }} placeholder="Category" options={MANPOWER_CATEGORIES.map((c) => ({ value: c, label: c }))} />
                        </Form.Item>
                        <Form.Item name={[f.name, 'count']} noStyle rules={[{ required: true, message: '' }]}>
                          <InputNumber min={0} precision={0} placeholder="Nos" style={{ width: 80 }} />
                        </Form.Item>
                        <Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                      </div>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ count: 1 })} block size="small">
                      Add category
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          </div>
          <div>
            <Form.Item label="Machinery" style={{ marginBottom: 4 }}>
              <Form.List name="machinery">
                {(fields, { add, remove }) => (
                  <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                    {fields.map((f) => (
                      <div key={f.key} style={{ display: 'flex', gap: 6 }}>
                        <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, message: '' }]}>
                          <Input style={{ flex: 1 }} placeholder="Equipment" />
                        </Form.Item>
                        <Form.Item name={[f.name, 'hours']} noStyle rules={[{ required: true, message: '' }]}>
                          <InputNumber min={0} placeholder="Hrs" style={{ width: 80 }} />
                        </Form.Item>
                        <Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                      </div>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ hours: 8 })} block size="small">
                      Add machine
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginTop: 12 }}>
          <Form.Item name="materialReceived" label="Material received">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="testsConducted" label="Tests conducted">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="safetyObservations" label="Safety observations">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="issues" label="Issues / hindrances">
            <Input.TextArea rows={2} />
          </Form.Item>
        </div>
        <Form.Item name="nextDayPlan" label="Next day plan">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="photos" label="Site photos">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
