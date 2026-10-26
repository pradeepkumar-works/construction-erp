'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Segmented, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import type { BookVoucherDto, ManualVoucherType } from '@erp/shared';
import { ACCOUNT_GROUP_LABELS, BOOK_VOUCHER_TYPE_LABELS, MANUAL_VOUCHER_HELP, MANUAL_VOUCHER_TYPES } from '@erp/shared';
import { useBooksAction, useLedgerAccounts } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput } from '@/components/form/inputs';
import { ProjectSelect } from '@/components/common/ProjectSelect';

interface Values {
  type: ManualVoucherType;
  date: dayjs.Dayjs;
  reference?: string;
  projectId?: string;
  narration: string;
  lines: { accountId?: string; debit?: number | null; credit?: number | null }[];
}

const sum = (lines: Values['lines'] | undefined, k: 'debit' | 'credit') => Math.round((lines ?? []).reduce((s, l) => s + (Number(l?.[k]) || 0), 0) * 100) / 100;

/** The debit and credit totals under the lines, and what is left to balance. */
function Totals({ form }: { form: FormInstance<Values> }) {
  const lines = Form.useWatch('lines', form);
  const dr = sum(lines, 'debit');
  const cr = sum(lines, 'credit');
  const diff = Math.round((dr - cr) * 100) / 100;
  return (
    <Typography.Text type={diff ? 'warning' : 'secondary'} translate="no">
      {`Debit ${formatINR(dr, true)} · Credit ${formatINR(cr, true)}`}
      {diff ? ` · ${formatINR(Math.abs(diff), true)} more ${diff > 0 ? 'credit' : 'debit'} needed` : ''}
    </Typography.Text>
  );
}

/** What a new voucher starts with, such as a bank charge from the bank reconciliation. */
export interface VoucherPrefill {
  type: ManualVoucherType;
  date: string;
  reference?: string | null;
  narration: string;
  lines: { accountId?: string; debit?: number | null; credit?: number | null }[];
}

/** A journal, payment, receipt or contra made by hand: saved as a draft, or sent to management for approval. */
export function VoucherForm({
  open,
  onClose,
  voucher,
  initialType = 'JOURNAL',
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  voucher?: BookVoucherDto | null;
  initialType?: ManualVoucherType;
  prefill?: VoucherPrefill | null;
}) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useBooksAction<BookVoucherDto>();
  const { data: accounts } = useLedgerAccounts({}, open);
  const type = Form.useWatch('type', form) ?? voucher?.type ?? initialType;
  useEffect(() => {
    if (!open) return;
    if (voucher)
      form.setFieldsValue({
        type: voucher.type as ManualVoucherType,
        date: dayjs(voucher.date),
        reference: voucher.reference ?? undefined,
        projectId: voucher.projectId ?? undefined,
        narration: voucher.narration,
        lines: voucher.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ? Number(l.debit) : null, credit: l.credit ? Number(l.credit) : null })),
      });
    else if (prefill) form.setFieldsValue({ ...prefill, date: dayjs(prefill.date), reference: prefill.reference ?? undefined });
  }, [open, voucher, prefill, form]);
  const options = (accounts ?? [])
    .filter((a) => a.isActive || voucher?.lines.some((l) => l.accountId === a.id))
    .map((a) => ({ value: a.id, label: a.name, title: ACCOUNT_GROUP_LABELS[a.group] }));
  const editing = !!voucher;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={860}
      projectDefault={false}
      title={editing ? `Change ${voucher.voucherNo}` : 'New voucher'}
      okText="Submit for approval"
      secondaryText="Save draft"
      draftKey={editing || prefill ? undefined : 'book-voucher'}
      footerExtra={<Totals form={form} />}
      onSubmit={async (v, draft) => {
        const body = {
          type: v.type,
          date: v.date.format('YYYY-MM-DD'),
          reference: v.reference?.trim() || null,
          projectId: v.projectId || null,
          narration: v.narration.trim(),
          lines: (v.lines ?? []).map((l) => ({ accountId: l.accountId, debit: l.debit || null, credit: l.credit || null })),
        };
        let saved = await save.mutateAsync(editing ? { method: 'put', path: `/books/vouchers/${voucher.id}`, body } : { path: '/books/vouchers', body });
        if (!draft) saved = await save.mutateAsync({ path: `/books/vouchers/${saved.id}/submit` });
        message.success(draft ? `${saved.voucherNo} saved as a draft` : `${saved.voucherNo} sent for approval`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ type: initialType, date: dayjs(), lines: [{}, {}] }}>
        <Form.Item name="type" label="Voucher" extra={MANUAL_VOUCHER_HELP[type]}>
          <Segmented disabled={editing} options={MANUAL_VOUCHER_TYPES.map((t) => ({ value: t, label: BOOK_VOUCHER_TYPE_LABELS[t] }))} />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the voucher date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reference" label="Reference" extra="Cheque, UTR or bill number">
            <Input maxLength={100} translate="no" />
          </Form.Item>
          <Form.Item name="projectId" label="Project (cost centre)" extra="Leave empty for the head office">
            <ProjectSelect allowClear />
          </Form.Item>
        </FormGrid>
        <LineTable
          name="lines"
          label="Line"
          min={2}
          addText="Add a line"
          newLine={() => ({})}
          columns={[
            {
              key: 'account',
              title: 'Account',
              render: (field) => (
                <Form.Item name={[field.name, 'accountId']} rules={[{ required: true, message: 'Choose the account' }]} noStyle>
                  <Select aria-label="Account" showSearch={{ optionFilterProp: 'label' }} options={options} style={{ width: '100%' }} />
                </Form.Item>
              ),
            },
            {
              key: 'debit',
              title: 'Debit',
              width: 170,
              align: 'right',
              render: (field) => (
                <Form.Item name={[field.name, 'debit']} noStyle>
                  <MoneyInput aria-label="Debit" />
                </Form.Item>
              ),
            },
            {
              key: 'credit',
              title: 'Credit',
              width: 170,
              align: 'right',
              render: (field) => (
                <Form.Item name={[field.name, 'credit']} noStyle>
                  <MoneyInput aria-label="Credit" />
                </Form.Item>
              ),
            },
          ]}
        />
        <Form.Item name="narration" label="Narration" rules={[{ required: true, whitespace: true, message: 'Say what the voucher is for' }]} style={{ marginTop: 16 }}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
