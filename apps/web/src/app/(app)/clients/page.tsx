'use client';

import React, { useState } from 'react';
import { App, Button, Card, Checkbox, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientDto } from '@erp/shared';
import { GST_STATES, canEditContract } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { useClientsPage } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { SearchBox } from '@/components/common/SearchBox';
import { ClientFormModal } from '@/components/clients/ClientFormModal';

export default function ClientsPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const list = useListState<'name' | 'createdAt'>({ sortBy: 'name', sortOrder: 'asc' });
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<ClientDto | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useClientsPage({ ...list.params, includeInactive });
  const editable = !!user && canEditContract(user.roleKey);

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/clients/${id}`)).data,
    onSuccess: () => {
      message.success('Client deleted');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Clients"
        subtitle="The departments and owners you build for. A project's Contract tab links it to a client; bills carry the client's GSTIN and address."
        extra={
          editable ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              New client
            </Button>
          ) : null
        }
      />
      <Card size="small">
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        <Space wrap style={{ marginBottom: 12 }}>
          <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search name, department, GSTIN" />
          <Checkbox
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              list.resetPage();
            }}
          >
            Show inactive
          </Checkbox>
        </Space>
        <Table<ClientDto>
          rowKey="id"
          size="middle"
          loading={isLoading || isFetching}
          dataSource={data?.items ?? []}
          scroll={{ x: 900 }}
          {...list.tableProps<ClientDto>(data?.total)}
          columns={[
            {
              title: 'Client',
              key: 'name',
              sorter: true,
              sortOrder: list.sortOrderFor('name'),
              render: (_, c) => (
                <div>
                  <Typography.Text strong>{c.name}</Typography.Text> {!c.isActive && <Tag>Inactive</Tag>}
                  {c.department && <div className="text-muted" style={{ fontSize: 12 }}>{c.department}</div>}
                </div>
              ),
            },
            { title: 'GSTIN', dataIndex: 'gstin', render: (v: string | null) => v ?? '-' },
            { title: 'State', dataIndex: 'stateCode', render: (v: string | null) => (v ? `${v} ${GST_STATES[v] ?? ''}` : '-') },
            {
              title: 'Contact',
              key: 'contact',
              render: (_, c) => (
                <div style={{ fontSize: 12 }}>
                  {c.contactPerson && <div>{c.contactPerson}</div>}
                  <div className="text-muted">{[c.phone, c.email].filter(Boolean).join(' · ') || (c.contactPerson ? '' : '-')}</div>
                </div>
              ),
            },
            { title: 'Projects', dataIndex: 'projectCount', align: 'right' },
            ...(editable
              ? [
                  {
                    title: '',
                    key: 'actions',
                    width: 96,
                    render: (_: unknown, c: ClientDto) => (
                      <Space size={4}>
                        <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
                        {c.projectCount === 0 ? (
                          <Popconfirm title={`Delete ${c.name}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(c.id)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${c.name}`} />
                          </Popconfirm>
                        ) : null}
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <ClientFormModal open={adding || !!editing} client={editing} onClose={() => { setAdding(false); setEditing(null); }} />
    </div>
  );
}
