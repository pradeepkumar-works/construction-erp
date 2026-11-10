'use client';

import React, { useEffect, useRef } from 'react';
import { Alert, Form, Input, InputNumber, Radio, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ASSET_CLASSES,
  ASSET_CLASS_CODES,
  ASSET_FUNDINGS,
  ASSET_FUNDING_LABELS,
  DEPRECIATION_METHODS,
  DEPRECIATION_METHOD_LABELS,
  RECEIPT_MODES,
  RECEIPT_MODE_LABELS,
  STANDARD_RESIDUAL_PCT,
  disposalResult,
  financialYearOf,
  openingAsOfNeeded,
  runPeriodLabel,
  type AssetClassCode,
  type AssetFunding,
  type DepreciationMethod,
  type DepreciationRunDetailDto,
  type FixedAssetDetailDto,
  type PaymentMode,
} from '@erp/shared';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { useBooksYear } from '@/lib/queries';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { DatePicker } from '@/components/common/DatePicker';
import { HEAD_OFFICE, ProjectSelect } from '@/components/common/ProjectSelect';
import { VendorSelect } from '@/components/common/SearchSelect';
import { invalidateAssets } from './assetUi';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const CLASS_OPTIONS = ASSET_CLASS_CODES.map((c) => ({ value: c, label: `${ASSET_CLASSES[c].label} · ${ASSET_CLASSES[c].lifeYears} years` }));

/** A machine the form starts from: "Make asset" on an owned machine. */
export interface MachineSeed {
  id: string;
  code: string;
  name: string;
  projectId: string | null;
}

interface AssetValues {
  name?: string;
  assetClass?: AssetClassCode;
  method: DepreciationMethod;
  cost?: number | null;
  residual?: number | null;
  lifeYears?: number | null;
  putToUseOn?: dayjs.Dayjs;
  fundedBy: AssetFunding;
  vendorId?: string | null;
  invoiceNo?: string;
  serialNo?: string;
  projectId?: string;
  before: boolean;
  openingAsOf?: dayjs.Dayjs | null;
  openingDepreciation?: number | null;
  note?: string;
}

/**
 * Add an asset to the register, make one of an owned machine, or change one. The residual and life fill in from the
 * class as the standard 5% and Schedule II life; once a posted run charges the asset only its name, papers and note change.
 */
