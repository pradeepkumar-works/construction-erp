'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Card, Input, Result, Switch, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { UserSummary } from '@erp/shared';
import { canManageUsers } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useUsers } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { UserFormModal } from '@/components/users/UserFormModal';

export default function UsersPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useUsers();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);

  const toggle = useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => api.patch(`/users/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => message.error(errorMessage(err)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.roleName.toLowerCase().includes(q));
  }, [data, search]);

  if (user && !canManageUsers(user.roleKey)) {
    return (
      <div className="page-container">
        <Result status="403" title="Admins only" subTitle="User management is restricted to administrators." />
      </div>
    );
  }

  const columns: TableProps<UserSummary>['columns'] = [
    { title: 'Name', dataIndex: 'fullName', sorter: (a, b) => a.fullName.localeCompare(b.fullName), render: (v, r) => <div><strong>{v}</strong><div className="text-muted" style={{ fontSize: 12 }}>{r.email}</div></div> },
    { title: 'Phone', dataIndex: 'phone', width: 140, render: (v) => v ?? '-' },
    { title: 'Role', dataIndex: 'roleName', width: 220, render: (v) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: 'Created', dataIndex: 'createdAt', width: 130, render: (v) => formatDate(v) },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 90,
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
        subtitle={`${data?.length ?? 0} users in ${user?.organizationName ?? 'your organisation'}`}
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
        <div style={{ padding: 12, borderBottom: '1px solid #f0f0f0' }}>
          <Input.Search placeholder="Search name, email, role" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300, maxWidth: '100%' }} />
        </div>
        <Table<UserSummary> rowKey="id" loading={isLoading} columns={columns} dataSource={filtered} size="middle" pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 800 }} />
      </Card>
      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} user={editing} />
    </div>
  );
}
