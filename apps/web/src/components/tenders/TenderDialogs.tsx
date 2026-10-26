'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Checkbox, Form, Input, InputNumber, Radio, Select, Switch, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import type { ProjectType, TenderDetailDto, TenderStatus } from '@erp/shared';
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, sorPctLabel } from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useTenderAction } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, MoneyInput } from '@/components/form/inputs';
import { UserSelect } from '@/components/common/SearchSelect';
import { ExcelImportModal, type ImportField } from '@/components/common/ExcelImportModal';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const notAfterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');

/** Record the bid as gone in: its pricing is fixed from then on. */
export function SubmitDialog({ tender, open, onClose }: { tender: TenderDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ submittedOn: dayjs.Dayjs }>();
  const act = useTenderAction();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ submittedOn: dayjs().isAfter(dayjs(tender.submitBy)) ? dayjs(tender.submitBy) : dayjs() });
  }, [open, tender.submitBy, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Record bid submitted · ${tender.tenderNo}`}
      okText="Record submitted"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/tenders/${tender.id}/submit`, body: { submittedOn: ymd(v.submittedOn) } });
        notify.saved(`Bid for ${tender.tenderNo} recorded as submitted`);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph translate="no">
          {`Our quote ${formatINR(tender.totals.quotedAmount, true)}${tender.totals.quotedPct ? `, ${sorPctLabel(tender.totals.quotedPct).toLowerCase()} the SOR` : ''}. The bid BOQ and its pricing are fixed once it is in.`}
        </Typography.Paragraph>
        <Form.Item name="submittedOn" label="Submitted on" rules={[{ required: true, message: 'Choose the date the bid went in' }]}>
          <DatePicker disabledDate={notAfterToday} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

const MOVE_TEXT: Partial<Record<TenderStatus, { title: string; ok: string; note: string; done: string }>> = {
  WON: { title: 'Record tender won', ok: 'Record won', note: 'Letter of acceptance no., the award', done: 'won' },
  LOST: { title: 'Record tender lost', ok: 'Record lost', note: 'Who won and at what, e.g. L1 at 2% below', done: 'lost' },
  DROPPED: { title: 'Record not bidding', ok: 'Record not bid', note: 'Why we are not bidding', done: 'marked not bid' },
  CANCELLED: { title: 'Record the tender cancelled', ok: 'Record cancelled', note: 'The client’s notice of cancellation', done: 'marked cancelled' },
};

/** The result, not bidding or a cancellation, with its date and a note. */
export function StatusDialog({ tender, status, onClose }: { tender: TenderDetailDto; status: TenderStatus | null; onClose: () => void }) {
  const [form] = Form.useForm<{ on: dayjs.Dayjs; note?: string }>();
  const act = useTenderAction();
  const notify = useNotify();
  const text = status ? MOVE_TEXT[status] : undefined;
  useEffect(() => {
    if (status) form.setFieldsValue({ on: dayjs(), note: undefined });
  }, [status, form]);
  return (
    <FormShell
      open={!!text}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`${text?.title ?? ''} · ${tender.tenderNo}`}
      okText={text?.ok ?? 'Save'}
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/tenders/${tender.id}/status`, body: { status, on: ymd(v.on), note: v.note?.trim() || null } });
        notify.saved(`Tender ${tender.tenderNo} ${text?.done}`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="on" label="On" rules={[{ required: true, message: 'Choose the date' }]}>
          <DatePicker disabledDate={notAfterToday} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder={text?.note} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Another bidder's price as read out at opening: an amount, or a percentage on the SOR value. */
export function BidDialog({ tender, open, onClose }: { tender: TenderDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ bidderName: string; as: 'amount' | 'pct'; amount?: number | null; pct?: number | null; note?: string }>();
  const act = useTenderAction();
  const notify = useNotify();
  const as = Form.useWatch('as', form);
  useEffect(() => {
    if (open) form.setFieldsValue({ bidderName: '', as: tender.bidType === 'PERCENTAGE' && tender.totals.sorAmount ? 'pct' : 'amount', amount: null, pct: null, note: undefined });
  }, [open, tender.bidType, tender.totals.sorAmount, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Add a bid · ${tender.tenderNo}`}
      okText="Add bid"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/tenders/${tender.id}/bids`, body: { bidderName: v.bidderName.trim(), ...(v.as === 'pct' ? { pct: v.pct } : { amount: v.amount }), note: v.note?.trim() || null } });
        notify.saved(`${v.bidderName.trim()}'s bid added`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="bidderName" label="Bidder" rules={[{ required: true, whitespace: true, message: 'Enter the bidder' }]}>
          <Input maxLength={160} placeholder="Kalinga Constructions" />
        </Form.Item>
        <Form.Item name="as" label="Their bid as">
          <Radio.Group
            options={[
              { value: 'amount', label: 'An amount' },
              { value: 'pct', label: 'A percentage on the SOR', disabled: !tender.totals.sorAmount },
            ]}
          />
        </Form.Item>
        {as === 'pct' ? (
          <Form.Item name="pct" label="Above (+) or below (-) the SOR" rules={[{ required: true, message: 'Enter the percentage, e.g. -2.5 for 2.5% below' }]} extra={`On the SOR value of ${formatINR(tender.totals.sorAmount)}`}>
            <InputNumber min={-99.99} max={999.99} precision={2} suffix="%" style={{ width: '100%' }} />
          </Form.Item>
        ) : (
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the bid amount' }]}>
            <MoneyInput />
          </Form.Item>
        )}
        <Form.Item name="note" label="Note">
          <Input maxLength={300} placeholder="Technically qualified" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The EMD of a tender not won comes back: the guarantees entry is released. */
