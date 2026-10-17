'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Drawer, Popconfirm, Progress, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImprestDto, ImprestEntryDto, ImprestLedgerLine } from '@erp/shared';
import { IMPREST_ENTRY_KIND_LABELS, IMPREST_ENTRY_STATUS_LABELS, PAYMENT_MODE_LABELS, SUBMISSION_STATUS_LABELS, canManageImprest } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useImprest, useImprests } from '@/lib/queries';
import { STATUS_COLORS, formatDate, formatINR } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ImprestActionModal, type ImprestAction } from './ImprestActions';
import { themeFontSize } from '@/lib/theme';

const rs = (v: string | number) => formatINR(v, true);
const ENTRY_COLORS = { REQUESTED: 'orange', PAID: 'green', REJECTED: 'red' } as const;

function CashBar({ i }: { i: ImprestDto }) {
  const pct = Number(i.floatAmount) > 0 ? Math.max(0, Math.min(100, (Number(i.cashInHand) / Number(i.floatAmount)) * 100)) : 0;
  return (
    <div>
      <b className={i.low ? 'text-danger' : undefined}>{rs(i.cashInHand)}</b>
      <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}> of {formatINR(i.floatAmount)}</span>
      <Progress percent={Math.round(pct)} size="small" showInfo={false} status={i.low ? 'exception' : 'normal'} aria-label={`Cash in hand: ${Math.round(pct)}% of float`} />
    </div>
  );
}

/**
 * Site imprests (v4 item 45): petty cash floats held at the sites, with the cash in hand after the holders' cash
 * expenses, top-ups waiting to be paid, and each imprest's cash ledger.
 */
export function ImprestPanel({ projectId: fixedProject, initialId }: { projectId?: string; initialId?: string }) {
  const { user } = useAuth();
  const admin = !!user && canManageImprest(user.roleKey);
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [active, setActive] = useState(true);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [action, setAction] = useState<ImprestAction | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useImprests({ projectId, active });
  const waiting = (data ?? []).filter((i) => i.openRequest).length;

  const columns: TableProps<ImprestDto>['columns'] = [
    {
      title: 'Held by',
      dataIndex: 'holderName',
      render: (v, i) => (
        <div>
          <b>{v}</b>
          {!fixedProject ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{i.projectName}</div> : null}
        </div>
      ),
    },
    { title: 'Cash in hand', key: 'cash', width: 220, render: (_, i) => <CashBar i={i} /> },
    {
      title: 'Spent',
      key: 'spent',
      width: 170,
      align: 'right',
      render: (_, i) => (
        <div>
          {rs(i.approvedSpend)}
          {Number(i.pendingSpend) ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>+ {rs(i.pendingSpend)} awaiting approval</div> : null}
        </div>
      ),
    },
    {
      title: <Tooltip title="Cash expenses turned down: the holder has to account for this cash">Disallowed</Tooltip>,
      dataIndex: 'disallowed',
      width: 120,
      align: 'right',
      render: (v) => (Number(v) ? <span className="text-danger">{rs(v)}</span> : <span className="text-muted">-</span>),
    },
    {
      title: 'Top-up',
      key: 'topup',
      width: 260,
      render: (_, i) =>
        i.openRequest ? (
          <Space wrap size={4}>
            <Tag color="orange">{rs(i.openRequest.amount)} asked {formatDate(i.openRequest.date)}</Tag>
            {admin ? (
              <>
                <Button size="small" type="primary" onClick={(e) => (e.stopPropagation(), setAction({ kind: 'pay', imprest: i }))}>
                  Pay
                </Button>
                <Button size="small" onClick={(e) => (e.stopPropagation(), setAction({ kind: 'reject', imprest: i }))}>
                  Turn down
                </Button>
              </>
            ) : null}
          </Space>
        ) : Number(i.topUpDue) ? (
          <span className="text-muted">{rs(i.topUpDue)} due{i.lastAdvanceOn ? `, last paid ${formatDate(i.lastAdvanceOn)}` : ''}</span>
        ) : (
          <span className="text-muted">At the float</span>
        ),
    },
  ];

  return (
    <div className="imprest-panel">
      <CardToolbar wrap gap={8} align="center">
        {!fixedProject ? <ProjectSelect value={projectFilter} onChange={setProjectFilter} /> : null}
        <Segmented value={active ? 'open' : 'closed'} onChange={(v) => setActive(v === 'open')} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
        {waiting ? <Tag color="orange">{waiting} top-up{waiting === 1 ? '' : 's'} waiting</Tag> : null}
        <div style={{ flex: 1 }} />
        {admin ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAction({ kind: 'open', projectId })}>
            Open an imprest
          </Button>
        ) : null}
      </CardToolbar>
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      <Table<ImprestDto>
        className="imprest-table"
        rowKey="id"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data ?? []}
        pagination={false}
        scroll={{ x: 900 }}
        onRow={(i) => ({ onClick: () => setOpenId(i.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: active ? (admin ? 'No imprests yet. Open one to give a site in-charge a petty cash float.' : 'You hold no imprest') : 'None closed' }}
      />
      <ImprestDrawer id={openId} onClose={() => setOpenId(null)} admin={admin} onAction={setAction} />
      <ImprestActionModal action={action} onClose={() => setAction(null)} onDone={(id) => setOpenId(id)} />
    </div>
  );
}