export function AssetFormDrawer({ open, onClose, asset, machine, onSaved }: { open: boolean; onClose: () => void; asset?: FixedAssetDetailDto | null; machine?: MachineSeed | null; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<AssetValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const fixed = !!asset && (asset.charged || asset.status === 'DISPOSED');
  const watch = Form.useWatch([], form) as AssetValues | undefined;
  const cls = watch?.assetClass ? ASSET_CLASSES[watch.assetClass] : null;
  const booksFrom = useBooksYear().data?.booksFrom ?? null;
  const putToUseOn = ymd(watch?.putToUseOn);
  // Put to use before the books begin, its depreciation till then is in the opening balances: the form asks for it.
  const openingDay = !fixed && putToUseOn && watch?.fundedBy ? openingAsOfNeeded({ putToUseOn, fundedBy: watch.fundedBy }, booksFrom) : null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (asset)
      form.setFieldsValue({
        name: asset.name,
        assetClass: asset.assetClass,
        method: asset.method,
        cost: toNumber(asset.cost),
        residual: toNumber(asset.residual),
        lifeYears: asset.lifeYears,
        putToUseOn: dayjs(asset.putToUseOn),
        fundedBy: asset.fundedBy,
        vendorId: asset.vendorId,
        invoiceNo: asset.invoiceNo ?? undefined,
        serialNo: asset.serialNo ?? undefined,
        before: !!asset.openingAsOf,
        openingAsOf: asset.openingAsOf ? dayjs(asset.openingAsOf) : null,
        openingDepreciation: asset.openingAsOf ? toNumber(asset.openingDepreciation) : null,
        note: asset.note ?? undefined,
      });
    else form.setFieldsValue({ method: 'SLM', fundedBy: machine ? 'IN_BOOKS' : 'BANK', before: false, name: machine ? `${machine.code} ${machine.name}` : undefined, projectId: machine?.projectId ?? HEAD_OFFICE });
  }, [open, asset, machine, form]);

  useEffect(() => {
    if (open && openingDay) form.setFieldsValue({ before: true, openingAsOf: dayjs(openingDay) });
  }, [open, openingDay, form]);

  const saved = useRef<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (v: AssetValues) => {
      const head = { name: v.name?.trim(), invoiceNo: v.invoiceNo?.trim() || null, serialNo: v.serialNo?.trim() || null, note: v.note?.trim() || null };
      const terms = {
        assetClass: v.assetClass,
        method: v.method,
        cost: v.cost,
        residual: v.residual ?? null,
        lifeYears: v.lifeYears ?? null,
        putToUseOn: ymd(v.putToUseOn),
        fundedBy: v.fundedBy,
        vendorId: v.fundedBy === 'VENDOR' ? (v.vendorId ?? null) : null,
        openingAsOf: v.before ? ymd(v.openingAsOf) : null,
        openingDepreciation: v.before ? (v.openingDepreciation ?? 0) : null,
      };
      const body = fixed ? head : { ...head, ...terms };
      if (asset) return (await api.patch<FixedAssetDetailDto>(`/fixed-assets/${asset.id}`, body)).data;
      const place = v.projectId && v.projectId !== HEAD_OFFICE ? v.projectId : null;
      return (await api.post<FixedAssetDetailDto>('/fixed-assets', { ...body, projectId: place, equipmentId: machine?.id ?? null })).data;
    },
    onSuccess: (a) => {
      notify.saved(`${a.assetNo} ${asset ? 'saved' : 'added to the register'}`, `/fixed-assets/${a.id}`);
      invalidateAssets(qc);
      saved.current = a.id;
    },
    meta: FAIL_NOTICE,
  });

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
      title={asset ? `Edit asset · ${asset.assetNo}` : machine ? `Make asset · ${machine.code}` : 'New fixed asset'}
      okText={asset ? 'Save' : 'Add asset'}
      projectDefault={false}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={asset || machine ? undefined : 'fixed-asset'}
    >
      <Form form={form} layout="vertical">
        {fixed ? <Alert type="info" showIcon style={{ marginBottom: tk.space[4] }} title="A posted run has charged it, so only its name, papers and note can change" /> : null}
        <FormSection title="Asset">
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the asset, e.g. Dell Latitude 5440' }]}>
            <Input maxLength={160} placeholder="Dell Latitude 5440" />
          </Form.Item>
          <Form.Item name="assetClass" label="Class" rules={[{ required: true, message: 'Choose the class it is filed under' }]} extra={cls ? `Income Tax block: ${cls.itBlock === 'PLANT' ? 'plant and machinery' : cls.itBlock.toLowerCase()}` : undefined}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              options={CLASS_OPTIONS}
              disabled={fixed}
              aria-label="Class"
              onChange={(c: AssetClassCode) => form.setFieldsValue({ lifeYears: ASSET_CLASSES[c].lifeYears })}
            />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="serialNo" label="Serial no.">
              <Input maxLength={60} translate="no" />
            </Form.Item>
            {asset ? null : (
              <Form.Item name="projectId" label="Where it is">
                <ProjectSelect headOffice allowClear={false} placeholder="Head office" aria-label="Where it is" />
              </Form.Item>
            )}
          </FormGrid>
        </FormSection>
        <FormSection title="Cost and depreciation">
          <FormGrid cols={3}>
            <Form.Item name="cost" label="Cost" rules={[{ required: true, message: 'Enter what it cost, above zero' }]}>
              <MoneyInput disabled={fixed} onChange={(c) => form.setFieldsValue({ residual: c ? Math.round(Number(c) * STANDARD_RESIDUAL_PCT) / 100 : null })} />
            </Form.Item>
            <Form.Item name="residual" label="Residual value" extra={`Usually ${STANDARD_RESIDUAL_PCT}% of the cost`}>
              <MoneyInput disabled={fixed} />
            </Form.Item>
            <Form.Item name="lifeYears" label="Useful life" rules={[{ required: true, message: 'Enter the life in years' }]} extra={cls ? `Schedule II: ${cls.lifeYears} years` : undefined}>
              <InputNumber style={{ width: '100%' }} min={1} max={100} precision={0} inputMode="numeric" suffix="years" disabled={fixed} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="putToUseOn" label="Put to use on" rules={[{ required: true, message: 'Choose the day it was put to use' }]}>
              <DatePicker style={{ width: '100%' }} disabled={fixed} />
            </Form.Item>
            <Form.Item name="method" label="Method">
              <Radio.Group disabled={fixed} options={DEPRECIATION_METHODS.map((m) => ({ value: m, label: DEPRECIATION_METHOD_LABELS[m] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="before" label="Depreciation before Nirmaan">
            <Radio.Group disabled={fixed} options={[{ value: false, label: 'None', disabled: !!openingDay }, { value: true, label: 'Charged up to a day' }]} />
          </Form.Item>
          {watch?.before ? (
            <FormGrid cols={2}>
              <Form.Item name="openingAsOf" label="Charged up to" rules={[{ required: true, message: 'Choose the last day it covers' }]} extra={openingDay && booksFrom ? `The books begin on ${formatDate(booksFrom)}` : undefined}>
                <DatePicker style={{ width: '100%' }} disabled={fixed || !!openingDay} />
              </Form.Item>
              <Form.Item name="openingDepreciation" label="Amount" rules={[{ required: true, message: 'Enter the depreciation charged by then' }]}>
                <MoneyInput disabled={fixed} />
              </Form.Item>
            </FormGrid>
          ) : null}
        </FormSection>
        <FormSection title="Paid for">
          <Form.Item name="fundedBy" label="How" extra={watch?.fundedBy === 'IN_BOOKS' ? 'Its cost is in the opening balances or a voucher already; nothing more posts.' : 'Posts its cost to the books on the day it was put to use.'}>
            <Select disabled={fixed} aria-label="How it was paid for" options={ASSET_FUNDINGS.map((f) => ({ value: f, label: ASSET_FUNDING_LABELS[f] }))} />
          </Form.Item>
          <FormGrid cols={2}>
            {watch?.fundedBy === 'VENDOR' ? (
              <Form.Item name="vendorId" label="Vendor" rules={[{ required: true, message: 'Choose the vendor it was bought from' }]}>
                <VendorSelect aria-label="Vendor" disabled={fixed} />
              </Form.Item>
            ) : null}
            <Form.Item name="invoiceNo" label="Invoice no.">
              <Input maxLength={60} translate="no" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

interface TransferValues {
  toProjectId?: string;
  on?: dayjs.Dayjs;
  note?: string;
}

/** Move an asset to another site or head office; its machine, if it is one, moves with it. */
export function TransferModal({ open, onClose, asset }: { open: boolean; onClose: () => void; asset: FixedAssetDetailDto }) {
  const [form] = Form.useForm<TransferValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ toProjectId: undefined, on: dayjs(), note: undefined });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: async (v: TransferValues) => (await api.post<FixedAssetDetailDto>(`/fixed-assets/${asset.id}/transfer`, { toProjectId: v.toProjectId === HEAD_OFFICE ? null : v.toProjectId, on: ymd(v.on), note: v.note?.trim() || null })).data,
    onSuccess: (a) => {
      notify.saved(`${a.assetNo} moved to ${a.projectName ?? 'head office'}`);
      invalidateAssets(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Move · ${asset.assetNo}`} okText="Move asset" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">Now at {asset.projectName ?? 'head office'}.</Typography.Paragraph>
        <Form.Item name="toProjectId" label="Move to" rules={[{ required: true, message: 'Choose the site, or head office' }]}>
          <ProjectSelect headOffice exclude={asset.projectId ?? undefined} placeholder="Choose the site" aria-label="Move to" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="on" label="Moved on" rules={[{ required: true, message: 'Choose the day it moved' }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input maxLength={300} placeholder="Challan or gate pass no." />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface DisposeValues {
  on?: dayjs.Dayjs;
  proceeds?: number | null;
  mode: PaymentMode;
  note?: string;
}

/** Sell or scrap an asset: what it fetched against its book value, shown before saving. */
export function DisposeModal({ open, onClose, asset }: { open: boolean; onClose: () => void; asset: FixedAssetDetailDto }) {
  const [form] = Form.useForm<DisposeValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const proceeds = Form.useWatch('proceeds', form);
  useEffect(() => {
    if (open) form.setFieldsValue({ on: dayjs(), proceeds: null, mode: 'BANK', note: undefined });
  }, [open, form]);
  const r = disposalResult({ cost: toNumber(asset.cost), accumulated: toNumber(asset.depreciation), proceeds: Number(proceeds ?? 0) });
  const mutation = useMutation({
    mutationFn: async (v: DisposeValues) => (await api.post<FixedAssetDetailDto>(`/fixed-assets/${asset.id}/dispose`, { on: ymd(v.on), proceeds: v.proceeds ?? 0, mode: v.mode, note: v.note?.trim() || null })).data,
    onSuccess: (a) => {
      notify.saved(`${a.assetNo} disposed`);
      invalidateAssets(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Sell or scrap · ${asset.assetNo}`} okText="Dispose of asset" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="on" label="Sold or scrapped on" rules={[{ required: true, message: 'Choose the day it went' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="proceeds" label="It fetched" rules={[{ required: true, message: 'Enter what it fetched, or 0 when scrapped for nothing' }]}>
            <MoneyInput />
          </Form.Item>
        </FormGrid>
        <Form.Item name="mode" label="Received in">
          <Radio.Group options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input maxLength={300} placeholder="Buyer, auction lot or scrap note" />
        </Form.Item>
        <Typography.Paragraph>
          <span translate="no">{`Book value ${formatINR(r.bookValue, true)}`}</span>
          {r.loss ? <Typography.Text type="danger" translate="no">{`, a loss of ${formatINR(r.loss, true)}`}</Typography.Text> : null}
          {r.gain ? <Typography.Text type="success" translate="no">{`, a profit of ${formatINR(r.gain, true)}`}</Typography.Text> : null}
          {'. Depreciation not yet posted is left out.'}
        </Typography.Paragraph>
      </Form>
    </FormShell>
  );
}

interface RunValues {
  span: 'month' | 'year';
  month?: dayjs.Dayjs;
  year?: string;
}

const lastMonth = () => dayjs().subtract(1, 'month');
const YEARS = (() => {
  const now = Number(financialYearOf(dayjs().format('YYYY-MM-DD')).from.slice(0, 4));
  // A run may not end after today, so the year still running is not offered.
  return [now - 1, now - 2, now - 3].map((y) => ({ value: `${y}-04-01`, label: runPeriodLabel(`${y}-04-01`, `${y + 1}-03-31`) }));
})();

/** Prepare a month's or a year's run: a draft with each asset's charge, posted from its own page. */
export function PrepareRunModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<RunValues>();
  const qc = useQueryClient();
  const span = Form.useWatch('span', form) ?? 'month';
  useEffect(() => {
    if (open) form.setFieldsValue({ span: 'month', month: lastMonth(), year: YEARS[0].value });
  }, [open, form]);
  const saved = useRef<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (v: RunValues) => {
      const period =
        v.span === 'month' ? { from: v.month!.startOf('month').format('YYYY-MM-DD'), to: v.month!.endOf('month').format('YYYY-MM-DD') } : { from: v.year!, to: `${Number(v.year!.slice(0, 4)) + 1}-03-31` };
      return (await api.post<DepreciationRunDetailDto>('/fixed-assets/runs', period)).data;
    },
    onSuccess: (r) => {
      invalidateAssets(qc);
      saved.current = r.id;
    },
    meta: FAIL_NOTICE,
  });
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
      layout="modal"
      title="Prepare depreciation"
      okText="Prepare run"
      projectDefault={false}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="span" label="For">
          <Radio.Group options={[{ value: 'month', label: 'A month' }, { value: 'year', label: 'A financial year' }]} />
        </Form.Item>
        {span === 'month' ? (
          <Form.Item name="month" label="Month" rules={[{ required: true, message: 'Choose the month' }]}>
            <DatePicker picker="month" style={{ width: '100%' }} disabledDate={(d) => d.endOf('month').isAfter(dayjs(), 'day')} />
          </Form.Item>
        ) : (
          <Form.Item name="year" label="Financial year" rules={[{ required: true, message: 'Choose the year' }]}>
            <Select aria-label="Financial year" options={YEARS} />
          </Form.Item>
        )}
        <Typography.Paragraph type="secondary">A draft first: check each asset’s charge, then post it to the books.</Typography.Paragraph>
      </Form>
    </FormShell>
  );
}