export function EmdReturnedDialog({ tender, open, onClose }: { tender: TenderDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ on: dayjs.Dayjs; note?: string }>();
  const act = useTenderAction();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ on: dayjs(), note: undefined });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`EMD returned · ${tender.tenderNo}`}
      okText="Record returned"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/tenders/${tender.id}/emd-returned`, body: { on: ymd(v.on), note: v.note?.trim() || null } });
        notify.saved(`EMD ${tender.emd?.reference ?? ''} recorded as returned`);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph translate="no">{`${tender.emd?.reference ?? ''}, ${formatINR(tender.emd?.amount, true)}${tender.emd?.issuer ? ` from ${tender.emd.issuer}` : ''}`}</Typography.Paragraph>
        <Form.Item name="on" label="Returned on" rules={[{ required: true, message: 'Choose the date the EMD came back' }]}>
          <DatePicker disabledDate={notAfterToday} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input maxLength={300} placeholder="Refunded to the current account" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface ProjectValues {
  code: string;
  name?: string;
  type: ProjectType;
  startDate?: dayjs.Dayjs;
  projectManagerId?: string | null;
  agreementNo?: string;
  applyTemplate?: boolean;
  withGuarantee?: boolean;
  guarantee?: { reference?: string; issuer?: string; amount?: number | null; expiresOn?: dayjs.Dayjs | null };
}

/** A won tender becomes a project: its BOQ at the quoted rates, the analysis, the budget and the guarantees. */
export function MakeProjectDialog({ tender, open, onClose }: { tender: TenderDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<ProjectValues>();
  const act = useTenderAction<{ projectId: string; projectCode: string }>();
  const notify = useNotify();
  const router = useRouter();
  const made = useRef<string | null>(null);
  const withGuarantee = Form.useWatch('withGuarantee', form);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    // A performance guarantee is commonly 3% of the contract value.
    form.setFieldsValue({ name: tender.title.slice(0, 200), type: 'ROAD', startDate: dayjs(), applyTemplate: true, withGuarantee: false, guarantee: { amount: Math.round(toNumber(tender.quotedAmount) * 0.03) } });
  }, [open, tender.title, tender.quotedAmount, form]);
  return (
    <FormShell
      open={open}
      onClose={() => {
        onClose();
        const id = made.current;
        made.current = null;
        if (id) afterFormLeaves(() => router.push(`/projects/${id}`));
      }}
      form={form}
      layout="drawer"
      width={640}
      projectDefault={false}
      title={`Make the project · ${tender.tenderNo}`}
      okText="Make the project"
      onSubmit={async (v) => {
        const r = await act.mutateAsync({
          path: `/tenders/${tender.id}/project`,
          body: {
            code: v.code.trim(),
            name: v.name?.trim() || undefined,
            type: v.type,
            startDate: ymd(v.startDate) ?? undefined,
            projectManagerId: v.projectManagerId ?? null,
            agreementNo: v.agreementNo?.trim() || null,
            applyTemplate: !!v.applyTemplate,
            ...(v.withGuarantee && v.guarantee ? { guarantee: { reference: v.guarantee.reference?.trim(), issuer: v.guarantee.issuer?.trim() || null, amount: v.guarantee.amount, expiresOn: ymd(v.guarantee.expiresOn) } } : {}),
          },
        });
        notify.saved(`Project ${r.projectCode} made from tender ${tender.tenderNo}`, `/projects/${r.projectId}`);
        made.current = r.projectId;
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph>
          <span>{`The project takes the ${tender.totals.itemCount} bid items at the quoted rates (contract value `}</span>
          <span translate="no">{formatINR(tender.totals.quotedAmount, true)}</span>
          <span>), their rate analysis as material norms and resources, the cost budget from the analysis, and the EMD.</span>
        </Typography.Paragraph>
        <FormSection title="Project">
          <FormGrid cols={2}>
            <Form.Item name="code" label="Project code" rules={[{ required: true, whitespace: true, message: 'Enter a project code, e.g. RD-014' }]}>
              <Input maxLength={30} placeholder="RD-014" {...CODE_INPUT} />
            </Form.Item>
            <Form.Item name="type" label="Kind of project" rules={[{ required: true, message: 'Choose the kind of project' }]}>
              <Select options={PROJECT_TYPES.filter((t) => t !== 'PLANT' && t !== 'STORE').map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="name" label="Name">
            <Input maxLength={200} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="startDate" label="Start date" extra={tender.completionMonths ? `Ends ${tender.completionMonths} months later` : undefined}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="agreementNo" label="Agreement no.">
              <Input maxLength={80} placeholder="Agreement No. 14/2026-27" {...CODE_INPUT} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="projectManagerId" label="Project manager">
            <UserSelect allowClear roles={['PROJECT_MANAGER']} aria-label="Project manager" />
          </Form.Item>
          <Form.Item name="applyTemplate" valuePropName="checked">
            <Checkbox>Add the standard activities for this kind of project</Checkbox>
          </Form.Item>
        </FormSection>
        <FormSection title="Performance guarantee">
          <Form.Item name="withGuarantee" label="Given on award" valuePropName="checked">
            <Switch />
          </Form.Item>
          {withGuarantee ? (
            <>
              <FormGrid cols={2}>
                <Form.Item name={['guarantee', 'reference']} label="Guarantee no." rules={[{ required: true, whitespace: true, message: 'Enter the guarantee number' }]}>
                  <Input maxLength={80} placeholder="BG 0045/2026" {...CODE_INPUT} />
                </Form.Item>
                <Form.Item name={['guarantee', 'amount']} label="Amount" rules={[{ required: true, message: 'Enter the guarantee amount' }]}>
                  <MoneyInput />
                </Form.Item>
              </FormGrid>
              <FormGrid cols={2}>
                <Form.Item name={['guarantee', 'issuer']} label="Bank">
                  <Input maxLength={120} placeholder="State Bank of India" />
                </Form.Item>
                <Form.Item name={['guarantee', 'expiresOn']} label="Valid until">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </FormGrid>
            </>
          ) : null}
        </FormSection>
      </Form>
    </FormShell>
  );
}

const BOQ_FIELDS: ImportField[] = [
  { key: 'itemNo', label: 'Item no.', required: true, aliases: ['itemno', 'item', 'sno', 'slno', 'no', 'srno'] },
  { key: 'description', label: 'Description', required: true, aliases: ['description', 'desc', 'descriptionofitem', 'particulars', 'work'] },
  { key: 'unit', label: 'Unit', required: true, aliases: ['unit', 'uom', 'units'] },
  { key: 'qty', label: 'Quantity', required: true, aliases: ['qty', 'quantity', 'boqqty', 'tenderqty'], numeric: true },
  { key: 'sorCode', label: 'SOR code', required: false, aliases: ['sorcode', 'sorno', 'sor', 'code', 'sorref'] },
  { key: 'sorRate', label: 'SOR rate', required: false, aliases: ['sorrate', 'rate', 'estimatedrate', 'unitrate'], numeric: true },
];

/** The client's BOQ from Excel into the bid, matched to the tender's schedule by SOR code. */
export function BidBoqImport({ tender, open, onClose }: { tender: TenderDetailDto; open: boolean; onClose: () => void }) {
  const act = useTenderAction<{ added: number; matched: number; unmatched: number }>();
  const notify = useNotify();
  const [replace, setReplace] = useState(false);
  return (
    <ExcelImportModal
      open={open}
      onClose={onClose}
      title={`Import the bid BOQ · ${tender.tenderNo}`}
      hint="The first sheet is read: item number, description, unit and quantity, with the SOR code (matched to the tender's schedule) or the SOR rate where the client's BOQ gives them."
      fields={BOQ_FIELDS}
      noun="item"
      template={{
        fileName: 'Bid-BOQ-template.xlsx',
        rows: [
          ['Item no.', 'Description', 'Unit', 'Quantity', 'SOR code', 'SOR rate'],
          ['1', 'Earthwork in excavation by mechanical means in ordinary soil', 'cum', 18500, '2.1', ''],
          ['2', 'Granular sub-base, grading II', 'cum', 9800, '3.2', ''],
        ],
      }}
      extra={
        tender.items.length ? (
          <Checkbox checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ marginBottom: 12 }}>
            {`Replace the ${tender.items.length} items already in the bid (and their rate analysis)`}
          </Checkbox>
        ) : null
      }
      onImport={async (rows) => {
        const r = await act.mutateAsync({ path: `/tenders/${tender.id}/items/import`, body: { replace, items: rows } });
        notify.saved(`${r.added} item${r.added === 1 ? '' : 's'} imported${r.matched ? `, ${r.matched} matched to the SOR` : ''}${r.unmatched ? `; ${r.unmatched} SOR code${r.unmatched === 1 ? ' was' : 's were'} not in the schedule` : ''}`);
      }}
    />
  );
}

const SOR_FIELDS: ImportField[] = [
  { key: 'code', label: 'Item code', required: true, aliases: ['code', 'itemcode', 'itemno', 'sorno', 'no', 'sno', 'slno'] },
  { key: 'chapter', label: 'Chapter', required: false, aliases: ['chapter', 'section', 'head', 'group'] },
  { key: 'description', label: 'Description', required: true, aliases: ['description', 'desc', 'item', 'particulars', 'specification'] },
  { key: 'unit', label: 'Unit', required: true, aliases: ['unit', 'uom', 'units', 'per'] },
  { key: 'rate', label: 'Rate', required: true, aliases: ['rate', 'rateinrs', 'raters', 'amount', 'unitrate'], numeric: true },
];

/** A schedule of rates from Excel: new codes added, known ones updated. */
export function SorImport({ book, open, onClose }: { book: { id: string; name: string } | null; open: boolean; onClose: () => void }) {
  const act = useTenderAction<{ added: number; updated: number; unchanged: number }>();
  const notify = useNotify();
  return (
    <ExcelImportModal
      open={open && !!book}
      onClose={onClose}
      title={`Import rates · ${book?.name ?? ''}`}
      hint="The first sheet is read: item code, description, unit and rate, and the chapter if the sheet has one. A code already in the schedule takes the new figures."
      fields={SOR_FIELDS}
      noun="item"
      check={(r) => (Number(r.rate) < 0 ? 'The rate is below zero' : null)}
      template={{
        fileName: 'Schedule-of-rates-template.xlsx',
        rows: [
          ['Code', 'Chapter', 'Description', 'Unit', 'Rate'],
          ['2.1', 'Earthwork', 'Earthwork in excavation by mechanical means in ordinary soil, lead up to 1 km', 'cum', 168],
          ['5.3', 'Concrete', 'RCC M25 in superstructure, concrete only', 'cum', 8960],
        ],
      }}
      onImport={async (rows) => {
        const r = await act.mutateAsync({ path: `/sor-books/${book!.id}/import`, body: { rows } });
        notify.saved(`${book!.name}: ${r.added} added, ${r.updated} updated${r.unchanged ? `, ${r.unchanged} unchanged` : ''}`);
      }}
    />
  );
}
