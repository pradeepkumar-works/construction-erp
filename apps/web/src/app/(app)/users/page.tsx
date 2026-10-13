'use client';

import React, { useState } from 'react';
import { App, Button, Card, Result, Select, Switch, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { RoleKey, UserSortField, UserSummary } from '@erp/shared';
import { ROLE_KEYS, ROLE_LABELS, canManageUsers } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useUsersPage } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { USER_EXPORT } from '@/lib/exportColumns';
import { ExportButton } from '@/components/common/ExportButton';
import { SearchBox } from '@/components/common/SearchBox';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { UserFormModal } from '@/components/users/UserFormModal';

export default function UsersPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const list = useListState<UserSortField>({ sortBy: 'fullName', sortOrder: 'asc', pageSize: 25 });
  const [roleKey, setRoleKey] = useState<RoleKey | undefined>();
  const filters = { ...list.params, roleKey };
  const { data, isLoading, isFetching, error, refetch } = useUsersPage(filters);
  const sort = (key: UserSortField): Pick<ColumnType<UserSummary>, 'key' | 'sorter' | 'sortOrder'> => ({ key, sorter: true, sortOrder: list.sortOrderFor(key) });
  const exportRows = async () => {
    const rows = await fetchAllPages<UserSummary>('/users', filters);
    downloadXlsx(exportFileName('users'), 'Users', USER_EXPORT, rows);
    return rows.length;
  };
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);

  const toggle = useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => api.patch(`/users/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => message.error(errorMessage(err)),
  });

  if (user && !canManageUsers(user.roleKey)) {
    return (
      <div className="page-container">
        <Result status="403" title="Admins only" subTitle="User management is restricted to administrators." />
      </div>
    );
  }

  const columns: TableProps<UserSummary>['columns'] = [
    { title: 'Name', dataIndex: 'fullName', ...sort('fullName'), render: (v, r) => <div><strong>{v}</strong><div className="text-muted" style={{ fontSize: 12 }}>{r.email}</div></div> },
    { title: 'Phone', dataIndex: 'phone', width: 140, render: (v) => v ?? '-' },
    { title: 'Role', dataIndex: 'roleName', width: 220, render: (v) => <Tag style={{ margin: 0 }}>{v}</Tag>, ...sort('role') },
    { title: 'Created', dataIndex: 'createdAt', width: 130, render: (v) => formatDate(v), ...sort('createdAt') },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 100,
      ...sort('isActive'),
      render: (v: boolean, r) => <Switch size="small" checked={v} disabled={r.id === user?.id} onChange={(checked) => toggle.mutate({ id: r.id, isActive: checked })} />,
    },
    {
      title: '',
      key: 'a',
      width: 80,
      render: (_, r) => (
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
      ),
    },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Users"
        subtitle={`${data?.total ?? 0} users${roleKey || list.params.q ? ' match' : ` in ${user?.organizationName ?? 'your organisation'}`}`}
        extra={
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
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0' }}>
          <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search name, email, phone" width={300} />
          <Select allowClear placeholder="All roles" value={roleKey} onChange={(v) => { setRoleKey(v); list.resetPage(); }} style={{ width: 220 }} options={ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <div style={{ marginLeft: 'auto' }}>
            <ExportButton onExport={exportRows} />
          </div>
        </div>
        <Table<UserSummary> rowKey="id" loading={isLoading || isFetching} columns={columns} dataSource={data?.items ?? []} size="middle" scroll={{ x: 800 }} {...list.tableProps<UserSummary>(data?.total)} />
      </Card>
      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} user={editing} />
    </div>
  );
}
