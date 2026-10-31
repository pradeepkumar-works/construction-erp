'use client';

import React, { useState } from 'react';
import { Alert, Button, Card, Select, Space, Switch, Tooltip, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { useSearchParams } from 'next/navigation';
import { EditOutlined, LinkOutlined, PlusOutlined } from '@/components/common/icons';
import type { PasswordLinkDto, RoleKey, UserSortField, UserSummary } from '@erp/shared';
import { LIST_SORT_FIELDS, ROLE_KEYS, ROLE_LABELS, canManageUsers } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useUsersPage } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { USER_EXPORT } from '@/lib/exportColumns';
import { ExportButton } from '@/components/common/ExportButton';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { UserFormModal } from '@/components/users/UserFormModal';
import { PasswordLinkModal } from '@/components/users/PasswordLinkModal';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { NoAccess } from '@/components/common/NoAccess';

const KEYS = ['roleKey', 'active'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

export default function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [linkResult, setLinkResult] = useState<{ name: string; email: string; invite: boolean; link: PasswordLinkDto } | null>(null);
  const welcome = useSearchParams().get('welcome') === '1';

  const sendLink = useMutation({
    mutationFn: async (u: UserSummary) => ({ u, link: (await api.post<PasswordLinkDto>(`/users/${u.id}/password-link`)).data }),
    onSuccess: ({ u, link }) => setLinkResult({ name: u.fullName, email: u.email, invite: u.invitePending, link }),
    meta: FAIL_NOTICE,
  });

  const toggle = useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => api.patch(`/users/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    meta: FAIL_NOTICE,
  });

  const frame = useListFrame<UserSortField, UserSummary>({
    list: 'users',
    keys: KEYS,
    sortBy: 'fullName',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.users,
    projectScoped: false,
    moreViews: [
      { key: 'inactive', label: 'Inactive', filters: { active: 'no' } },
      { key: 'site', label: 'Site engineers', filters: { roleKey: 'SITE_ENGINEER' } },
    ],
    chipLabels: { roleKey: (v) => `Role: ${ROLE_LABELS[v as RoleKey] ?? v}`, active: (v) => (v === 'no' ? 'Inactive' : 'Active') },
    columns: (sortOrderFor): ListColumn<UserSummary>[] => {
      const sort = (key: UserSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key) });
      return [
        {
          title: 'Name',
          dataIndex: 'fullName',
          locked: true,
          ...sort('fullName'),
          render: (v, r) => (
            <div>
              <strong>{v}</strong>
              {r.invitePending ? (
                <AppTag tone="pending" style={{ marginLeft: 8 }}>
                  Invited
                </AppTag>
              ) : null}
              <Sub>{r.email}</Sub>
            </div>
          ),
        },
        { key: 'phone', title: 'Phone', dataIndex: 'phone', width: 140, render: (v) => v ?? '-' },
        { title: 'Role', dataIndex: 'roleName', width: 220, render: (v) => <AppTag style={{ margin: 0 }}>{v}</AppTag>, ...sort('role') },
        { title: 'Created', dataIndex: 'createdAt', width: 130, render: (v) => formatDate(v), ...sort('createdAt') },
        {
          title: 'Active',
          dataIndex: 'isActive',
          width: 100,
          ...sort('isActive'),
          render: (v: boolean, r) => <Switch size="small" checked={v} disabled={r.id === user?.id} aria-label={`${r.fullName} active`} onChange={(checked) => toggle.mutate({ id: r.id, isActive: checked })} />,
        },
        {
          title: '',
          key: 'actions',
          label: 'Actions',
          locked: true,
          width: 130,
          fixed: 'right' as const,
          render: (_, r) => (
            <Space size={4}>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(r);
                  setFormOpen(true);
                }}
              >
                Edit
              </Button>
              <Tooltip title={r.invitePending ? 'Send the invite again' : 'Send a password reset link'}>
                <Button size="small" icon={<LinkOutlined />} aria-label={`Password link for ${r.fullName}`} disabled={!r.isActive} loading={sendLink.isPending && sendLink.variables?.id === r.id} onClick={() => sendLink.mutate(r)} />
              </Tooltip>
            </Space>
          ),
        },
      ];
    },
  });
  const { page } = frame;
  const roleKey = page.filters.roleKey as RoleKey | undefined;
  const isActive = page.filters.active === 'no' ? false : page.filters.active === 'yes' ? true : undefined;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, roleKey, isActive };
  const { data, isLoading, isFetching, error, refetch } = useUsersPage(filters);
  const rows = data?.items ?? [];
  const exportRows = async () => {
    const all = await fetchAllPages<UserSummary>('/users', filters);
    await downloadXlsx(exportFileName('users'), 'Users', USER_EXPORT, all);
    return all.length;
  };

  if (user && !canManageUsers(user.roleKey)) {
    return (
      <div className="page-container">
        <NoAccess title="Only an admin manages users" />
      </div>
    );
  }


  const newButton = (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      New user
    </Button>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Users"
        subtitle={`${data?.total ?? 0} users${roleKey || isActive !== undefined || page.params.q ? ' match' : ` in ${user?.organizationName ?? 'your organisation'}`}`}
        extra={newButton}
      />
      {welcome && (
        <Alert
          type="success"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          title={`${user?.organizationName ?? 'Your organisation'} is ready.`}
          description="Add your team with New user: each person gets an invite link to choose a password. Then create your first project; it starts with the standard activities for its type."
        />
      )}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
        {frame.views}
        <ListToolbar filters={frame.filterState} projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search name, email, phone" searchLabel="Search users" extra={<ExportButton onExport={exportRows} />}>
          <Select<RoleKey> allowClear placeholder="All roles" aria-label="Role" value={roleKey} onChange={(v) => page.setFilter('roleKey', v)} style={{ width: 220 }} options={ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <Select<'yes' | 'no'>
            allowClear
            placeholder="Active or not"
            aria-label="Active"
            value={page.filters.active as 'yes' | 'no' | undefined}
            onChange={(v) => page.setFilter('active', v)}
            style={{ width: 150 }}
            options={[
              { value: 'yes', label: 'Active' },
              { value: 'no', label: 'Inactive' },
            ]}
          />
        </ListToolbar>
        <DataTable<UserSummary>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={page.tableProps<UserSummary>(data?.total)}
          onOpen={(id) => {
            const u = rows.find((x) => x.id === id);
            if (!u) return;
            setEditing(u);
            setFormOpen(true);
          }}
          bulk={[exportSelected<UserSummary>('users', 'Users', USER_EXPORT)]}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          scrollX={900}
          emptyText={<EmptyArt art="entries" title={roleKey || isActive !== undefined || page.params.q ? 'No user matches these filters' : 'No users yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} user={editing} onInvited={(c) => c.invite && setLinkResult({ name: c.fullName, email: c.email, invite: true, link: c.invite })} />
      <PasswordLinkModal result={linkResult} onClose={() => setLinkResult(null)} />
    </div>
  );
}
