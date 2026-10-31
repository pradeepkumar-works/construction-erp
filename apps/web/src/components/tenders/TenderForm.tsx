'use client';

import React, { useEffect, useRef } from 'react';
import { Form, Input, InputNumber, Radio, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AttachmentDto, TenderBidType, TenderDetailDto } from '@erp/shared';
import { TENDER_BID_TYPES, TENDER_BID_TYPE_LABELS } from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useMasterList, useSorBooks, useTenderAction } from '@/lib/queries';
import { toNumber } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, MoneyInput } from '@/components/form/inputs';
import { ClientSelect } from '@/components/common/SearchSelect';
import { PhotoUpload } from '@/components/common/PhotoUpload';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);

interface Values {
  tenderNo?: string;
  nitNo?: string;
  title?: string;
  clientId?: string | null;
  clientName?: string;
  location?: string;
  /** Its vertical (item 167) */
  verticalCode?: string | null;
  bidType: TenderBidType;
  sorBookId?: string | null;
  estimatedValue?: number | null;
  completionMonths?: number | null;
  publishedOn?: dayjs.Dayjs | null;
  submitBy?: dayjs.Dayjs;
  overheadPct?: number;
  profitPct?: number;
  tenderFee?: number | null;
  emdAmount?: number | null;
  emdReference?: string;
  emdIssuer?: string;
  emdExpiresOn?: dayjs.Dayjs | null;
  note?: string;
  docs?: AttachmentDto[];
}

/**
 * Record a tender (v6 item 110) or change its register entry: the notice, client, dates, how it is priced (one
 * percentage on the SOR or a rate per item, against which schedule, with what overheads and profit) and the EMD, which
 * is kept with the guarantees. The bid BOQ is priced on the tender's page.
 */
