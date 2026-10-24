'use client';

import React, { useMemo, useState } from 'react';
import { Alert, App, Button, DatePicker, Descriptions, Divider, Drawer, Flex, Input, Modal, Select, Space, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import { CheckCircleOutlined, EyeOutlined, StopOutlined } from '@/components/common/icons';
import type { ModuleTier, PlatformCompanyDto, PlatformUserDto } from '@erp/shared';
import { BILLING_STATUS_LABELS, PRODUCT_NAME, SUPPORT_SESSION_HOURS, MODULE_TIERS, MODULE_TIER_LABELS, SWITCHABLE_MODULE_INFO } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage, startSupportSession } from '@/lib/api';
import { useOpenSupportSession, usePlatformCompanies, usePlatformCompany, useSetModuleTier, useSetTrialEnd, useSuspendCompany } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { themeFontSize } from '@/lib/theme';

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const supportOpen = (c: Pick<PlatformCompanyDto, 'supportAccessUntil'>) => !!c.supportAccessUntil && new Date(c.supportAccessUntil) > new Date();

function StatusTags({ c }: { c: PlatformCompanyDto }) {
  return (
    <Space size={4} wrap>
      {c.suspendedAt ? <AppTag tone="danger">Suspended</AppTag> : <AppTag tone="success">Active</AppTag>}
      {c.deletionScheduledFor && <AppTag tone="pending">Deleting {formatDate(c.deletionScheduledFor)}</AppTag>}
      {supportOpen(c) && <AppTag tone="info">Support allowed</AppTag>}
      {c.billing && (
        <AppTag color={c.billing.status === 'READ_ONLY' ? 'red' : c.billing.status === 'ACTIVE' ? 'green' : 'default'}>
          {BILLING_STATUS_LABELS[c.billing.status]}
          {c.billing.status === 'ACTIVE' && c.billing.paidUntil ? ` to ${formatDate(c.billing.paidUntil)}` : ''}
          {c.billing.status === 'TRIAL' && c.billing.trialEndsAt ? ` to ${formatDate(c.billing.trialEndsAt)}` : ''}
        </AppTag>
      )}
    </Space>
  );
}

