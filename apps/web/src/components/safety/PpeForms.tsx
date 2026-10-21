'use client';

import React, { useEffect, useRef } from 'react';
import { App, Button, Checkbox, DatePicker, Form, Input, Radio, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import type { PpeKind, PpeRegisterDto } from '@erp/shared';
import { PPE_KINDS, PPE_KIND_LABELS, PPE_LIFE_DAYS } from '@erp/shared';
import { useClosePpe, useIssuePpe, useSetPpeRequired } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';

const KIND_OPTIONS = PPE_KINDS.map((k) => ({ value: k, label: PPE_KIND_LABELS[k] }));
const life = (k: PpeKind) => {
  const d = PPE_LIFE_DAYS[k];
  return d >= 365 ? `${Math.round(d / 365)} yr` : d >= 30 ? `${Math.round(d / 30)} mo` : `${d} days`;
};

interface IssueValues {
  workerIds: string[];
  kinds: PpeKind[];
  issuedOn: dayjs.Dayjs;
  size?: string;
  note?: string;
}

/** Hand kit to one or more of the project's workers. An item of the same kind a worker still holds is replaced. */
export function IssuePpeModal({ open, onClose, register, preset }: { open: boolean; onClose: () => void; register: PpeRegisterDto; preset?: { workerIds: string[]; kinds: PpeKind[] } }) {
  const [form] = Form.useForm<IssueValues>();
  const { message } = App.useApp();
  const issue = useIssuePpe();
  // One id per batch, so a save that timed out but arrived is never issued twice when tried again.
  const batchId = useRef<string>('');
  const kinds = Form.useWatch('kinds', form) ?? [];

  useEffect(() => {
    if (!open) return;
    batchId.current = crypto.randomUUID();
    form.resetFields();
    form.setFieldsValue({ workerIds: preset?.workerIds ?? [], kinds: preset?.kinds ?? register.required, issuedOn: dayjs() });
  }, [open, preset, register.required, form]);

  const lacking = (k: PpeKind) => register.workers.filter((w) => w.missing.includes(k)).map((w) => w.workerId);
  const anyLacking = register.workers.filter((w) => w.missing.length).map((w) => w.workerId);
  const addWorkers = (ids: string[]) => form.setFieldValue('workerIds', [...new Set([...(form.getFieldValue('workerIds') ?? []), ...ids])]);

  const submit = async (v: IssueValues) => {
    const r = await issue.mutateAsync({ id: batchId.current, projectId: register.projectId, workerIds: v.workerIds, kinds: v.kinds, issuedOn: v.issuedOn.format('YYYY-MM-DD'), size: v.size?.trim() || null, note: v.note?.trim() || null });
    message.success(`${r.issued} item${r.issued === 1 ? '' : 's'} issued${r.replaced ? `, ${r.replaced} older ${r.replaced === 1 ? 'one' : 'ones'} marked replaced` : ''}`);
  };

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={620} title={`Issue PPE at ${register.projectCode}`} okText="Issue" onSubmit={submit}>
      <Form form={form} layout="vertical">
        <Form.Item name="kinds" label="Kit" rules={[{ required: true, type: 'array', min: 1, message: 'Tick at least one item' }]} extra="The project's required kit is ticked to start with. Usual life in brackets sets the replace-by date.">
          <Checkbox.Group style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {PPE_KINDS.map((k) => (
              <Checkbox key={k} value={k}>
                {PPE_KIND_LABELS[k]} <span className="text-muted">({life(k)})</span>
              </Checkbox>
            ))}
          </Checkbox.Group>
        </Form.Item>
        <Form.Item
          name="workerIds"
          label="Workers"
          rules={[{ required: true, type: 'array', min: 1, message: 'Choose at least one worker' }]}
          extra={
            <Space wrap size={4} style={{ marginTop: 4 }}>
              {anyLacking.length ? (
                <Button size="small" onClick={() => addWorkers(anyLacking)}>
                  Add everyone missing kit ({anyLacking.length})
                </Button>
              ) : null}
              {kinds.length === 1 && lacking(kinds[0]).length ? (
                <Button size="small" onClick={() => addWorkers(lacking(kinds[0]))}>
                  Add everyone without a {PPE_KIND_LABELS[kinds[0]].toLowerCase()} ({lacking(kinds[0]).length})
                </Button>
              ) : null}
            </Space>
          }
        >
          <Select
            mode="multiple"
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Type a name or worker number"
            options={register.workers.map((w) => ({ value: w.workerId, label: `${w.name} · ${w.workerNo} · ${w.trade}${w.missing.length ? ` · no ${w.missing.map((k) => PPE_KIND_LABELS[k].toLowerCase()).join(', ')}` : ''}` }))}
            maxTagCount="responsive"
          />
        </Form.Item>
        <FormGrid>
          <Form.Item name="issuedOn" label="Issued on" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="size" label="Size" extra="When one size suits everyone in this issue, e.g. shoe size 9 or jacket L.">
            <Input maxLength={20} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface CloseValues {
  status: 'RETURNED' | 'LOST';
  on: dayjs.Dayjs;
  recoverable: boolean;
  note?: string;
}

/** Record an item handed back or lost. */
export function ClosePpeModal({ open, onClose, item }: { open: boolean; onClose: () => void; item: { id: string; kind: PpeKind; workerName: string; issuedOn: string } | null }) {
  const [form] = Form.useForm<CloseValues>();
  const { message } = App.useApp();
  const close = useClosePpe();
  const status = Form.useWatch('status', form);

  useEffect(() => {
    if (open) form.setFieldsValue({ status: 'RETURNED', on: dayjs(), recoverable: false, note: undefined });
  }, [open, form]);

  if (!item) return null;
  const submit = async (v: CloseValues) => {
    await close.mutateAsync({ id: item.id, status: v.status, on: v.on.format('YYYY-MM-DD'), recoverable: v.recoverable, note: v.note?.trim() || null });
    message.success(`${PPE_KIND_LABELS[item.kind]} of ${item.workerName} recorded as ${v.status === 'LOST' ? 'lost' : 'returned'}`);
  };
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={520} title={`${PPE_KIND_LABELS[item.kind]}: ${item.workerName}`} okText="Save" onSubmit={submit}>
      <Typography.Paragraph type="secondary">Issued on {formatDate(item.issuedOn)}.</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="status" label="What happened">
          <Radio.Group
            onChange={(e) => form.setFieldValue('recoverable', e.target.value === 'LOST')}
            options={[
              { value: 'RETURNED', label: 'Handed back' },
              { value: 'LOST', label: 'Lost or not returned' },
            ]}
          />
        </Form.Item>
        <Form.Item name="on" label={status === 'LOST' ? 'Found missing on' : 'Returned on'} rules={[{ required: true, message: 'Pick the date' }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(item.issuedOn), 'day')} />
        </Form.Item>
        <Form.Item name="recoverable" valuePropName="checked">
          <Checkbox>Recover its cost from the labour contractor</Checkbox>
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The kit every worker at the project must have. */
export function RequiredKitModal({ open, onClose, register }: { open: boolean; onClose: () => void; register: PpeRegisterDto }) {
  const [form] = Form.useForm<{ kinds: PpeKind[] }>();
  const { message } = App.useApp();
  const save = useSetPpeRequired();
  useEffect(() => {
    if (open) form.setFieldsValue({ kinds: register.required });
  }, [open, register.required, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      title={`Required kit at ${register.projectCode}`}
      okText="Save"
      onSubmit={async (v) => {
        await save.mutateAsync({ projectId: register.projectId, kinds: v.kinds });
        message.success('Required kit saved');
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="kinds" label="Every worker must have" extra="Workers without one of these show as missing kit.">
          <Checkbox.Group options={KIND_OPTIONS} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