export function TenderForm({ open, onClose, tender, onSaved }: { open: boolean; onClose: () => void; tender?: TenderDetailDto | null; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<Values>();
  const notify = useNotify();
  const save = useTenderAction();
  const { data: books } = useSorBooks(open);
  const { data: verticals } = useMasterList('vertical', false, open);
  const editing = !!tender;
  const pricingFixed = !!tender && tender.status !== 'PREPARING';
  const saved = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (tender)
      form.setFieldsValue({
        tenderNo: tender.tenderNo,
        nitNo: tender.nitNo ?? undefined,
        title: tender.title,
        clientId: tender.clientId,
        clientName: tender.clientId ? undefined : (tender.clientName ?? undefined),
        location: tender.location ?? undefined,
        verticalCode: tender.verticalCode,
        bidType: tender.bidType,
        sorBookId: tender.sorBookId,
        estimatedValue: tender.estimatedValue ? toNumber(tender.estimatedValue) : null,
        completionMonths: tender.completionMonths,
        publishedOn: tender.publishedOn ? dayjs(tender.publishedOn) : null,
        submitBy: dayjs(tender.submitBy),
        overheadPct: toNumber(tender.overheadPct),
        profitPct: toNumber(tender.profitPct),
        tenderFee: tender.tenderFee ? toNumber(tender.tenderFee) : null,
        emdAmount: tender.emd?.amount ? toNumber(tender.emd.amount) : null,
        emdReference: tender.emd?.reference,
        emdIssuer: tender.emd?.issuer ?? undefined,
        emdExpiresOn: tender.emd?.expiresOn ? dayjs(tender.emd.expiresOn) : null,
        note: tender.note ?? undefined,
        docs: tender.attachments,
      });
    else form.setFieldsValue({ bidType: 'PERCENTAGE', overheadPct: 10, profitPct: 8 });
  }, [open, tender, form]);

  // The first schedule of rates of a new tender, once they load.
  useEffect(() => {
    if (open && !tender && books?.length && !form.getFieldValue('sorBookId')) form.setFieldValue('sorBookId', books[0].id);
  }, [open, tender, books, form]);

  return (
    <FormShell
      open={open}
      onClose={() => {
        onClose();
        const id = saved.current;
        saved.current = null;
        if (id && onSaved) afterFormLeaves(() => onSaved(id));
      }}
      form={form}
      layout="drawer"
      width={760}
      projectDefault={false}
      title={editing ? `Edit tender · ${tender.tenderNo}` : 'New tender'}
      okText={editing ? 'Save' : 'Record tender'}
      draftKey={editing ? undefined : 'tender'}
      onSubmit={async (v) => {
        const body = {
          ...(editing ? { tenderNo: v.tenderNo?.trim() } : { tenderNo: v.tenderNo?.trim() || null }),
          nitNo: v.nitNo?.trim() || null,
          title: v.title?.trim(),
          clientId: v.clientId ?? null,
          clientName: v.clientId ? null : v.clientName?.trim() || null,
          location: v.location?.trim() || null,
          verticalCode: v.verticalCode || null,
          submitBy: ymd(v.submitBy),
          publishedOn: ymd(v.publishedOn),
          completionMonths: v.completionMonths ?? null,
          tenderFee: v.tenderFee ?? null,
          emdAmount: v.emdAmount ?? null,
          emdReference: v.emdReference?.trim() || null,
          emdIssuer: v.emdIssuer?.trim() || null,
          emdExpiresOn: ymd(v.emdExpiresOn),
          note: v.note?.trim() || null,
          attachmentIds: (v.docs ?? []).map((a) => a.id),
          ...(pricingFixed
            ? {}
            : { bidType: v.bidType, sorBookId: v.sorBookId ?? null, estimatedValue: v.estimatedValue ?? null, overheadPct: v.overheadPct ?? 0, profitPct: v.profitPct ?? 0 }),
        };
        const t = await save.mutateAsync(editing ? { method: 'patch', path: `/tenders/${tender.id}`, body } : { path: '/tenders', body });
        notify.saved(editing ? `Tender ${t.tenderNo} saved` : `Tender ${t.tenderNo} recorded: price its bid BOQ next`, `/tenders/${t.id}`);
        saved.current = t.id;
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Notice">
          <Form.Item name="title" label="Name of work" rules={[{ required: true, whitespace: true, message: 'Enter the name of work as the notice gives it' }]}>
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} maxLength={300} placeholder="Improvement of Khurda-Begunia road, km 0.000 to 14.200" />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="nitNo" label="NIT number">
              <Input maxLength={80} placeholder="OWD/RD/NIT-14/2026-27" {...CODE_INPUT} />
            </Form.Item>
            <Form.Item name="tenderNo" label="Our number" extra={editing ? undefined : 'Leave blank for the next number'} rules={editing ? [{ required: true, whitespace: true, message: 'Enter our tender number' }] : undefined}>
              <Input maxLength={40} placeholder="TND-2026-0005" {...CODE_INPUT} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="clientId" label="Client" extra="From the client master; or type the name below">
              <ClientSelect allowClear aria-label="Client" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(a, b) => a.clientId !== b.clientId}>
              {() => (
                <Form.Item name="clientName" label="Client not in the master">
                  <Input maxLength={160} disabled={!!form.getFieldValue('clientId')} placeholder="Executive Engineer, R&B Division" />
                </Form.Item>
              )}
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="location" label="Location">
              <Input maxLength={160} placeholder="Khurda" />
            </Form.Item>
            <Form.Item name="verticalCode" label="Vertical">
              <Select allowClear placeholder="No vertical" options={(verticals?.entries ?? []).filter((e) => e.isActive || e.code === tender?.verticalCode).map((e) => ({ value: e.code, label: e.name }))} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="publishedOn" label="Published on">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="submitBy" label="Submit by" rules={[{ required: true, message: 'Choose the last date to submit' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="completionMonths" label="Time for completion">
              <InputNumber min={1} max={240} precision={0} suffix="months" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="tenderFee" label="Tender fee">
              <MoneyInput />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Pricing">
          <Form.Item name="bidType" label="Quoted as" extra={pricingFixed ? 'The bid has gone in: its pricing stays as it is.' : undefined}>
            <Radio.Group disabled={pricingFixed} options={TENDER_BID_TYPES.map((t) => ({ value: t, label: TENDER_BID_TYPE_LABELS[t] }))} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="sorBookId" label="Schedule of rates" extra="The SOR the client's estimate is built on">
              <Select allowClear disabled={pricingFixed} placeholder="Choose the schedule" options={(books ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            </Form.Item>
            <Form.Item name="estimatedValue" label="Estimate (put to tender)" extra="Used when the bid BOQ has no SOR rates">
              <MoneyInput disabled={pricingFixed} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="overheadPct" label="Overheads on cost" rules={[{ required: true, message: 'Enter overheads, 0 if none' }]}>
              <InputNumber min={0} max={100} precision={2} suffix="%" disabled={pricingFixed} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="profitPct" label="Profit on cost" rules={[{ required: true, message: 'Enter profit, 0 if none' }]}>
              <InputNumber min={0} max={100} precision={2} suffix="%" disabled={pricingFixed} style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="EMD">
          <FormGrid cols={2}>
            <Form.Item name="emdAmount" label="EMD amount" extra="Kept with Guarantees and licences until it comes back">
              <MoneyInput />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(a, b) => a.emdAmount !== b.emdAmount}>
              {() => (
                <Form.Item name="emdReference" label="DD, BG or receipt no." rules={form.getFieldValue('emdAmount') ? [{ required: true, whitespace: true, message: "Enter the EMD's DD, BG or receipt number" }] : undefined}>
                  <Input maxLength={80} placeholder="DD 004512" {...CODE_INPUT} />
                </Form.Item>
              )}
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="emdIssuer" label="Bank">
              <Input maxLength={120} placeholder="State Bank of India" />
            </Form.Item>
            <Form.Item name="emdExpiresOn" label="Valid until">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Note and documents">
          <Form.Item name="note" label="Note">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} placeholder="Pre-bid meeting on 4 Nov; site visit done" />
          </Form.Item>
          <Form.Item name="docs" label="Documents" extra="The notice, the client's BOQ, corrigenda (photo or PDF)">
            <PhotoUpload max={8} />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
