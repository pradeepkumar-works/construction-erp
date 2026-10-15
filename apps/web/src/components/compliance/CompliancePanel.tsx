'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Drawer, Popconfirm, Segmented, Select, Space, Statistic, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ComplianceDocDto, ComplianceDocKind, ComplianceDocStatus } from '@erp/shared';
import {
  COMPLIANCE_AMOUNT_LABELS,
  COMPLIANCE_DOC_KINDS,
  COMPLIANCE_DOC_KIND_LABELS,
  COMPLIANCE_DOC_STATUSES,
  COMPLIANCE_DOC_STATUS_LABELS,
  COMPLIANCE_ISSUER_LABELS,
  DOC_ALERT_DAYS,
  canBeInvoked,
  canManageCompliance,
} from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useComplianceDoc, useComplianceDocs } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { SearchBox } from '@/components/common/SearchBox';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';
import { ExpiryTag } from '@/components/maintenance/maintenanceUi';
import { ComplianceFormModal, type ComplianceAction } from './ComplianceForms';

const KIND_COLORS: Record<ComplianceDocKind, string> = { BANK_GUARANTEE: 'blue', EMD: 'cyan', INSURANCE: 'purple', LICENCE: 'geekblue' };
const STATUS_COLORS: Record<ComplianceDocStatus, string> = { ACTIVE: 'green', RENEWED: 'default', RELEASED: 'default', INVOKED: 'red' };
const big = { content: { fontSize: 18 } };

const KindTag = ({ kind }: { kind: ComplianceDocKind }) => (
  <Tag color={KIND_COLORS[kind]} style={{ margin: 0 }}>
    {COMPLIANCE_DOC_KIND_LABELS[kind]}
  </Tag>
);

/** Where an entry stands: its expiry while active, else how it ended. */
function StandTag({ d }: { d: ComplianceDocDto }) {
  if (d.status === 'ACTIVE') return d.expiresOn ? <ExpiryTag state={d.state} daysLeft={d.daysLeft} /> : <Tag style={{ margin: 0 }}>No expiry</Tag>;
  return (
    <Tag color={STATUS_COLORS[d.status]} style={{ margin: 0 }}>
      {COMPLIANCE_DOC_STATUS_LABELS[d.status]}
      {d.closedOn ? ` ${formatDate(d.closedOn)}` : ''}
    </Tag>
  );
}

/**
 * Guarantees, insurance and licences register (v4 item 46): bank guarantees and EMDs out with the money they tie up,
 * insurance policies and licences, soonest expiry first, with renewals and releases.
 */
