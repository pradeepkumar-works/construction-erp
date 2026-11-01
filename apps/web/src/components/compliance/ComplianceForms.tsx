'use client';

import React, { useEffect, useState } from 'react';
import { App, AutoComplete, Form, Input, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ComplianceDocDetailDto, ComplianceDocDto, ComplianceDocKind } from '@erp/shared';
import { COMPLIANCE_AMOUNT_LABELS, COMPLIANCE_CATEGORIES, COMPLIANCE_DOC_KINDS, COMPLIANCE_DOC_KIND_LABELS, COMPLIANCE_ISSUER_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatDate } from '@/lib/format';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

/** A form on a register entry: add or correct one, renew it, or close it as released or invoked. */
export type ComplianceAction =
  | { kind: 'new' }
  | { kind: 'edit'; doc: ComplianceDocDto }
  | { kind: 'renew'; doc: ComplianceDocDto }
  | { kind: 'release'; doc: ComplianceDocDto }
  | { kind: 'invoke'; doc: ComplianceDocDto };

interface Values {
  kind?: ComplianceDocKind;
  category?: string;
  reference?: string;
  issuer?: string;
  projectId?: string | null;
  beneficiary?: string;
  amount?: number | null;
  margin?: number | null;
  issuedOn?: dayjs.Dayjs | null;
  expiresOn?: dayjs.Dayjs | null;
  claimUntil?: dayjs.Dayjs | null;
  date?: dayjs.Dayjs | null;
  note?: string;
  scans?: AttachmentDto[];
}

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const str = (n?: number | null) => (n === null || n === undefined ? null : String(n));
const t = (v?: string) => v?.trim() || null;

const TITLES: Record<ComplianceAction['kind'], string> = { new: 'New guarantee or licence', edit: 'Edit guarantee or licence', renew: 'Renew guarantee', release: 'Record release', invoke: 'Record invocation' };
const OK: Record<ComplianceAction['kind'], string> = { new: 'Save', edit: 'Save', renew: 'Renew guarantee', release: 'Record release', invoke: 'Record invocation' };

