'use client';

import React, { useEffect, useMemo } from 'react';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, DelayParty, RiskCategory, RiskDto, RiskKind, RiskStatus } from '@erp/shared';
import { DELAY_PARTIES, DELAY_PARTY_LABELS, RISK_CATEGORIES, RISK_CATEGORY_LABELS, RISK_LEVEL_LABELS, RISK_STATUSES, RISK_STATUS_LABELS, delayDays, riskLevel, riskScore } from '@erp/shared';
import { FormShell } from '@/components/form/FormShell';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useProject, useProjects } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { LEVEL_TAG, RATING_OPTIONS } from './riskUi';
import { themeColor } from '@/lib/theme';

interface FormValues {
  projectId: string;
  kind: RiskKind;
  category: RiskCategory;
  title: string;
  description?: string;
  activityId?: string;
  ownerId?: string;
  probability: number;
  impact: number;
  mitigation?: string;
  dueDate?: dayjs.Dayjs | null;
  delayStart?: dayjs.Dayjs | null;
  delayEnd?: dayjs.Dayjs | null;
  daysLost?: number | null;
  responsibleParty?: DelayParty;
  eotClaimed?: boolean;
  eotGrantedDays?: number | null;
  status?: RiskStatus;
  closureNote?: string;
  photos?: AttachmentDto[];
}

/** Prefill for a new entry, e.g. a delay for an activity that is past its planned end. */
export interface RiskPrefill {
  projectId?: string;
  kind?: RiskKind;
  activityId?: string;
  title?: string;
}

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;
const ymd = (d: dayjs.Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null);

