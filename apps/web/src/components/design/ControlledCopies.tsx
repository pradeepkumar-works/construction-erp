'use client';

import React, { useEffect, useMemo } from 'react';
import { Form, Input, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  COPY_DISPOSAL_LABELS,
  COPY_DISPOSALS,
  COPY_STATE_LABELS,
  copyLabel,
  isBuildable,
  type ControlledCopyDto,
  type CopyDisposal,
  type CopyState,
} from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useControlledCopies, useCopyAction, useDocuments } from '@/lib/queries';
import { FormShell } from '@/components/form/FormShell';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag, type TagTone } from '@/components/common/AppTag';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const afterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');

const STATE_TONE: Record<CopyState, TagTone> = { IN_FORCE: 'success', TO_RECALL: 'pending', CLOSED: 'neutral' };

/** Where a controlled copy stands; a superseded one out past the recall period says how long. */
export function CopyStateTag({ copy }: { copy: Pick<ControlledCopyDto, 'state' | 'recallDays' | 'recallLate' | 'disposal'> }) {
  if (copy.state === 'CLOSED') return <AppTag tone="neutral">{copy.disposal ? COPY_DISPOSAL_LABELS[copy.disposal] : COPY_STATE_LABELS.CLOSED}</AppTag>;
  if (copy.recallLate)
    return (
      <AppTag tone="danger">
        {`To withdraw, ${copy.recallDays} days out`}
      </AppTag>
    );
  return (
    <AppTag tone={STATE_TONE[copy.state]}>
      {copy.state === 'TO_RECALL' ? 'To withdraw' : COPY_STATE_LABELS[copy.state]}
    </AppTag>
  );
}

export const copyName = (c: Pick<ControlledCopyDto, 'copyNo' | 'holder'>) => `${copyLabel(c.copyNo)} ${c.holder}`;

type IssueValues = { projectId?: string; documentId?: string; holders: string[]; issuedOn: dayjs.Dayjs };

/**
 * Issue numbered copies of a document's current revision, one per holder. Opened from a document (its id given) or from
 * the copies list (project and drawing chosen here). Holders who had a copy before are offered first and keep their number.
 */
export function IssueCopiesDialog({
  open,
  onClose,
  documentId,
  projectId,
  title,
  holders,
}: {
  open: boolean;
  onClose: () => void;
  documentId?: string;
  projectId?: string;
  /** "STR-205 R1", when opened from a document */
  title?: string;
  /** Holders to start with (those of the superseded copies) */
  holders?: string[];
}) {
  const [form] = Form.useForm<IssueValues>();
  const act = useCopyAction();
  const notify = useNotify();
  const project = Form.useWatch('projectId', form) ?? projectId;
  const chosenDoc = Form.useWatch('documentId', form) ?? documentId;
  const docs = useDocuments({ projectId: project, pageSize: 500 }, open && !documentId && !!project);
  const known = useControlledCopies({ projectId: project, pageSize: 500 }, open && !!project);
  useEffect(() => {
    if (open) form.setFieldsValue({ projectId, documentId: undefined, holders: holders ?? [], issuedOn: dayjs() });
  }, [open, form, projectId, holders]);
  const buildable = useMemo(() => (docs.data?.items ?? []).filter((d) => d.current && isBuildable(d.current.status)), [docs.data]);
  const holderOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of known.data?.items ?? []) if (!names.has(c.holder.toLowerCase())) names.set(c.holder.toLowerCase(), c.holder);
    return [...names.values()].sort().map((h) => ({ value: h, label: h }));
  }, [known.data]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={!documentId}
      title={title ? `Issue copies of ${title}` : 'Issue controlled copies'}
      okText="Issue copies"
      onSubmit={async (v) => {
        const out = await act.mutateAsync({ path: '/design/copies', body: { documentId: documentId ?? v.documentId, holders: v.holders.map((h) => h.trim()).filter(Boolean), issuedOn: ymd(v.issuedOn) } });
        const n = Array.isArray(out) ? out.length : v.holders.length;
        notify.saved(`${n} controlled cop${n === 1 ? 'y' : 'ies'} issued`);
      }}
    >
      <Form form={form} layout="vertical">
        {!documentId ? (
          <>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <ProjectSelect placeholder="Project" onChange={() => form.setFieldValue('documentId', undefined)} />
            </Form.Item>
            <Form.Item
              name="documentId"
              label="Drawing"
              extra="Its current revision is issued. Only revisions good for construction or approved are issued as controlled copies."
              rules={[{ required: true, message: 'Choose the drawing' }]}
            >
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                disabled={!project}
                loading={docs.isLoading}
                placeholder={project ? 'Drawing number or title' : 'Choose the project first'}
                options={buildable.map((d) => ({ value: d.id, label: `${d.docNo} ${d.current!.revision} · ${d.title}` }))}
              />
            </Form.Item>
          </>
        ) : null}
        <Form.Item
          name="holders"
          label="Copies to"
          extra={chosenDoc ? 'One numbered copy each. Someone who had a copy of this drawing keeps its number.' : undefined}
          rules={[{ required: true, type: 'array', min: 1, message: 'Name who gets a copy' }]}
        >
          <Select mode="tags" tokenSeparators={[',']} placeholder="Site office, Formwork subcontractor…" options={holderOptions} maxTagTextLength={40} />
        </Form.Item>
        <Form.Item name="issuedOn" label="Issued on" rules={[{ required: true, message: 'Choose the day the copies went out' }]}>
          <DatePicker disabledDate={afterToday} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** A copy returned, destroyed on site or reported lost. */
