'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, DatePicker, Empty, Input, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TallyExportDto, TallyLedgerKind, TallyLedgerRowDto, TallySettingsDto, TallyVoucherDto, TallyVoucherKind } from '@erp/shared';
import { TALLY_VOUCHER_KINDS, TALLY_VOUCHER_KIND_LABELS, TALLY_VOUCHER_TYPES, canExportTally } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTallyExports, useTallyPreview, useTallySettings } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';

const money = (v: string | null) => (v ? <span className="mono">{formatINR(v, true)}</span> : null);
const KIND_COLORS: Record<TallyVoucherKind, string> = { SALES: 'green', RECEIPT: 'cyan', PURCHASE: 'orange', SUBCONTRACT: 'volcano', PAYMENT: 'purple', EXPENSE: 'gold' };
const LEDGER_KIND_LABELS: Record<TallyLedgerKind, string> = { FIXED: 'Accounts', EXPENSE: 'Expense categories', CLIENT: 'Clients', VENDOR: 'Vendors' };

/** Save an XML file the API sends (the file name header is not readable across origins, so the name is ours). */
async function downloadXml(path: string, fileName: string) {
  const res = await api.get<Blob>(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const exportFile = (e: Pick<TallyExportDto, 'id' | 'upTo'>) => `nirmaan-tally-upto-${e.upTo}-${e.id.slice(0, 8)}.xml`;

function KindTag({ kind }: { kind: TallyVoucherKind }) {
  return (
    <Tag color={KIND_COLORS[kind]} style={{ margin: 0 }}>
      {TALLY_VOUCHER_KIND_LABELS[kind]}
    </Tag>
  );
}

function ToExport() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [month, setMonth] = useState(dayjs());
  const upTo = month.endOf('month').format('YYYY-MM-DD');
  const { data, isLoading, isFetching, error, refetch } = useTallyPreview({ upTo });
  const vouchers = data?.vouchers ?? [];
  const create = useMutation({
    mutationFn: async () => (await api.post<TallyExportDto>('/tally/exports', { upTo })).data,
    onSuccess: async (e) => {
      qc.invalidateQueries({ queryKey: ['tally'] });
      for (const k of ['ra-bills', 'receipts', 'vendor-payments']) qc.invalidateQueries({ queryKey: [k] });
      await downloadXml(`/tally/exports/${e.id}/xml`, exportFile(e));
      message.success(`${e.voucherCount} vouchers exported. Import the file in TallyPrime: Import → Transactions.`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: TableProps<TallyVoucherDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
    { title: 'Voucher', dataIndex: 'kind', width: 170, render: (k: TallyVoucherKind) => <KindTag kind={k} /> },
    {
      title: 'Number',
      dataIndex: 'number',
      width: 200,
      render: (v: string, r) => (
        <div>
          <span className="mono">{v}</span>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {TALLY_VOUCHER_TYPES[r.kind]}
          </div>
        </div>
      ),
    },
    {
      title: 'Party',
      dataIndex: 'party',
      render: (v: string, r) => (
        <div>
          {v}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.projectCode} · {r.projectName}
          </div>
        </div>
      ),
    },
    { title: 'Amount', dataIndex: 'amount', width: 150, align: 'right', render: (v) => <strong className="mono">{formatINR(v, true)}</strong> },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
        <Space>
          <Typography.Text>Up to the end of</Typography.Text>
          <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} format="MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'month')} />
        </Space>
        <Space wrap size={4}>
          {TALLY_VOUCHER_KINDS.filter((k) => data?.counts[k]).map((k) => (
            <Tag key={k} color={KIND_COLORS[k]}>
              {TALLY_VOUCHER_KIND_LABELS[k]}: {data!.counts[k]}
            </Tag>
          ))}
        </Space>
        <Popconfirm
          title={`Export ${vouchers.length} vouchers?`}
          description="They are marked exported and will not go again. Undo the export if Tally does not take it."
          okText="Export"
          onConfirm={() => create.mutate()}
          disabled={!vouchers.length}
        >
          <Button type="primary" icon={<ExportOutlined />} loading={create.isPending} disabled={!vouchers.length} style={{ marginLeft: 'auto' }}>
            Export {vouchers.length} voucher{vouchers.length === 1 ? '' : 's'}
          </Button>
        </Popconfirm>
      </div>
      <div style={{ padding: '12px 12px 0' }}>
        {data && data.held.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title={`${data.held.length} record${data.held.length === 1 ? '' : 's'} cannot go yet`}
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.held.map((h) => (
                  <li key={`${h.kind}:${h.sourceId}`}>
                    {TALLY_VOUCHER_KIND_LABELS[h.kind]} {h.number} of {formatDate(h.date)} ({h.party}): {h.reason}
                  </li>
                ))}
              </ul>
            }
          />
        )}
        {data && data.awaitingCertification > 0 && (
          <Typography.Paragraph type="secondary">
            {data.awaitingCertification} approved RA bill{data.awaitingCertification === 1 ? ' goes' : 's go'} to Tally once the client certifies{' '}
            {data.awaitingCertification === 1 ? 'it' : 'them'}.
          </Typography.Paragraph>
        )}
      </div>
      <Table<TallyVoucherDto>
        rowKey="key"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={vouchers}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="Nothing new to export up to this month" /> }}
        expandable={{
          expandedRowRender: (v) => (
            <div style={{ maxWidth: 760 }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {v.narration}
              </Typography.Paragraph>
              <Table
                rowKey={(e) => `${e.ledgerKey}:${e.debit ?? ''}:${e.credit ?? ''}`}
                size="small"
                pagination={false}
                dataSource={v.entries}
                columns={[
                  { title: 'Ledger', dataIndex: 'ledger' },
                  { title: 'Debit', dataIndex: 'debit', width: 150, align: 'right', render: money },
                  { title: 'Credit', dataIndex: 'credit', width: 150, align: 'right', render: money },
                ]}
              />
            </div>
          ),
        }}
      />
    </>
  );
}