export function CompliancePanel({ initialId }: { initialId?: string }) {
  const { user } = useAuth();
  const keeper = !!user && canManageCompliance(user.roleKey);
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [kind, setKind] = useState<ComplianceDocKind | 'ALL'>('ALL');
  const [status, setStatus] = useState<ComplianceDocStatus | 'ALL'>('ACTIVE');
  const [state, setState] = useState<'EXPIRING' | 'EXPIRED' | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [action, setAction] = useState<ComplianceAction | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useComplianceDocs({ kind: kind === 'ALL' ? undefined : kind, status, state, projectId, q: q || undefined });
  const open = useComplianceDoc(openId);
  const t = data?.totals;

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/compliance-docs/${id}`)).data,
    onSuccess: () => {
      message.success('Entry deleted');
      qc.invalidateQueries({ queryKey: ['compliance'] });
      setOpenId(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const pickState = (s: 'EXPIRING' | 'EXPIRED') => {
    setState(state === s ? undefined : s);
    setStatus('ACTIVE');
  };

  const columns: TableProps<ComplianceDocDto>['columns'] = [
    {
      title: 'Kind',
      key: 'kind',
      width: 210,
      render: (_, d) => (
        <div>
          <KindTag kind={d.kind} />
          {d.category ? (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
              {d.category}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Number',
      key: 'ref',
      render: (_, d) => (
        <div>
          <b>{d.reference}</b>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {d.issuer ?? ' '}
          </div>
        </div>
      ),
    },
    {
      title: 'For',
      key: 'for',
      render: (_, d) => (
        <div>
          {d.projectName ?? <span className="text-muted">Company-wide</span>}
          {d.beneficiary ? (
            <div className="text-muted" style={{ fontSize: 12 }}>
              In favour of {d.beneficiary}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      align: 'right',
      width: 150,
      render: (_, d) =>
        d.amount ? (
          <div>
            {formatINR(d.amount)}
            {d.margin ? (
              <div className="text-muted" style={{ fontSize: 12 }}>
                margin {formatINR(d.margin)}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    { title: 'Valid to', dataIndex: 'expiresOn', width: 120, render: (v: string | null) => (v ? formatDate(v) : <span className="text-muted">-</span>) },
    { title: '', key: 'stand', width: 150, render: (_, d) => <StandTag d={d} /> },
  ];

  const d = open.data;
  return (
    <>
      {t ? (
        <CardToolbar variant="summary" className="compliance-summary" wrap gap={28}>
          <Statistic title="Bank guarantees out" value={formatINR(t.guaranteesOut)} styles={big} />
          <Statistic title="Margin money blocked" value={formatINR(t.marginBlocked)} styles={big} />
          <Statistic title="EMD with tenders" value={formatINR(t.emdOut)} styles={big} />
          <div role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => pickState('EXPIRING')} onKeyDown={(e) => e.key === 'Enter' && pickState('EXPIRING')}>
            <Statistic title={`Expiring in ${DOC_ALERT_DAYS} days`} value={t.expiring} styles={{ content: { fontSize: 18, color: t.expiring ? themeColor('orange7') : undefined } }} />
          </div>
          <div role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => pickState('EXPIRED')} onKeyDown={(e) => e.key === 'Enter' && pickState('EXPIRED')}>
            <Statistic title="Expired, not renewed" value={t.expired} styles={{ content: { fontSize: 18, color: t.expired ? themeColor('colorErrorText') : undefined } }} />
          </div>
        </CardToolbar>
      ) : null}
      <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented<ComplianceDocKind | 'ALL'>
          value={kind}
          onChange={setKind}
          options={[{ value: 'ALL', label: 'All' }, ...COMPLIANCE_DOC_KINDS.map((k) => ({ value: k, label: COMPLIANCE_DOC_KIND_LABELS[k] }))]}
        />
        <Select<ComplianceDocStatus | 'ALL'>
          value={status}
          onChange={(v) => {
            setStatus(v);
            if (v !== 'ACTIVE') setState(undefined);
          }}
          style={{ width: 140 }}
          options={[...COMPLIANCE_DOC_STATUSES.map((s) => ({ value: s, label: COMPLIANCE_DOC_STATUS_LABELS[s] })), { value: 'ALL', label: 'All' }]}
          aria-label="Status"
        />
        {state ? (
          <Tag closable onClose={() => setState(undefined)} color={state === 'EXPIRED' ? 'red' : 'gold'}>
            {state === 'EXPIRED' ? 'Expired' : `Expiring in ${DOC_ALERT_DAYS} days`}
          </Tag>
        ) : null}
        <ProjectSelect value={projectId} onChange={setProjectId} placeholder="All projects" style={{ width: 240 }} />
        <SearchBox value={q} onChange={setQ} placeholder="Number, bank, insurer, client" width={240} />
        <span style={{ flex: 1 }} />
        {keeper ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAction({ kind: 'new' })}>
            Add entry
          </Button>
        ) : null}
      </div>
      {error ? (
        <QueryError error={error} onRetry={refetch} />
      ) : (
        <Table<ComplianceDocDto>
          className="compliance-table"
          rowKey="id"
          size="middle"
          loading={isLoading || isFetching}
          dataSource={data?.items ?? []}
          columns={columns}
          pagination={false}
          scroll={{ x: 900 }}
          onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
          locale={{ emptyText: status === 'ACTIVE' && !state && !q && kind === 'ALL' && !projectId ? 'Nothing in the register yet. Add your bank guarantees, EMDs, insurance policies and licences.' : 'Nothing matches' }}
        />
      )}

      <Drawer
        open={!!openId}
        onClose={() => setOpenId(null)}
        size={560}
        className="compliance-drawer"
        title={d ? `${d.category || COMPLIANCE_DOC_KIND_LABELS[d.kind]} ${d.reference}` : 'Entry'}
        extra={
          d && keeper ? (
            <Space wrap>
              <Button size="small" onClick={() => setAction({ kind: 'edit', doc: d })}>
                Edit
              </Button>
              {d.status === 'ACTIVE' ? (
                <>
                  <Button size="small" type="primary" onClick={() => setAction({ kind: 'renew', doc: d })}>
                    Renew
                  </Button>
                  <Button size="small" onClick={() => setAction({ kind: 'release', doc: d })}>
                    Release
                  </Button>
                  {canBeInvoked(d.kind) ? (
                    <Button size="small" danger onClick={() => setAction({ kind: 'invoke', doc: d })}>
                      Invoked
                    </Button>
                  ) : null}
                </>
              ) : null}
              {!d.renewedById ? (
                <Popconfirm title="Delete this entry?" description={d.renewedFromId ? 'The entry it renewed becomes active again.' : undefined} onConfirm={() => remove.mutate(d.id)}>
                  <Button size="small" danger type="text">
                    Delete
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          ) : null
        }
      >
        {open.isLoading ? (
          <Loading />
        ) : open.error ? (
          <QueryError error={open.error} onRetry={open.refetch} />
        ) : d ? (
          <>
            <Space style={{ marginBottom: 12 }}>
              <KindTag kind={d.kind} />
              <StandTag d={d} />
            </Space>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Number">{d.reference}</Descriptions.Item>
              {d.issuer ? <Descriptions.Item label={COMPLIANCE_ISSUER_LABELS[d.kind]}>{d.issuer}</Descriptions.Item> : null}
              <Descriptions.Item label="For">{d.projectName ?? 'The whole company'}</Descriptions.Item>
              {d.beneficiary ? <Descriptions.Item label="In favour of">{d.beneficiary}</Descriptions.Item> : null}
              {d.amount ? <Descriptions.Item label={COMPLIANCE_AMOUNT_LABELS[d.kind]}>{formatINR(d.amount, true)}</Descriptions.Item> : null}
              {d.margin ? <Descriptions.Item label="Margin money">{formatINR(d.margin, true)}</Descriptions.Item> : null}
              <Descriptions.Item label="Valid">
                {d.issuedOn ? formatDate(d.issuedOn) : '?'} to {d.expiresOn ? formatDate(d.expiresOn) : 'no expiry'}
              </Descriptions.Item>
              {d.claimUntil ? <Descriptions.Item label="Claim period to">{formatDate(d.claimUntil)}</Descriptions.Item> : null}
              {d.status !== 'ACTIVE' ? (
                <Descriptions.Item label={COMPLIANCE_DOC_STATUS_LABELS[d.status]}>
                  {formatDate(d.closedOn)}
                  {d.closeNote ? ` · ${d.closeNote}` : ''}
                </Descriptions.Item>
              ) : null}
              {d.note ? <Descriptions.Item label="Note">{d.note}</Descriptions.Item> : null}
              <Descriptions.Item label="Added by">{d.createdByName}</Descriptions.Item>
            </Descriptions>
            {d.renewedById ? (
              <p style={{ marginTop: 12 }}>
                Renewed: <a onClick={() => setOpenId(d.renewedById)}>open the current entry</a>
              </p>
            ) : null}
            <h4 style={{ marginTop: 16 }}>Scans</h4>
            <AttachmentGallery attachments={d.attachments} size={72} />
            {d.history.length ? (
              <>
                <h4 style={{ marginTop: 16 }}>Earlier periods</h4>
                <Table<ComplianceDocDto>
                  className="compliance-history"
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={d.history}
                  onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
                  columns={[
                    { title: 'Number', dataIndex: 'reference' },
                    { title: 'Valid', key: 'v', render: (_, h) => `${h.issuedOn ? formatDate(h.issuedOn) : '?'} to ${h.expiresOn ? formatDate(h.expiresOn) : '-'}` },
                    { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: string | null) => (v ? formatINR(v) : '-') },
                  ]}
                />
              </>
            ) : null}
          </>
        ) : null}
      </Drawer>

      <ComplianceFormModal action={action} onClose={() => setAction(null)} onDone={(id) => setOpenId(id)} />
    </>
  );
}