/** The console for staff: every company, how much it is used, and suspension and support access. */
export default function PlatformPage() {
  const { user } = useAuth();
  const staff = !!user?.platformAdmin && !user.support;
  const { data, isLoading, error, refetch } = usePlatformCompanies(staff);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t));
  }, [data, q]);

  if (!user) return null;
  if (!staff)
    return (
      <div className="page-container">
        <PageHeader title={`${PRODUCT_NAME} console`} />
        <Alert type="info" title={`This page is for ${PRODUCT_NAME} staff.`} />
      </div>
    );
  const active = data?.filter((c) => !c.suspendedAt && c.actions30d > 0).length ?? 0;

  return (
    <div className="page-container">
      <PageHeader
        title={`${PRODUCT_NAME} console`}
        subtitle={data ? `${data.length} companies, ${active} active in the last 30 days` : 'Every company on the platform'}
        extra={<Input.Search allowClear placeholder="Search name or code" aria-label="Search companies" style={{ width: 240 }} onChange={(e) => setQ(e.target.value)} />}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<PlatformCompanyDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Company',
            dataIndex: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (v: string, r) => (
              <div>
                {v}
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {r.code}, since {formatDate(r.createdAt)}
                </div>
              </div>
            ),
          },
          { title: 'Users', dataIndex: 'activeUsers', width: 80, align: 'right', sorter: (a, b) => a.activeUsers - b.activeUsers },
          { title: 'Projects', dataIndex: 'projects', width: 90, align: 'right', sorter: (a, b) => a.projects - b.projects },
          {
            title: 'Last activity',
            dataIndex: 'lastActivityAt',
            width: 160,
            sorter: (a, b) => (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? ''),
            defaultSortOrder: 'descend',
            render: (v: string | null) => (v ? formatDateTime(v) : '-'),
          },
          { title: 'Actions (30 days)', dataIndex: 'actions30d', width: 140, align: 'right', sorter: (a, b) => a.actions30d - b.actions30d },
          { title: 'Storage', key: 'storage', width: 130, align: 'right', sorter: (a, b) => a.storageBytes - b.storageBytes, render: (_, r) => `${bytes(r.storageBytes)} (${r.files})` },
          { title: 'Status', key: 'status', width: 220, render: (_, r) => <StatusTags c={r} /> },
        ]}
      />
      <CompanyDrawer id={openId} ownOrgId={user.organizationId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function CompanyDrawer({ id, ownOrgId, onClose }: { id: string | null; ownOrgId: string; onClose: () => void }) {
  const { message } = App.useApp();
  const { data, error, refetch } = usePlatformCompany(id);
  const suspend = useSuspendCompany();
  const trial = useSetTrialEnd();
  const plan = useSetModuleTier();
  const open = useOpenSupportSession();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const c = data?.id === id ? data : undefined;

  const doSuspend = async (lift: boolean) => {
    if (!c) return;
    try {
      await suspend.mutateAsync({ id: c.id, reason: lift ? null : reason.trim() });
      message.success(lift ? `${c.name} can sign in again` : `${c.name} is suspended`);
      setAsking(false);
      setReason('');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const setTrial = async (until: string) => {
    if (!c) return;
    try {
      await trial.mutateAsync({ id: c.id, until });
      message.success(`Free trial for ${c.name} ends on ${formatDate(until)}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const setPlan = async (tier: ModuleTier | null) => {
    if (!c) return;
    try {
      await plan.mutateAsync({ id: c.id, tier });
      message.success(`${c.name} is on ${tier ? `the ${MODULE_TIER_LABELS[tier]} plan` : 'every module'}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const view = async () => {
    if (!c) return;
    try {
      const s = await open.mutateAsync(c.id);
      startSupportSession(s.accessToken);
      window.location.href = '/';
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Drawer open={!!id} onClose={onClose} size={760} title={c ? c.name : 'Company'} destroyOnHidden>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {c && (
        <>
          <Space wrap style={{ marginBottom: 16 }}>
            <Tooltip title={supportOpen(c) ? `Read-only for ${SUPPORT_SESSION_HOURS} hours; the visit goes in the company's log` : "The company's admin has not allowed support access"}>
              <Button type="primary" icon={<EyeOutlined />} disabled={!supportOpen(c)} loading={open.isPending} onClick={view}>
                Open read-only
              </Button>
            </Tooltip>
            {c.suspendedAt ? (
              <Button icon={<CheckCircleOutlined />} loading={suspend.isPending} onClick={() => doSuspend(true)}>
                Lift suspension
              </Button>
            ) : (
              <Button danger icon={<StopOutlined />} disabled={c.id === ownOrgId} onClick={() => setAsking(true)}>
                Suspend
              </Button>
            )}
          </Space>
          {c.suspendedAt && <Alert type="error" showIcon style={{ marginBottom: 16 }} title={`Suspended ${formatDateTime(c.suspendedAt)}: ${c.suspendedReason ?? ''}`} />}
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'code', label: 'Code', children: c.code },
              { key: 'since', label: 'Signed up', children: formatDate(c.createdAt) },
              { key: 'users', label: 'Active users', children: c.activeUsers },
              { key: 'projects', label: 'Projects', children: c.projects },
              { key: 'last', label: 'Last activity', children: c.lastActivityAt ? formatDateTime(c.lastActivityAt) : '-' },
              { key: 'acts', label: 'Actions (30 days)', children: c.actions30d },
              { key: 'storage', label: 'Storage', children: `${bytes(c.storageBytes)} in ${c.files} files` },
              { key: 'status', label: 'Status', children: <StatusTags c={c} /> },
              {
                key: 'support',
                label: 'Support access',
                span: 2,
                children: supportOpen(c) ? `Allowed until ${formatDateTime(c.supportAccessUntil!)}${c.supportAccessGrantedByName ? ` by ${c.supportAccessGrantedByName}` : ''}` : 'Not allowed',
              },
              {
                key: 'plan',
                label: 'Module plan',
                span: 2,
                children: (
                  <Flex vertical gap={4}>
                    <Select<ModuleTier | 'ALL'>
                      size="small"
                      aria-label="Module plan"
                      style={{ width: 220 }}
                      disabled={plan.isPending}
                      value={c.moduleTier ?? 'ALL'}
                      onChange={(v) => setPlan(v === 'ALL' ? null : v)}
                      options={[{ value: 'ALL', label: 'Every module' }, ...MODULE_TIERS.map((t) => ({ value: t, label: MODULE_TIER_LABELS[t] }))]}
                    />
                    <span className="text-muted">{c.modulesOff.length ? `Off: ${c.modulesOff.map((k) => SWITCHABLE_MODULE_INFO[k].label).join(', ')}` : 'Every module on'}</span>
                  </Flex>
                ),
              },
              ...(c.billing
                ? [
                    { key: 'paid', label: 'Paid until', children: c.billing.paidUntil ? formatDate(c.billing.paidUntil) : 'Never paid' },
                    {
                      key: 'trial',
                      label: 'Free trial ends',
                      children: (
                        <DatePicker
                          size="small"
                          allowClear={false}
                          aria-label="Free trial ends"
                          disabled={c.billing.status === 'EXEMPT' || trial.isPending}
                          value={c.billing.trialEndsAt ? dayjs(c.billing.trialEndsAt) : null}
                          onChange={(d) => d && setTrial(d.format('YYYY-MM-DD'))}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Users ({c.users.length})
          </Divider>
          <Table<PlatformUserDto>
            rowKey="id"
            size="small"
            dataSource={c.users}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            columns={[
              {
                title: 'Name',
                dataIndex: 'fullName',
                render: (v: string, u) => (
                  <div>
                    {v} {!u.isActive && <AppTag>Inactive</AppTag>}
                    <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      {u.email}
                    </div>
                  </div>
                ),
              },
              { title: 'Role', dataIndex: 'roleName', width: 160 },
              { title: 'Last activity', dataIndex: 'lastActivityAt', width: 160, render: (v: string | null) => (v ? formatDateTime(v) : '-') },
            ]}
          />
        </>
      )}
      <Modal
        open={asking}
        title={c ? `Suspend ${c.name}` : 'Suspend'}
        okText="Suspend"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3, loading: suspend.isPending }}
        onOk={() => doSuspend(false)}
        onCancel={() => setAsking(false)}
        destroyOnHidden
      >
        <Typography.Paragraph>Nobody in the company can sign in until the suspension is lifted. Their data is kept. The reason goes in the company's log, which their admins can read.</Typography.Paragraph>
        <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. payment overdue" aria-label="Reason" maxLength={300} />
      </Modal>
    </Drawer>
  );
}