export function ComplianceFormModal({ action, onClose, onDone }: { action: ComplianceAction | null; onClose: () => void; onDone?: (id: string) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mode = action?.kind;
  const doc = action && action.kind !== 'new' ? action.doc : null;
  const watched = Form.useWatch('kind', form);
  const kind: ComplianceDocKind = doc?.kind ?? watched ?? 'BANK_GUARANTEE';

  useEffect(() => {
    if (!action) return;
    form.resetFields();
    const d = action.kind !== 'new' ? action.doc : null;
    if (action.kind === 'new') form.setFieldsValue({ kind: 'BANK_GUARANTEE' });
    else if (action.kind === 'edit')
      form.setFieldsValue({
        category: d!.category ?? undefined,
        reference: d!.reference,
        issuer: d!.issuer ?? undefined,
        projectId: d!.projectId,
        beneficiary: d!.beneficiary ?? undefined,
        amount: d!.amount ? Number(d!.amount) : null,
        margin: d!.margin ? Number(d!.margin) : null,
        issuedOn: d!.issuedOn ? dayjs(d!.issuedOn) : null,
        expiresOn: d!.expiresOn ? dayjs(d!.expiresOn) : null,
        claimUntil: d!.claimUntil ? dayjs(d!.claimUntil) : null,
        note: d!.note ?? undefined,
        scans: d!.attachments,
      });
    else if (action.kind === 'renew') {
      const from = d!.expiresOn && dayjs(d!.expiresOn).isAfter(dayjs().subtract(1, 'day')) ? dayjs(d!.expiresOn).add(1, 'day') : dayjs();
      form.setFieldsValue({ reference: d!.reference, amount: d!.amount ? Number(d!.amount) : null, issuedOn: from, expiresOn: from.add(1, 'year').subtract(1, 'day') });
    } else form.setFieldsValue({ date: dayjs() });
  }, [action, form]);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const scans = v.scans ? v.scans.map((a) => a.id) : undefined;
      const fields = {
        category: t(v.category),
        issuer: t(v.issuer),
        projectId: v.projectId || null,
        beneficiary: t(v.beneficiary),
        amount: str(v.amount),
        margin: kind === 'BANK_GUARANTEE' ? str(v.margin) : null,
        issuedOn: ymd(v.issuedOn),
        expiresOn: ymd(v.expiresOn),
        claimUntil: kind === 'BANK_GUARANTEE' ? ymd(v.claimUntil) : null,
        note: t(v.note),
        attachmentIds: scans,
      };
      switch (action!.kind) {
        case 'new':
          return (await api.post<ComplianceDocDetailDto>('/compliance-docs', { kind: v.kind, reference: v.reference?.trim(), ...fields })).data;
        case 'edit':
          return (await api.patch<ComplianceDocDetailDto>(`/compliance-docs/${doc!.id}`, { reference: v.reference?.trim(), ...fields })).data;
        case 'renew':
          return (
            await api.post<ComplianceDocDetailDto>(`/compliance-docs/${doc!.id}/renew`, {
              reference: v.reference?.trim() || undefined,
              issuedOn: ymd(v.issuedOn) ?? undefined,
              expiresOn: ymd(v.expiresOn),
              claimUntil: kind === 'BANK_GUARANTEE' ? (ymd(v.claimUntil) ?? undefined) : undefined,
              amount: str(v.amount) ?? undefined,
              note: t(v.note) ?? undefined,
              attachmentIds: scans,
            })
          ).data;
        case 'release':
        case 'invoke':
          return (await api.post<ComplianceDocDetailDto>(`/compliance-docs/${doc!.id}/${action!.kind}`, { date: ymd(v.date) ?? undefined, note: t(v.note) ?? undefined })).data;
      }
    },
    onSuccess: (d) => {
      const what = `${COMPLIANCE_DOC_KIND_LABELS[d.kind]} ${d.reference}`;
      const done: Record<ComplianceAction['kind'], string> = { new: `${what} added`, edit: `${what} saved`, renew: `Renewed to ${formatDate(d.expiresOn)}`, release: `${what} released`, invoke: `${what} invoked` };
      message.success(done[action!.kind]);
      qc.invalidateQueries({ queryKey: ['compliance'] });
      onDone?.(d.id);
    },
    meta: FAIL_NOTICE,
  });

  const full = mode === 'new' || mode === 'edit';
  // Kept while the form closes, so a drawer does not turn into a modal on its way out.
  const [wasFull, setWasFull] = useState(full);
  if (action && wasFull !== full) setWasFull(full);
  const guarantee = kind === 'BANK_GUARANTEE';
  const scansField = (
    <Form.Item name="scans" label="Scans" extra="The guarantee, receipt, policy or licence (photo or PDF)">
      <PhotoUpload max={4} />
    </Form.Item>
  );

  return (
    <FormShell
      open={!!action}
      onClose={onClose}
      form={form}
      // Adding or editing an entry is a long form; renewing, releasing or invoking one is a short one.
      layout={wasFull ? 'drawer' : 'modal'}
      width={wasFull ? 720 : 520}
      title={mode ? TITLES[mode] : ''}
      okText={mode ? OK[mode] : 'Save'}
      // An entry with no project is for the whole company, so a new one does not take the header's project.
      projectDefault={false}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      {doc ? (
        <p className="text-muted" style={{ marginTop: 0 }}>
          {doc.category || COMPLIANCE_DOC_KIND_LABELS[doc.kind]} {doc.reference}
          {doc.expiresOn ? `, valid to ${formatDate(doc.expiresOn)}` : ''}
        </p>
      ) : null}
      <Form form={form} layout="vertical" requiredMark="optional" className="compliance-form">
        {full ? (
          <>
            <FormSection title="The document">
              <FormGrid cols={2}>
                <Form.Item name="kind" label="Kind" rules={[{ required: true, message: 'Choose the kind' }]}>
                  <Select disabled={mode === 'edit'} options={COMPLIANCE_DOC_KINDS.map((k) => ({ value: k, label: COMPLIANCE_DOC_KIND_LABELS[k] }))} />
                </Form.Item>
                <Form.Item name="category" label="Type">
                  <AutoComplete options={COMPLIANCE_CATEGORIES[kind].map((c) => ({ value: c }))} showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} maxLength={80} />
                </Form.Item>
                <Form.Item name="reference" label="Number" rules={[{ required: true, whitespace: true, message: 'Enter its number' }]}>
                  <Input maxLength={80} />
                </Form.Item>
                <Form.Item name="issuer" label={COMPLIANCE_ISSUER_LABELS[kind]}>
                  <Input maxLength={120} />
                </Form.Item>
                <Form.Item name="projectId" label="Project" extra="Empty: for the whole company">
                  <ProjectSelect placeholder="Company-wide" />
                </Form.Item>
                {kind === 'BANK_GUARANTEE' || kind === 'EMD' ? (
                  <Form.Item name="beneficiary" label="In favour of">
                    <Input maxLength={160} />
                  </Form.Item>
                ) : null}
              </FormGrid>
            </FormSection>
            <FormSection title="Amounts and validity">
              <FormGrid cols={2}>
                <Form.Item name="amount" label={COMPLIANCE_AMOUNT_LABELS[kind]}>
                  <MoneyInput />
                </Form.Item>
                {guarantee ? (
                  <Form.Item name="margin" label="Margin money" extra="Held by the bank against it">
                    <MoneyInput />
                  </Form.Item>
                ) : null}
                <Form.Item name="issuedOn" label="Issued on">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="expiresOn" label="Valid to" extra={kind === 'EMD' ? 'Empty until the tender result' : undefined}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                {guarantee ? (
                  <Form.Item name="claimUntil" label="Claim period to">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                ) : null}
              </FormGrid>
            </FormSection>
            <FormSection title="Note and scans">
              <Form.Item name="note" label="Note">
                <Input.TextArea rows={2} maxLength={1000} />
              </Form.Item>
              {scansField}
            </FormSection>
          </>
        ) : null}
        {mode === 'renew' ? (
          <>
            <FormGrid cols={2}>
              <Form.Item name="reference" label="New number" rules={[{ required: true, whitespace: true, message: 'Enter its number' }]}>
                <Input maxLength={80} />
              </Form.Item>
              <Form.Item name="amount" label={COMPLIANCE_AMOUNT_LABELS[kind]}>
                <MoneyInput />
              </Form.Item>
              <Form.Item name="issuedOn" label="Starts on">
                <DatePicker style={{ width: '100%' }} allowClear={false} />
              </Form.Item>
              <Form.Item name="expiresOn" label="Valid to" rules={[{ required: true, message: 'Choose the new expiry date' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              {guarantee ? (
                <Form.Item name="claimUntil" label="Claim period to">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              ) : null}
            </FormGrid>
            <Form.Item name="note" label="Note">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            {scansField}
          </>
        ) : null}
        {mode === 'release' || mode === 'invoke' ? (
          <>
            <Form.Item name="date" label={mode === 'release' ? 'Released on' : 'Invoked on'}>
              <DatePicker style={{ width: '100%' }} allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="note" label="Note" extra={mode === 'release' ? 'e.g. returned by the client after the defect liability period' : 'e.g. encashed by the client for delay'}>
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </FormShell>
  );
}
