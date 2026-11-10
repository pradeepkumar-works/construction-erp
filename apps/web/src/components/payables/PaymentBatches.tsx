'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Form, Input, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BANK_FILE_FORMATS, BANK_FILE_FORMAT_KEYS, PAYMENT_BATCH_STATUS_LABELS, canRecordPayment, type BankFileFormatKey, type PaymentBatchDetailDto, type PaymentBatchDto, type PaymentBatchStatus } from '@erp/shared';
import { PlusOutlined } from '@/components/common/icons';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { usePaymentBatches } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { useAuth } from '@/lib/auth';
import { formatDate, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { afterFormLeaves, FormShell } from '@/components/form/FormShell';
import { BatchStatusTag, batchHref, invalidateBatches } from './paymentBatchUi';

const caption: React.CSSProperties = { display: 'block', fontSize: tk.type.caption.fontSize, color: tk.color.text.muted };
const KEYS = ['status'] as const;
type SortField = 'createdAt';

/** Bank payments, newest first: each batch, what its file pays and how many payments have their UTR. */
export function PaymentBatches() {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();
  useNewIntent('payment-batch', !!user && canRecordPayment(user.roleKey), () => setAdding(true));
  const open = (id: string) => router.push(batchHref(id));
  const frame = useListFrame<SortField, PaymentBatchDto>({
    list: 'bank-payments',
    keys: KEYS,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    sortFields: ['createdAt'],
    moreViews: [
      { key: 'draft', label: PAYMENT_BATCH_STATUS_LABELS.DRAFT, filters: { status: 'DRAFT' } },
      { key: 'waiting', label: PAYMENT_BATCH_STATUS_LABELS.EXPORTED, filters: { status: 'EXPORTED' } },
      { key: 'settled', label: PAYMENT_BATCH_STATUS_LABELS.SETTLED, filters: { status: 'SETTLED' } },
    ],
    projectScoped: false,
    chipLabels: { status: (v) => PAYMENT_BATCH_STATUS_LABELS[v as PaymentBatchStatus] ?? v },
    columns: (): ListColumn<PaymentBatchDto>[] => [
      {
        key: 'batch',
        title: 'Batch',
        locked: true,
        card: 'title',
        cardText: (b) => b.batchNo,
        render: (_, b) => (
          <div>
            <RecordLink href={batchHref(b.id)} onOpen={() => open(b.id)} strong className="mono">
              {b.batchNo}
            </RecordLink>
            <span style={caption}>{`${BANK_FILE_FORMATS[b.format].label}, made ${formatDate(b.createdAt.slice(0, 10))}`}</span>
          </div>
        ),
      },
      { key: 'status', title: 'Status', width: 170, card: 'status', render: (_, b) => <BatchStatusTag status={b.status} /> },
      {
        key: 'account',
        title: 'Debit account',
        width: 180,
        card: 'meta',
        cardText: (b) => `${BANK_FILE_FORMATS[b.format].label} · ${b.debitAccount}`,
        render: (_, b) => <span className="mono" translate="no">{b.debitAccount}</span>,
        defaultFrom: 1280,
      },
      { key: 'payments', title: 'Payments', width: 110, kind: 'qty', value: (b) => b.inFile },
      { key: 'total', title: 'Paid by the file', kind: 'money', value: (b) => b.total, width: 170, card: 'amount' },
      { key: 'utrs', title: 'UTRs in', width: 120, render: (_, b) => (b.status === 'DRAFT' ? NO_VALUE : `${b.paid} of ${b.inFile}`), defaultFrom: 1024 },
      {
        key: 'paid',
        title: 'Payment date',
        width: 140,
        card: 'date',
        cardText: (b) => (b.paymentDate ? `Paid ${formatDate(b.paymentDate)}` : ''),
        render: (_, b) => (b.paymentDate ? formatDate(b.paymentDate) : NO_VALUE),
        defaultFrom: 1024,
      },
    ],
  });
  const { page } = frame;
  const status = page.filters.status as PaymentBatchStatus | undefined;
  const { data, isLoading, isFetching, error, refetch } = usePaymentBatches();
  const rows = useMemo(() => {
    const words = page.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (data ?? []).filter((b) => (!status || b.status === status) && words.every((w) => `${b.batchNo} ${b.debitAccount}`.toLowerCase().includes(w)));
  }, [data, status, page.search]);
  const newButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      New bank payment
    </Button>
  );
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {frame.views}
      <ListToolbar filters={frame.filterState} projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search batch no. or account" searchLabel="Search bank payments" extra={newButton} />
      <DataTable<PaymentBatchDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={{ pagination: rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false }}
        onOpen={open}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        emptyText={<EmptyArt art="entries" title={frame.empty.filtered ? 'No bank payment matches these filters' : 'No bank payment yet'} />}
        emptyAction={newButton}
      />
      <NewBatchModal open={adding} onClose={() => setAdding(false)} onSaved={open} lastAccount={data?.[0]?.debitAccount} lastFormat={data?.[0]?.format} />
    </>
  );
}

interface BatchValues {
  debitAccount: string;
  format: BankFileFormatKey;
}

/** A new batch: the company's account the bank debits and the bank's layout, the last batch's by default. */
export function NewBatchModal({ open, onClose, onSaved, lastAccount, lastFormat }: { open: boolean; onClose: () => void; onSaved?: (id: string) => void; lastAccount?: string; lastFormat?: BankFileFormatKey }) {
  const [form] = Form.useForm<BatchValues>();
  const qc = useQueryClient();
  const saved = useRef<string | null>(null);
  useEffect(() => {
    if (open) form.setFieldsValue({ debitAccount: lastAccount ?? '', format: lastFormat ?? 'GENERIC' });
  }, [open, form, lastAccount, lastFormat]);
  const mutation = useMutation({
    mutationFn: async (v: BatchValues) => (await api.post<PaymentBatchDetailDto>('/payment-batches', v)).data,
    onSuccess: (b) => {
      invalidateBatches(qc);
      saved.current = b.id;
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
      title="New bank payment"
      okText="Make batch"
      projectDefault={false}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="debitAccount"
          label="Debit account"
          tooltip="The company's account the bank pays from, as the file writes it"
          rules={[
            { required: true, message: 'Enter the account number the bank debits' },
            { pattern: /^\s*[0-9A-Za-z ]{6,24}\s*$/, message: 'An account number is 6 to 20 letters and digits' },
          ]}
        >
          <Input className="mono" inputMode="numeric" autoComplete="off" />
        </Form.Item>
        <Form.Item name="format" label="Bank file layout" tooltip="Generic suits most banks' bulk upload; check the first file against your bank's sample" rules={[{ required: true, message: 'Choose the layout your bank takes' }]}>
          <Select options={BANK_FILE_FORMAT_KEYS.map((k) => ({ value: k, label: BANK_FILE_FORMATS[k].label }))} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