function ImprestDrawer({ id, onClose, admin, onAction }: { id: string | null; onClose: () => void; admin: boolean; onAction: (a: ImprestAction) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: i, isLoading, error, refetch } = useImprest(id);
  const holder = !!user && i?.holderId === user.id;

  const setActive = useMutation({
    mutationFn: async (isActive: boolean) => api.patch(`/imprests/${id}`, { isActive }),
    onSuccess: (_, isActive) => {
      message.success(isActive ? 'Imprest reopened' : 'Imprest closed');
      qc.invalidateQueries({ queryKey: ['imprests'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const ledgerCols: TableProps<ImprestLedgerLine>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
    {
      title: 'Entry',
      dataIndex: 'description',
      render: (v, l) => (
        <div>
          {v}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {l.ref}
            {l.status ? (
              <Tag color={STATUS_COLORS[l.status]} style={{ marginLeft: 6 }}>
                {SUBMISSION_STATUS_LABELS[l.status]}
              </Tag>
            ) : null}
          </div>
        </div>
      ),
    },
    { title: 'In', dataIndex: 'cashIn', width: 110, align: 'right', render: (v) => (Number(v) ? rs(v) : '') },
    { title: 'Out', dataIndex: 'cashOut', width: 110, align: 'right', render: (v, l) => (Number(v) ? rs(v) : l.status === 'REJECTED' ? <span className="text-muted">disallowed</span> : '') },
    { title: 'Balance', dataIndex: 'balance', width: 120, align: 'right', render: (v) => <b>{rs(v)}</b> },
  ];
  const entryCols: TableProps<ImprestEntryDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
    { title: 'Kind', dataIndex: 'kind', width: 130, render: (v: ImprestEntryDto['kind']) => IMPREST_ENTRY_KIND_LABELS[v] },
    { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: (v) => rs(v) },
    { title: 'Status', dataIndex: 'status', width: 140, render: (v: ImprestEntryDto['status']) => <Tag color={ENTRY_COLORS[v]}>{IMPREST_ENTRY_STATUS_LABELS[v]}</Tag> },
    {
      title: 'Detail',
      key: 'd',
      render: (_, e) =>
        [e.reason, e.paymentMode ? `${PAYMENT_MODE_LABELS[e.paymentMode]}${e.reference ? ` ${e.reference}` : ''}` : null, e.decisionNote, e.requestedByName ? `asked by ${e.requestedByName}` : null, e.decidedByName ? `by ${e.decidedByName}` : null]
          .filter(Boolean)
          .join(' · '),
    },
  ];

  return (
    <Drawer open={!!id} onClose={onClose} size="large" title={i ? `Imprest: ${i.holderName}` : 'Imprest'} destroyOnHidden>
      {isLoading ? <Loading /> : null}
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      {i ? (
        <div className="imprest-drawer">
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
            <Descriptions.Item label="Project">{i.projectName}</Descriptions.Item>
            <Descriptions.Item label="Float">{formatINR(i.floatAmount)}</Descriptions.Item>
            <Descriptions.Item label="Cash in hand">
              <b className={i.low ? 'text-danger' : undefined}>{rs(i.cashInHand)}</b>
            </Descriptions.Item>
            <Descriptions.Item label="Top-up due">{rs(i.topUpDue)}</Descriptions.Item>
            <Descriptions.Item label="Advanced">{rs(i.advanced)}</Descriptions.Item>
            <Descriptions.Item label="Returned">{rs(i.returned)}</Descriptions.Item>
            <Descriptions.Item label="Spent, approved">{rs(i.approvedSpend)}</Descriptions.Item>
            <Descriptions.Item label="Awaiting approval">{rs(i.pendingSpend)}</Descriptions.Item>
            <Descriptions.Item label="Disallowed">{Number(i.disallowed) ? <span className="text-danger">{rs(i.disallowed)}</span> : '-'}</Descriptions.Item>
            <Descriptions.Item label="Opened">
              {formatDate(i.openedOn)}
              {i.closedOn ? `, closed ${formatDate(i.closedOn)}` : ''}
            </Descriptions.Item>
          </Descriptions>
          <Space wrap style={{ margin: '12px 0' }}>
            {i.isActive && (holder || admin) && !i.openRequest ? <Button onClick={() => onAction({ kind: 'topup', imprest: i })}>Ask for a top-up</Button> : null}
            {admin && i.openRequest ? (
              <>
                <Button type="primary" onClick={() => onAction({ kind: 'pay', imprest: i })}>
                  Pay {rs(i.openRequest.amount)}
                </Button>
                <Button onClick={() => onAction({ kind: 'reject', imprest: i })}>Turn down</Button>
              </>
            ) : null}
            {admin && i.isActive ? (
              <>
                <Button onClick={() => onAction({ kind: 'advance', imprest: i })}>Advance cash</Button>
                <Button onClick={() => onAction({ kind: 'return', imprest: i })} disabled={Number(i.cashInHand) <= 0}>
                  Record cash returned
                </Button>
                <Button onClick={() => onAction({ kind: 'float', imprest: i })}>Change the float</Button>
                <Popconfirm title="Close this imprest?" description="The cash in hand must be nil." okText="Close" onConfirm={() => setActive.mutate(false)}>
                  <Button danger>Close</Button>
                </Popconfirm>
              </>
            ) : null}
            {admin && !i.isActive ? <Button onClick={() => setActive.mutate(true)}>Reopen</Button> : null}
          </Space>
          <h4>Cash ledger</h4>
          <Table<ImprestLedgerLine> className="imprest-ledger" rowKey={(l, n) => `${l.kind}-${l.expenseId ?? l.ref ?? ''}-${n}`} size="small" pagination={false} columns={ledgerCols} dataSource={i.ledger} scroll={{ x: 640 }} />
          <h4 style={{ marginTop: 20 }}>Advances, top-ups and returns</h4>
          <Table<ImprestEntryDto> rowKey="id" size="small" pagination={false} columns={entryCols} dataSource={i.entries} scroll={{ x: 640 }} />
        </div>
      ) : null}
    </Drawer>
  );
}
