'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, DatePicker, Form, Input, Segmented, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { AccountGroup, AccountNature, LedgerAccountDto, StatementLine } from '@erp/shared';
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABELS, ACCOUNT_GROUP_NATURE, ACCOUNT_NATURE_LABELS, STATEMENT_LINES, STATEMENT_LINE_LABELS, statementLineFits, statementLineOf } from '@erp/shared';
import { useBooksAction, useLedgerAccounts } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { Amount, Balance } from './booksUi';

interface Values {
  name: string;
  group: AccountGroup;
  code?: string;
  description?: string;
  isActive?: boolean;
  statementLine?: StatementLine | null;
}

const NATURES: AccountNature[] = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'];
const GROUP_OPTIONS = NATURES.map((n) => ({
  label: ACCOUNT_NATURE_LABELS[n],
  title: ACCOUNT_NATURE_LABELS[n],
  options: ACCOUNT_GROUPS.filter((g) => ACCOUNT_GROUP_NATURE[g] === n).map((g) => ({ value: g, label: ACCOUNT_GROUP_LABELS[g] })),
}));

function AccountForm({ open, onClose, account }: { open: boolean; onClose: () => void; account: LedgerAccountDto | null }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useBooksAction<LedgerAccountDto>();
  const group = Form.useWatch('group', form) ?? account?.group ?? 'INDIRECT_EXPENSES';
  const usual = STATEMENT_LINE_LABELS[statementLineOf({ key: account?.key ?? '', group, statementLine: null }, 0)];
  useEffect(() => {
    if (open && account)
      form.setFieldsValue({ name: account.name, group: account.group, code: account.code ?? undefined, description: account.description ?? undefined, isActive: account.isActive, statementLine: account.statementLine });
  }, [open, account, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title={account ? `Change ${account.name}` : 'New account'}
      okText={account ? 'Save account' : 'Add account'}
      onSubmit={async (v) => {
        const statementLine = v.statementLine && statementLineFits(v.statementLine, ACCOUNT_GROUP_NATURE[v.group]) ? v.statementLine : null;
        const body = { name: v.name.trim(), group: v.group, code: v.code?.trim() || null, description: v.description?.trim() || null, statementLine, ...(account && !account.isSystem ? { isActive: v.isActive } : {}) };
        const a = await save.mutateAsync(account ? { method: 'patch', path: `/books/accounts/${account.id}`, body } : { path: '/books/accounts', body });
        message.success(account ? `${a.name} saved` : `${a.name} added under ${ACCOUNT_GROUP_LABELS[a.group]}`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ group: 'INDIRECT_EXPENSES', isActive: true }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the account name' }]} extra={account?.isSystem ? 'The modules post to this account; renaming it keeps every entry.' : undefined}>
          <Input maxLength={120} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="group" label="Group" rules={[{ required: true, message: 'Choose the group' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={GROUP_OPTIONS} />
          </Form.Item>
          <Form.Item name="code" label="Code" extra="Optional, as in your old books">
            <Input maxLength={20} translate="no" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="statementLine" label="Shows in the statements as" extra={`Left empty, it shows as ${usual}`}>
          <Select
            allowClear
            placeholder={usual}
            showSearch={{ optionFilterProp: 'label' }}
            options={STATEMENT_LINES.filter((l) => statementLineFits(l, ACCOUNT_GROUP_NATURE[group])).map((l) => ({ value: l, label: STATEMENT_LINE_LABELS[l] }))}
          />
        </Form.Item>
        <Form.Item name="description" label="Notes">
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
        {account && !account.isSystem && (
          <Form.Item name="isActive" label="Open for new vouchers" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}

/** Every account by group with its balance; accounts add their own (bank accounts, capital, loans, other heads). */
export function ChartOfAccounts() {
  const [asOn, setAsOn] = useState(() => dayjs());
  const [nature, setNature] = useState<AccountNature | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<LedgerAccountDto | null | undefined>(undefined);
  const act = useBooksAction();
  const { data, isLoading, isFetching, error, refetch } = useLedgerAccounts({ to: asOn.format('YYYY-MM-DD') });
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = (data ?? [])
    .filter((a) => nature === 'ALL' || a.nature === nature)
    .filter((a) => words.every((w) => `${a.name} ${a.code ?? ''} ${ACCOUNT_GROUP_LABELS[a.group]}`.toLowerCase().includes(w)))
    .sort((a, b) => NATURES.indexOf(a.nature) - NATURES.indexOf(b.nature) || ACCOUNT_GROUPS.indexOf(a.group) - ACCOUNT_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space wrap>
          <Segmented aria-label="Which accounts" value={nature} onChange={(v) => setNature(v as AccountNature | 'ALL')} options={[{ value: 'ALL', label: 'All' }, ...NATURES.map((n) => ({ value: n, label: ACCOUNT_NATURE_LABELS[n] }))]} />
          <DatePicker aria-label="Balances as on" format="DD MMM YYYY" allowClear={false} value={asOn} onChange={(d) => d && setAsOn(d)} />
          <Input.Search allowClear placeholder="Account or group" aria-label="Search accounts" onSearch={(v) => setQ(v)} onChange={(e) => !e.target.value && setQ('')} style={{ width: 220 }} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
          New account
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<LedgerAccountDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          dataSource={rows}
          scroll={{ x: 860 }}
          pagination={{ pageSize: 100, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: 'No accounts here' }}
          onRow={(a) => ({ onClick: () => setEditing(a), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: 'Account',
              dataIndex: 'name',
              render: (n: string, a) => (
                <Space size={4} wrap>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setEditing(a)}>
                    <span translate="no">{a.code ? `${a.code} · ${n}` : n}</span>
                  </Button>
                  {!a.isActive && <Tag>Closed</Tag>}
                  {!a.isSystem && <Typography.Text type="secondary">added by hand</Typography.Text>}
                </Space>
              ),
            },
            { title: 'Group', dataIndex: 'group', width: 200, render: (g: AccountGroup) => ACCOUNT_GROUP_LABELS[g] },
            { title: 'Debits', dataIndex: 'debit', align: 'right', width: 150, render: (x: string) => <Amount value={x} /> },
            { title: 'Credits', dataIndex: 'credit', align: 'right', width: 150, render: (x: string) => <Amount value={x} /> },
            { title: 'Balance', dataIndex: 'balance', align: 'right', width: 170, render: (x: string) => <Balance value={x} /> },
            {
              title: '',
              key: 'delete',
              width: 90,
              render: (_, a) =>
                !a.isSystem && !a.entries ? (
                  <span onClick={(e) => e.stopPropagation()} role="presentation">
                    <ConfirmDelete what={`account ${a.name}`} onConfirm={() => act.mutateAsync({ method: 'delete', path: `/books/accounts/${a.id}` })}>
                      <Button size="small" type="text" danger aria-label={`Delete ${a.name}`}>
                        Delete
                      </Button>
                    </ConfirmDelete>
                  </span>
                ) : null,
            },
          ]}
        />
      )}
      <AccountForm open={editing !== undefined} onClose={() => setEditing(undefined)} account={editing ?? null} />
    </div>
  );
}
