'use client';

import React, { useEffect, useMemo } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TransmittalDto, TransmittalPurpose } from '@erp/shared';
import { TRANSMITTAL_PURPOSES, TRANSMITTAL_PURPOSE_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useProjects, useSiteDocuments } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId: string;
  toParty: string;
  attention?: string;
  purpose: TransmittalPurpose;
  sentOn: dayjs.Dayjs;
  remarks?: string;
  items: { revisionId: string; copies: number }[];
}

/** What to start a transmittal with: a project and the revisions to send. */
export interface TransmittalPrefill {
  projectId: string;
  revisionIds: string[];
}

/** Send revisions to someone, or (with `transmittal`) change what was sent. Picks from each document's current revision. */
export function TransmittalFormModal({
  open,
  onClose,
  projectId,
  prefill,
  transmittal,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  prefill?: TransmittalPrefill | null;
  transmittal?: TransmittalDto | null;
  onSaved?: (t: TransmittalDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const fixedProject = transmittal?.projectId ?? prefill?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: docs } = useSiteDocuments(open ? selectedProject : undefined);
  const items = Form.useWatch('items', form);

  // A revision already on this transmittal stays pickable after a newer one is issued.
  const options = useMemo(() => {
    const list = (docs ?? []).filter((d) => d.current).map((d) => ({ value: d.current!.id, label: `${d.docNo} Rev ${d.current!.revision}, ${d.title}` }));
    for (const i of transmittal?.items ?? []) if (!list.some((o) => o.value === i.revisionId)) list.push({ value: i.revisionId, label: `${i.docNo} Rev ${i.revision}, ${i.title}` });
    return list;
  }, [docs, transmittal]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (transmittal)
      form.setFieldsValue({
        projectId: transmittal.projectId,
        toParty: transmittal.toParty,
        attention: transmittal.attention ?? undefined,
        purpose: transmittal.purpose,
        sentOn: dayjs(transmittal.sentOn),
        remarks: transmittal.remarks ?? undefined,
        items: transmittal.items.map((i) => ({ revisionId: i.revisionId, copies: i.copies })),
      });
    else form.setFieldsValue({ projectId: prefill?.projectId ?? projectId, purpose: 'FOR_CONSTRUCTION', sentOn: dayjs(), items: (prefill?.revisionIds ?? []).map((revisionId) => ({ revisionId, copies: 1 })) });
  }, [open, projectId, prefill, transmittal, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        toParty: v.toParty.trim(),
        attention: v.attention?.trim() || (transmittal ? null : undefined),
        purpose: v.purpose,
        sentOn: v.sentOn.format('YYYY-MM-DD'),
        remarks: v.remarks?.trim() || (transmittal ? null : undefined),
        items: v.items.map((i) => ({ revisionId: i.revisionId, copies: i.copies ?? 1 })),
      };
      return transmittal ? (await api.patch<TransmittalDto>(`/transmittals/${transmittal.id}`, body)).data : (await api.post<TransmittalDto>('/transmittals', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (t) => {
      message.success(transmittal ? `${t.transmittalNo} updated` : `${t.transmittalNo} recorded`);
      qc.invalidateQueries({ queryKey: ['documents'] });
      onSaved?.(t);
    },
    meta: FAIL_NOTICE,
  });

  const chosen = new Set((items ?? []).map((i) => i?.revisionId));
  const locked = !!transmittal?.acknowledgedOn;
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={720} title={transmittal ? `Edit ${transmittal.transmittalNo}` : 'New transmittal'} okText={transmittal ? 'Save' : 'Record transmittal'} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Select project"
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            onChange={() => form.setFieldsValue({ items: [] })}
          />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="toParty" label="To" rules={[{ required: true, whitespace: true, message: 'Say who it goes to' }]}>
            <Input maxLength={200} placeholder="Subcontractor, consultant or client" />
          </Form.Item>
          <Form.Item name="attention" label="Attention">
            <Input maxLength={200} placeholder="Name and designation" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="purpose" label="Purpose">
            <Select options={TRANSMITTAL_PURPOSES.map((p) => ({ value: p, label: TRANSMITTAL_PURPOSE_LABELS[p] }))} />
          </Form.Item>
          <Form.Item name="sentOn" label="Sent on" rules={[{ required: true, message: 'Pick the date it was sent' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 32px', gap: 8 }}>
          <Typography.Text strong>Documents</Typography.Text>
          <Typography.Text strong>Copies</Typography.Text>
        </div>
        {locked ? <Typography.Paragraph type="secondary">Acknowledged, so the list of documents stays as sent.</Typography.Paragraph> : null}
        <Form.List
          name="items"
          rules={[
            {
              validator: async (_, v) => {
                if (!v?.length) throw new Error('Add at least one document');
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <div style={{ marginTop: 8 }}>
              {fields.map((f) => (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 32px', gap: 8, alignItems: 'start' }}>
                  <Form.Item name={[f.name, 'revisionId']} rules={[{ required: true, message: 'Pick a document' }]} style={{ marginBottom: 8 }}>
                    <Select showSearch={{ optionFilterProp: 'label' }} disabled={locked} aria-label="Document" options={options.map((o) => ({ ...o, disabled: chosen.has(o.value) && items?.[f.name]?.revisionId !== o.value }))} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'copies']} initialValue={1} style={{ marginBottom: 8 }}>
                    <InputNumber min={1} max={99} precision={0} inputMode="numeric" style={{ width: '100%' }} disabled={locked} aria-label="Copies" />
                  </Form.Item>
                  <Button type="text" icon={<DeleteOutlined />} onClick={() => remove(f.name)} disabled={locked} aria-label="Remove document" />
                </div>
              ))}
              {!locked ? (
                <Button size="small" onClick={() => add({ copies: 1 })} disabled={!selectedProject}>
                  Add document
                </Button>
              ) : null}
              <Form.ErrorList errors={errors} />
            </div>
          )}
        </Form.List>
        <Form.Item name="remarks" label="Remarks" style={{ marginTop: 16 }}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
