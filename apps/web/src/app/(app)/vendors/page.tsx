'use client';

import React, { useState } from 'react';
import { App, Button, Card, Checkbox, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MsmeCategory, UnlistedVendorDto, VendorDto, VendorKind, VendorSortField } from '@erp/shared';
import { GST_STATES, MSME_CATEGORIES, MSME_CATEGORY_LABELS, VENDOR_KINDS, VENDOR_KIND_LABELS, canEditVendors, canSeeVendorBank } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { useUnlistedVendors, useVendorsPage } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { VENDOR_EXPORT } from '@/lib/exportColumns';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { VendorFormModal } from '@/components/vendors/VendorFormModal';

const usedOn = (r: { expenseCount: number; equipmentCount: number; grnCount: number }) =>
  [
    r.grnCount ? `${r.grnCount} GRN${r.grnCount === 1 ? '' : 's'}` : null,
    r.equipmentCount ? `${r.equipmentCount} machine${r.equipmentCount === 1 ? '' : 's'}` : null,
    r.expenseCount ? `${r.expenseCount} expense${r.expenseCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || '-';

function VendorsTab({ editable, onEdit }: { editable: boolean; onEdit: (v: VendorDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const list = useListState<VendorSortField>({ sortBy: 'name', sortOrder: 'asc' });
  const [kind, setKind] = useState<VendorKind | undefined>();
  const [msme, setMsme] = useState<MsmeCategory | undefined>();
  const [includeInactive, setIncludeInactive] = useState(false);
  const filters = { ...list.params, kind, msme, includeInactive };
  const { data, isLoading, isFetching, error, refetch } = useVendorsPage(filters);
  const bank = !!user && canSeeVendorBank(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendors/${id}`)).data,
    onSuccess: () => {
      message.success('Vendor deleted');
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const exportRows = async () => {
    const rows = await fetchAllPages<VendorDto>('/vendors', { ...filters });
    downloadXlsx(exportFileName('vendors'), 'Vendors', VENDOR_EXPORT.filter((c) => bank || !['Account name', 'Account no.', 'IFSC', 'Bank'].includes(c.header)), rows);
    return rows.length;
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar projectId={undefined} onProject={() => undefined} hideProject search={list.search} onSearch={list.setSearch} searchPlaceholder="Search name, GSTIN, PAN, contact" extra={<ExportButton onExport={exportRows} />}>
        <Select<VendorKind> allowClear placeholder="Supplies anything" style={{ width: 190 }} value={kind} onChange={reset(setKind)} options={VENDOR_KINDS.map((k) => ({ value: k, label: VENDOR_KIND_LABELS[k] }))} />
        <Select<MsmeCategory> allowClear placeholder="MSME or not" style={{ width: 150 }} value={msme} onChange={reset(setMsme)} options={MSME_CATEGORIES.map((c) => ({ value: c, label: MSME_CATEGORY_LABELS[c] }))} />
        <Checkbox checked={includeInactive} onChange={(e) => reset(setIncludeInactive)(e.target.checked)}>
          Show inactive
        </Checkbox>
      </ListToolbar>
      <Table<VendorDto>
        rowKey="id"
        size="middle"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        scroll={{ x: 1100 }}
        {...list.tableProps<VendorDto>(data?.total)}
        columns={[
          {
            title: 'Vendor',
            key: 'name',
            sorter: true,
            sortOrder: list.sortOrderFor('name'),
            render: (_, v) => (
              <div>
                <Typography.Text strong>{v.name}</Typography.Text> {!v.isActive && <Tag>Inactive</Tag>}
                <div style={{ marginTop: 2 }}>
                  {v.kinds.map((k) => (
                    <Tag key={k} style={{ fontSize: 11 }}>
                      {VENDOR_KIND_LABELS[k]}
                    </Tag>
                  ))}
                </div>
              </div>
            ),
          },
          {
            title: 'GSTIN / PAN',
            key: 'gstin',
            width: 190,
            render: (_, v) => (
              <div style={{ fontSize: 12 }}>
                <div className="mono">{v.gstin ?? '-'}</div>
                <div className="text-muted">{[v.pan, v.stateCode ? GST_STATES[v.stateCode] : null].filter(Boolean).join(' · ')}</div>
              </div>
            ),
          },
          {
            title: 'MSME',
            key: 'msme',
            width: 120,
            render: (_, v) =>
              v.msmeCategory ? (
                <Tag color={v.msmeCategory === 'MEDIUM' ? 'default' : 'orange'} title={v.udyamNo ?? undefined}>
                  {MSME_CATEGORY_LABELS[v.msmeCategory]}
                </Tag>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
          {
            title: 'Contact',
            key: 'contact',
            render: (_, v) => (
              <div style={{ fontSize: 12 }}>
                {v.contactPerson && <div>{v.contactPerson}</div>}
                <div className="text-muted">{[v.phone, v.email].filter(Boolean).join(' · ') || (v.contactPerson ? '' : '-')}</div>
              </div>
            ),
          },
          ...(bank
            ? [
                {
                  title: 'Bank',
                  key: 'bank',
                  width: 200,
                  render: (_: unknown, v: VendorDto) =>
                    v.bankAccountNo ? (
                      <div style={{ fontSize: 12 }}>
                        <div className="mono">{v.bankAccountNo}</div>
                        <div className="text-muted">{[v.bankIfsc, v.bankName].filter(Boolean).join(' · ')}</div>
                      </div>
                    ) : (
                      <span className="text-muted">-</span>
                    ),
                },
              ]
            : []),
          { title: 'Used on', key: 'used', width: 190, render: (_, v) => <span style={{ fontSize: 12 }}>{usedOn(v)}</span> },
          ...(editable
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 96,
                  render: (_: unknown, v: VendorDto) => (
                    <Space size={4}>
                      <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${v.name}`} onClick={() => onEdit(v)} />
                      {v.expenseCount + v.equipmentCount + v.grnCount === 0 ? (
                        <Popconfirm title={`Delete ${v.name}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(v.id)}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${v.name}`} />
                        </Popconfirm>
                      ) : null}
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

function UnlistedTab({ editable, onAdd }: { editable: boolean; onAdd: (u: UnlistedVendorDto) => void }) {
  const { data, isLoading, error, refetch } = useUnlistedVendors();
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Typography.Paragraph type="secondary" style={{ padding: '12px 12px 0' }}>
        Names typed on expenses, machines and GRNs that match no vendor in the master. Adding one links those entries to it; entries typed later with the same name link on their own.
      </Typography.Paragraph>
      <Table<UnlistedVendorDto>
        rowKey="name"
        size="middle"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={false}
        locale={{ emptyText: 'Every vendor name in use is in the master' }}
        columns={[
          { title: 'Name as typed', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
          { title: 'GSTIN typed with it', dataIndex: 'gstin', width: 190, render: (v: string | null) => (v ? <span className="mono">{v}</span> : '-') },
          { title: 'Used on', key: 'used', width: 220, render: (_, u) => usedOn(u) },
          ...(editable
            ? [
                {
                  title: '',
                  key: 'add',
                  width: 150,
                  render: (_: unknown, u: UnlistedVendorDto) => (
                    <Button size="small" icon={<PlusOutlined />} onClick={() => onAdd(u)}>
                      Add to master
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

export default function VendorsPage() {
  const { user } = useAuth();
  const editable = !!user && canEditVendors(user.roleKey);
  const [editing, setEditing] = useState<VendorDto | null>(null);
  const [adding, setAdding] = useState<Partial<{ name: string; gstin: string; kinds: VendorKind[] }> | null>(null);
  const { data: unlisted } = useUnlistedVendors(editable);

  return (
    <div className="page-container">
      <PageHeader
        title="Vendors"
        subtitle="Suppliers, hire agencies, subcontractors and service providers, with GSTIN, MSME registration and bank details. Expenses, machines and GRNs pick from this list."
        extra={
          editable ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding({})}>
              New vendor
            </Button>
          ) : null
        }
      />
      <Card className="table-card" size="small">
        <Tabs
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            { key: 'vendors', label: 'Vendor master', children: <VendorsTab editable={editable} onEdit={setEditing} /> },
            {
              key: 'unlisted',
              label: `Not in the master${unlisted?.length ? ` (${unlisted.length})` : ''}`,
              children: (
                <UnlistedTab
                  editable={editable}
                  onAdd={(u) =>
                    setAdding({
                      name: u.name,
                      gstin: u.gstin ?? undefined,
                      kinds: [...(u.grnCount ? (['SUPPLIER'] as const) : []), ...(u.equipmentCount ? (['HIRE_AGENCY'] as const) : [])],
                    })
                  }
                />
              ),
            },
          ]}
        />
      </Card>
      <VendorFormModal
        open={!!adding || !!editing}
        vendor={editing}
        initial={adding}
        onClose={() => {
          setAdding(null);
          setEditing(null);
        }}
      />
    </div>
  );
}