/** Raise a delay or a risk, or (with `risk`) update one, including its status. */
export function RiskFormModal({ open, onClose, projectId, risk, prefill }: { open: boolean; onClose: () => void; projectId?: string; risk?: RiskDto | null; prefill?: RiskPrefill | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!risk;
  const fixedProject = risk?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: activities } = useActivities(selectedProject);
  const { data: project } = useProject(selectedProject);
  const kind = Form.useWatch('kind', form);
  const probability = Form.useWatch('probability', form);
  const impact = Form.useWatch('impact', form);
  const delayStart = Form.useWatch('delayStart', form);
  const delayEnd = Form.useWatch('delayEnd', form);
  const status = Form.useWatch('status', form);
  const eotClaimed = Form.useWatch('eotClaimed', form);
  const isDelay = kind === 'DELAY';
  const score = probability && impact ? riskScore(probability, impact) : null;
  const counted = isDelay ? delayDays(ymd(delayStart), ymd(delayEnd), dayjs().format('YYYY-MM-DD')) : null;

  const owners = useMemo(() => {
    if (!project) return [];
    const list = [
      ...(project.projectManagerId ? [{ value: project.projectManagerId, label: `${project.projectManagerName} (Project Manager)` }] : []),
      ...project.members.filter((m) => m.userId !== project.projectManagerId).map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` })),
    ];
    if (risk?.ownerId && !list.some((o) => o.value === risk.ownerId)) list.push({ value: risk.ownerId, label: risk.ownerName ?? 'Current owner' });
    return list;
  }, [project, risk]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (risk) {
      form.setFieldsValue({
        projectId: risk.projectId,
        kind: risk.kind,
        category: risk.category,
        title: risk.title,
        description: risk.description ?? undefined,
        activityId: risk.activityId ?? undefined,
        ownerId: risk.ownerId ?? undefined,
        probability: risk.probability,
        impact: risk.impact,
        mitigation: risk.mitigation ?? undefined,
        dueDate: risk.dueDate ? dayjs(risk.dueDate) : null,
        delayStart: risk.delayStart ? dayjs(risk.delayStart) : null,
        delayEnd: risk.delayEnd ? dayjs(risk.delayEnd) : null,
        // Only an agreed figure is stored; a counted one is shown as the placeholder.
        daysLost: risk.kind === 'DELAY' && risk.daysLost !== delayDays(risk.delayStart, risk.delayEnd, dayjs().format('YYYY-MM-DD')) ? risk.daysLost : null,
        responsibleParty: risk.responsibleParty ?? undefined,
        eotClaimed: risk.eotClaimed,
        eotGrantedDays: risk.eotGrantedDays,
        status: risk.status,
        closureNote: risk.closureNote ?? undefined,
        photos: risk.attachments,
      });
    } else {
      const k = prefill?.kind ?? 'RISK';
      form.setFieldsValue({
        projectId: prefill?.projectId ?? projectId,
        kind: k,
        activityId: prefill?.activityId,
        title: prefill?.title,
        probability: k === 'DELAY' ? 5 : 3,
        impact: 3,
        delayStart: k === 'DELAY' ? dayjs() : null,
        eotClaimed: false,
      });
    }
  }, [open, projectId, risk, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const delay = v.kind === 'DELAY';
      const body = {
        kind: v.kind,
        category: v.category,
        title: v.title.trim(),
        description: t(v.description),
        activityId: v.activityId ?? (editing ? null : undefined),
        ownerId: v.ownerId ?? (editing ? null : undefined),
        probability: v.probability,
        impact: v.impact,
        mitigation: t(v.mitigation),
        dueDate: ymd(v.dueDate),
        delayStart: delay ? ymd(v.delayStart) : null,
        delayEnd: delay ? ymd(v.delayEnd) : null,
        daysLost: delay && v.daysLost !== undefined && v.daysLost !== null ? v.daysLost : null,
        responsibleParty: delay ? (v.responsibleParty ?? null) : null,
        eotClaimed: delay ? !!v.eotClaimed : false,
        eotGrantedDays: delay && v.eotClaimed && v.eotGrantedDays !== undefined && v.eotGrantedDays !== null ? v.eotGrantedDays : null,
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        ...(editing ? { status: v.status, closureNote: t(v.closureNote) } : {}),
      };
      return risk ? (await api.patch<RiskDto>(`/risks/${risk.id}`, body)).data : (await api.post<RiskDto>('/risks', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x) => {
      message.success(editing ? `${x.riskNo} updated` : `${x.riskNo} raised`);
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={risk ? `Update ${risk.riskNo}` : isDelay ? 'Record a delay' : 'Raise a risk'}
      okText={editing ? 'Save' : isDelay ? 'Record delay' : 'Raise risk'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      layout="drawer"
      width={720}
      draftKey={editing || prefill ? undefined : `risk:${projectId ?? 'any'}`}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="kind" style={{ marginBottom: 12 }}>
          <Segmented
            options={[
              { value: 'DELAY', label: 'Delay: work has been held up' },
              { value: 'RISK', label: 'Risk: something that might happen' },
            ]}
            onChange={(k) => {
              if (!editing) form.setFieldsValue({ probability: k === 'DELAY' ? 5 : 3, delayStart: k === 'DELAY' ? (form.getFieldValue('delayStart') ?? dayjs()) : null });
            }}
          />
        </Form.Item>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Select project"
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            onChange={() => form.setFieldsValue({ activityId: undefined, ownerId: undefined })}
          />
        </Form.Item>
        <Form.Item name="title" label={isDelay ? 'What is holding up work' : 'What might happen'} rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input maxLength={200} placeholder={isDelay ? 'Encroachment at Ch 12+300 holding up embankment' : 'HT line crossing not shifted before WMM'} />
        </Form.Item>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Required' }]}>
            <Select placeholder="Select" options={RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABELS[c] }))} />
          </Form.Item>
          <Form.Item name="activityId" label="Activity affected (optional)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="Details">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        {isDelay ? (
          <>
            <div style={grid('1fr 1fr 1fr')}>
              <Form.Item name="delayStart" label="Held up since" rules={[{ required: true, message: 'Required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item
                name="delayEnd"
                label="Resumed on"
                tooltip="Leave empty while work is still held up"
                rules={[{ validator: async (_, v) => (!v || !delayStart || !v.isBefore(delayStart, 'day') ? undefined : Promise.reject(new Error('Before the start'))) }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item name="daysLost" label="Days lost" tooltip="Leave empty to count the calendar days between the dates (to today while still held up)">
                <InputNumber style={{ width: '100%' }} min={0} max={3650} precision={0} placeholder={counted !== null ? `${counted} (counted)` : undefined} />
              </Form.Item>
            </div>
            <div style={grid('1fr 1fr 0.8fr')}>
              <Form.Item name="responsibleParty" label="Caused by">
                <Select allowClear placeholder="Select" options={DELAY_PARTIES.map((p) => ({ value: p, label: DELAY_PARTY_LABELS[p] }))} />
              </Form.Item>
              <Form.Item name="eotClaimed" label="Extension of time" valuePropName="checked">
                <Checkbox>EOT claimed from the client</Checkbox>
              </Form.Item>
              <Form.Item name="eotGrantedDays" label="EOT granted (days)" tooltip="Once the client grants it; moves the contract completion date">
                <InputNumber style={{ width: '100%' }} min={0} max={3650} precision={0} disabled={!eotClaimed} placeholder={eotClaimed ? 'Not yet' : undefined} />
              </Form.Item>
            </div>
          </>
        ) : null}
        <div style={grid('1fr 1fr 0.6fr')}>
          <Form.Item name="probability" label="Probability" rules={[{ required: true }]}>
            <Select options={RATING_OPTIONS} />
          </Form.Item>
          <Form.Item name="impact" label="Impact on time / cost" rules={[{ required: true }]}>
            <Select options={RATING_OPTIONS} />
          </Form.Item>
          <Form.Item label="Score">
            {score ? (
              <Typography.Text strong style={{ fontSize: 16, lineHeight: '32px', color: LEVEL_TAG[riskLevel(score)] === 'red' ? themeColor('colorErrorText') : undefined }}>
                {score} · {RISK_LEVEL_LABELS[riskLevel(score)]}
              </Typography.Text>
            ) : (
              '-'
            )}
          </Form.Item>
        </div>
        <Form.Item name="mitigation" label={isDelay ? 'Action being taken' : 'Mitigation'}>
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="ownerId" label="Owner (follows it up)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={owners} />
          </Form.Item>
          <Form.Item name="dueDate" label="Action due / next review">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </div>
        {editing ? (
          <div style={grid('1fr 2fr')}>
            <Form.Item name="status" label="Status">
              <Select options={RISK_STATUSES.map((s) => ({ value: s, label: RISK_STATUS_LABELS[s] }))} />
            </Form.Item>
            <Form.Item name="closureNote" label="Closure note" rules={[{ required: status === 'CLOSED', whitespace: true, message: 'Say how it was resolved' }]}>
              <Input maxLength={2000} disabled={status !== 'CLOSED'} />
            </Form.Item>
          </div>
        ) : null}
        <Form.Item name="photos" label="Photos / letters">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