function Exports() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useTallyExports();
  const undo = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tally/exports/${id}`)).data,
    onSuccess: () => {
      message.success('Export undone: its vouchers wait for the next export');
      qc.invalidateQueries({ queryKey: ['tally'] });
      for (const k of ['ra-bills', 'receipts', 'vendor-payments']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: TableProps<TallyExportDto>['columns'] = [
    { title: 'Exported', dataIndex: 'createdAt', width: 180, render: (v, r) => <div>{formatDateTime(v)}<div className="text-muted" style={{ fontSize: 12 }}>{r.createdByName}</div></div> },
    { title: 'Up to', dataIndex: 'upTo', width: 120, render: (v) => formatDate(v) },
    {
      title: 'Vouchers',
      key: 'counts',
      render: (_, r) => (
        <Space wrap size={4}>
          <strong>{r.voucherCount}</strong>
          {TALLY_VOUCHER_KINDS.filter((k) => r.counts[k]).map((k) => (
            <Tag key={k} color={KIND_COLORS[k]} style={{ margin: 0 }}>
              {TALLY_VOUCHER_KIND_LABELS[k]}: {r.counts[k]}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 210,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadXml(`/tally/exports/${r.id}/xml`, exportFile(r)).catch((e) => message.error(errorMessage(e)))}>
            Download
          </Button>
          <Popconfirm
            title="Undo this export?"
            description="Do this only if Tally did not take the file (or after deleting its vouchers in Tally). They will go in the next export."
            okText="Undo"
            okButtonProps={{ danger: true }}
            onConfirm={() => undo.mutate(r.id)}
          >
            <Button size="small" danger>
              Undo
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<TallyExportDto> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} scroll={{ x: 800 }} locale={{ emptyText: 'Nothing exported yet' }} />
    </>
  );
}

function Ledgers() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useTallySettings();
  const [names, setNames] = useState<Record<string, string>>({});
  const [company, setCompany] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [costCentres, setCostCentres] = useState(true);
  const [kind, setKind] = useState<TallyLedgerKind | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!data) return;
    setNames(Object.fromEntries(data.ledgers.map((l) => [l.key, l.name ?? ''])));
    setCompany(data.companyName ?? '');
    setStateCode(data.stateCode ?? '');
    setCostCentres(data.costCentres);
  }, [data]);
  const changed = useMemo(() => (data ? data.ledgers.filter((l) => (names[l.key] ?? '') !== (l.name ?? '')) : []), [data, names]);
  const dirty = !!data && (changed.length > 0 || company !== (data.companyName ?? '') || stateCode !== (data.stateCode ?? '') || costCentres !== data.costCentres);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<TallySettingsDto>('/tally/settings', {
          companyName: company,
          stateCode,
          costCentres,
          ledgers: Object.fromEntries(changed.map((l) => [l.key, names[l.key] || null])),
        })
      ).data,
    onSuccess: (d) => {
      qc.setQueryData(['tally', 'settings'], d);
      qc.invalidateQueries({ queryKey: ['tally', 'preview'] });
      message.success('Tally settings saved');
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const rows = (data?.ledgers ?? []).filter((l) => (kind === 'ALL' || l.kind === kind) && (!q || `${l.defaultName} ${l.use} ${names[l.key] ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const columns: TableProps<TallyLedgerRowDto>['columns'] = [
    {
      title: 'In Nirmaan',
      key: 'use',
      render: (_, l) => (
        <div>
          {l.kind === 'FIXED' ? l.use : l.defaultName}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {l.kind === 'FIXED' ? `Default "${l.defaultName}"` : l.use}
          </div>
        </div>
      ),
    },
    { title: 'Tally group', dataIndex: 'group', width: 190, render: (v) => <span className="text-muted">{v}</span> },
    {
      title: 'Tally ledger',
      key: 'name',
      width: 340,
      render: (_, l) => (
        <Input
          aria-label={`Tally ledger for ${l.kind === 'FIXED' ? l.use : l.defaultName}`}
          value={names[l.key] ?? ''}
          placeholder={l.defaultName}
          maxLength={200}
          onChange={(e) => setNames((n) => ({ ...n, [l.key]: e.target.value }))}
        />
      ),
    },
  ];
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, borderBottom: '1px solid #f0f0f0' }}>
        <label>
          <Typography.Text type="secondary">Company name in Tally</Typography.Text>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="The company open in Tally" maxLength={200} />
        </label>
        <label>
          <Typography.Text type="secondary">GST state code</Typography.Text>
          <Input value={stateCode} onChange={(e) => setStateCode(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 21 for Odisha" />
        </label>
        <div>
          <Typography.Text type="secondary">Projects as cost centres</Typography.Text>
          <div style={{ paddingTop: 4 }}>
            <Switch checked={costCentres} onChange={setCostCentres} />
          </div>
        </div>
        <Space style={{ alignSelf: 'end', justifySelf: 'end' }} wrap>
          <Button icon={<DownloadOutlined />} onClick={() => downloadXml('/tally/masters.xml', 'nirmaan-tally-masters.xml').catch((e) => message.error(errorMessage(e)))}>
            Ledger masters
          </Button>
          <Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </Space>
      </div>
      <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Select
          value={kind}
          onChange={setKind}
          style={{ width: 200 }}
          options={[{ value: 'ALL', label: 'All ledgers' }, ...(Object.keys(LEDGER_KIND_LABELS) as TallyLedgerKind[]).map((k) => ({ value: k, label: LEDGER_KIND_LABELS[k] }))]}
        />
        <Input.Search allowClear placeholder="Search ledgers" style={{ maxWidth: 280 }} onSearch={setQ} onChange={(e) => !e.target.value && setQ('')} />
        <Typography.Text type="secondary" style={{ alignSelf: 'center' }}>
          Leave a ledger empty to use the default name. Within the state GST goes to CGST and SGST, to IGST for a vendor in another state.
        </Typography.Text>
      </div>
      <Table<TallyLedgerRowDto> rowKey="key" size="small" loading={isLoading} columns={columns} dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 760 }} />
    </>
  );
}

export default function TallyPage() {
  const { user } = useAuth();
  if (user && !canExportTally(user.roleKey))
    return (
      <div className="page-container">
        <Alert type="info" showIcon title="Only admin, management and accounts export to Tally." />
      </div>
    );
  return (
    <div className="page-container">
      <PageHeader
        title="Tally Export"
        subtitle="Certified RA bills, money received, vendor and subcontractor bills, payments and site expenses as TallyPrime vouchers, each sent once. Tally stays the books."
      />
      <Typography.Paragraph type="secondary" style={{ maxWidth: 900 }}>
        Once: set the ledger names under Ledgers, download the ledger masters and import them in TallyPrime (Import → Masters). Each month: export here and import
        the file (Import → Transactions). Exported receipts and payments are locked in <Link href="/receivables">Receivables</Link> and{' '}
        <Link href="/payables">Payables</Link> until their export is undone.
      </Typography.Paragraph>
      <Card className="table-card" size="small">
        <Tabs
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            { key: 'export', label: 'To export', children: <ToExport /> },
            { key: 'exports', label: 'Exports', children: <Exports /> },
            { key: 'ledgers', label: 'Ledgers', children: <Ledgers /> },
          ]}
        />
      </Card>
    </div>
  );
}
