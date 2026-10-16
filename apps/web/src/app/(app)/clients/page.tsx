'use client';

import React, { useState } from 'react';
import { App, Button, Card, Checkbox, Popconfirm, Space, Tag, Typography, theme } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientDto } from '@erp/shared';
import { GST_STATES, canEditContract } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { useClientsPage } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';

type ClientSortField = 'name' | 'createdAt';
const KEYS = ['inactive'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

export default function ClientsPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ClientDto | null>(null);
  const [adding, setAdding] = useState(false);
  const editable = !!user && canEditContract(user.roleKey);

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/clients/${id}`)).data,
    onSuccess: () => {
      message.success('Client deleted');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const frame = useListFrame<ClientSortField, ClientDto>({
    list: 'clients',
    keys: KEYS,
    sortBy: 'name',
    sortOrder: 'asc',
    sortFields: ['name', 'createdAt'],
    projectScoped: false,
    moreViews: [{ key: 'inactive', label: 'Including inactive', filters: { inactive: '1' } }],
    chipLabels: { inactive: () => 'Including inactive' },
    columns: (sortOrderFor): ListColumn<ClientDto>[] => [
      {
        title: 'Client',
        key: 'name',
        locked: true,
        sorter: true,
        sortOrder: sortOrderFor('name'),
        render: (_, c) => (
          <div>
            <Typography.Text strong>{c.name}</Typography.Text> {!c.isActive && <Tag>Inactive</Tag>}
            {c.department && <Sub>{c.department}</Sub>}
          </div>
        ),
      },
      { key: 'gstin', title: 'GSTIN', dataIndex: 'gstin', width: 190, render: (v: string | null) => (v ? <span className="mono">{v}</span> : '-') },
      { key: 'stateCode', title: 'State', dataIndex: 'stateCode', width: 170, render: (v: string | null) => (v ? `${v} ${GST_STATES[v] ?? ''}` : '-') },
      {
        title: 'Contact',
        key: 'contact',
        render: (_, c) => (
          <div>
            {c.contactPerson && <div>{c.contactPerson}</div>}
            <Sub>{[c.phone, c.email].filter(Boolean).join(' · ') || (c.contactPerson ? '' : '-')}</Sub>
          </div>
        ),
      },
      { key: 'projectCount', title: 'Projects', dataIndex: 'projectCount', width: 100, align: 'right' },
      { title: 'Added', label: 'Added on', dataIndex: 'createdAt', width: 120, defaultHidden: true, key: 'createdAt', sorter: true, sortOrder: sortOrderFor('createdAt'), render: (v: string) => formatDate(v) },
      ...(editable
        ? [
            {
              title: '',
              key: 'actions',
              label: 'Actions',
              locked: true,
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
            } satisfies ListColumn<ClientDto>,
          ]
        : []),
    ],
  });
  const { page } = frame;
  const includeInactive = page.filters.inactive === '1';
  const { data, isLoading, isFetching, error, refetch } = useClientsPage({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, includeInactive: includeInactive || undefined });
  const rows = data?.items ?? [];

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
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
        {frame.views}
        <ListToolbar projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search name, department, GSTIN">
          <Checkbox checked={includeInactive} onChange={(e) => page.setFilter('inactive', e.target.checked ? '1' : undefined)}>
            Show inactive
          </Checkbox>
        </ListToolbar>
        <DataTable<ClientDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={page.tableProps<ClientDto>(data?.total)}
          onOpen={editable ? (id) => setEditing(rows.find((c) => c.id === id) ?? null) : undefined}
          chips={frame.chips}
          scrollX={900}
          emptyText={<EmptyArt art="entries" title={page.params.q || includeInactive ? 'No client matches these filters' : editable ? 'No clients yet. Add the departments you build for with New client.' : 'No clients yet'} />}
        />
      </Card>
      <ClientFormModal
        open={adding || !!editing}
        client={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