export function TakeBackDialog({ copy, open, onClose }: { copy: ControlledCopyDto | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ disposedOn: dayjs.Dayjs; disposal: CopyDisposal; note?: string }>();
  const act = useCopyAction();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ disposedOn: dayjs(), disposal: 'RETURNED', note: undefined });
  }, [open, form]);
  if (!copy) return null;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Withdraw ${copyLabel(copy.copyNo)} of ${copy.docNo} ${copy.revision}`}
      okText="Withdraw"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/design/copies/${copy.id}/take-back`, body: { disposedOn: ymd(v.disposedOn), disposal: v.disposal, note: v.note?.trim() || null } });
        notify.saved(`${copyName(copy)}: ${COPY_DISPOSAL_LABELS[v.disposal].toLowerCase()}`);
      }}
    >
      <Typography.Paragraph type="secondary">{`Held by ${copy.holder} since ${dayjs(copy.issuedOn).format('DD MMM YYYY')}.`}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="disposal" label="What became of it">
          <Segmented<CopyDisposal> block options={COPY_DISPOSALS.map((d) => ({ value: d, label: COPY_DISPOSAL_LABELS[d] }))} />
        </Form.Item>
        <Form.Item name="disposedOn" label="On" rules={[{ required: true, message: 'Choose the day it came back' }]}>
          <DatePicker disabledDate={(d) => afterToday(d) || d.isBefore(dayjs(copy.issuedOn), 'day')} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} maxLength={500} placeholder="Stamped superseded and torn in front of the foreman" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The holder of a superseded copy gets the current revision under the same number. */
export function ReissueDialog({ copy, open, onClose }: { copy: ControlledCopyDto | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ issuedOn: dayjs.Dayjs }>();
  const act = useCopyAction();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ issuedOn: dayjs() });
  }, [open, form]);
  if (!copy) return null;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Issue ${copy.docNo} ${copy.currentRevision ?? ''} to ${copy.holder}`}
      okText="Issue"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/design/copies/${copy.id}/reissue`, body: { issuedOn: ymd(v.issuedOn) } });
        notify.saved(`${copyLabel(copy.copyNo)} of ${copy.currentRevision} issued to ${copy.holder}`);
      }}
    >
      <Typography.Paragraph type="secondary">{`${copyLabel(copy.copyNo)} keeps its number. The ${copy.revision} print stays on the list until it is taken back.`}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="issuedOn" label="Issued on" rules={[{ required: true, message: 'Choose the day the copy went out' }]}>
          <DatePicker disabledDate={afterToday} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
