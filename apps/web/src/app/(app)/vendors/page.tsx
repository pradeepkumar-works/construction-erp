'use client';

import React, { useState } from 'react';
import { App, Button, Card, Checkbox, Flex, Popconfirm, Select, Space, Table, Tabs, Tag, Typography, theme } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MsmeCategory, UnlistedVendorDto, VendorDto, VendorKind, VendorSortField } from '@erp/shared';
import { GST_STATES, LIST_SORT_FIELDS, MSME_CATEGORIES, MSME_CATEGORY_LABELS, VENDOR_KINDS, VENDOR_KIND_LABELS, canEditVendors, canSeeVendorBank } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { useUnlistedVendors, useVendorsPage } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { VENDOR_EXPORT } from '@/lib/exportColumns';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { VendorFormModal } from '@/components/vendors/VendorFormModal';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { formatDate } from '@/lib/format';

const usedOn = (r: { expenseCount: number; equipmentCount: number; grnCount: number }) =>
  [
    r.grnCount ? `${r.grnCount} GRN${r.grnCount === 1 ? '' : 's'}` : null,
    r.equipmentCount ? `${r.equipmentCount} machine${r.equipmentCount === 1 ? '' : 's'}` : null,
    r.expenseCount ? `${r.expenseCount} expense${r.expenseCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || '-';

const KEYS = ['kind', 'msme', 'inactive'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function VendorsTab({ editable, onEdit, emptyAction }: { editable: boolean; onEdit: (v: VendorDto) => void; emptyAction?: React.ReactNode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const bank = !!user && canSeeVendorBank(user.roleKey);

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendors/${id}`)).data,
    onSuccess: () => {
      message.success('Vendor deleted');
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const frame = useListFrame<VendorSortField, VendorDto>({
    list: 'vendors',
    keys: KEYS,
    sortBy: 'name',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.vendors,
    projectScoped: false,
    moreViews: [
      { key: 'suppliers', label: 'Suppliers', filters: { kind: 'SUPPLIER' } },
      { key: 'subcontractors', label: 'Subcontractors', filters: { kind: 'SUBCONTRACTOR' } },
      { key: 'hire', label: 'Hire agencies', filters: { kind: 'HIRE_AGENCY' } },
      { key: 'inactive', label: 'Including inactive', filters: { inactive: '1' } },
    ],
    chipLabels: {
      kind: (v) => `Supplies: ${VENDOR_KIND_LABELS[v as VendorKind] ?? v}`,
      msme: (v) => `MSME: ${MSME_CATEGORY_LABELS[v as MsmeCategory] ?? v}`,
      inactive: () => 'Including inactive',
    },
    columns: (sortOrderFor): ListColumn<VendorDto>[] => [
      {
        card: 'title',
        cardText: (v) => v.name,
        title: 'Vendor',
        key: 'name',
        locked: true,
        sorter: true,
        sortOrder: sortOrderFor('name'),
        render: (_, v) => (
          <div>
            <Typography.Text strong>{v.name}</Typography.Text> {!v.isActive && <Tag>Inactive</Tag>}
            <Flex gap={4} wrap style={{ marginTop: 2 }}>
              {v.kinds.map((k) => (
                <Tag key={k} style={{ margin: 0 }}>
                  {VENDOR_KIND_LABELS[k]}
                </Tag>
              ))}
            </Flex>
          </div>
        ),
      },
      {
        title: 'GSTIN / PAN',
        key: 'gstin',
        width: 190,
        render: (_, v) => (
          <div>
            <div className="mono">{v.gstin ?? '-'}</div>
            <Sub>{[v.pan, v.stateCode ? GST_STATES[v.stateCode] : null].filter(Boolean).join(' · ')}</Sub>
          </div>
        ),
      },
      {
        card: 'status',
        title: 'MSME',
        key: 'msme',
        width: 120,
        render: (_, v) =>
          v.msmeCategory ? (
            <Tag color={v.msmeCategory === 'MEDIUM' ? 'default' : 'orange'} title={v.udyamNo ?? undefined} style={{ margin: 0 }}>
              {MSME_CATEGORY_LABELS[v.msmeCategory]}
            </Tag>
          ) : (
            <Sub>-</Sub>
          ),
      },
      {
        card: 'meta',
        cardText: (v) => [v.kinds.map((k) => VENDOR_KIND_LABELS[k]).join(', '), v.contactPerson, v.phone].filter(Boolean).join(' · '),
        title: 'Contact',
        key: 'contact',
        render: (_, v) => (
          <div>
            {v.contactPerson && <div>{v.contactPerson}</div>}
            <Sub>{[v.phone, v.email].filter(Boolean).join(' · ') || (v.contactPerson ? '' : '-')}</Sub>
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
                  <div>
                    <div className="mono">{v.bankAccountNo}</div>
                    <Sub>{[v.bankIfsc, v.bankName].filter(Boolean).join(' · ')}</Sub>
                  </div>
                ) : (
                  <Sub>-</Sub>
                ),
            } satisfies ListColumn<VendorDto>,
          ]
        : []),
      { title: 'Used on', key: 'used', width: 190, defaultFrom: 1400, render: (_, v) => usedOn(v) },
      { title: 'Added', label: 'Added on', key: 'createdAt', dataIndex: 'createdAt', width: 120, defaultHidden: true, sorter: true, sortOrder: sortOrderFor('createdAt'), render: (v: string) => formatDate(v) },
      ...(editable
        ? [
            {
              title: '',
              key: 'actions',
              label: 'Actions',
              locked: true,
              fixed: 'right' as const,
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
            } satisfies ListColumn<VendorDto>,
          ]
        : []),
    ],
  });
  const { page } = frame;
  const kind = page.filters.kind as VendorKind | undefined;
  const msme = page.filters.msme as MsmeCategory | undefined;
  const includeInactive = page.filters.inactive === '1';
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, kind, msme, includeInactive: includeInactive || undefined };
  const { data, isLoading, isFetching, error, refetch } = useVendorsPage(filters);
  const rows = data?.items ?? [];
  const exportCols = VENDOR_EXPORT.filter((c) => bank || !['Account name', 'Account no.', 'IFSC', 'Bank'].includes(c.header));

  const exportRows = async () => {
    const all = await fetchAllPages<VendorDto>('/vendors', { ...filters });
    await downloadXlsx(exportFileName('vendors'), 'Vendors', exportCols, all);
    return all.length;
  };

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState} projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search name, GSTIN, PAN, contact" searchLabel="Search vendors" extra={<ExportButton onExport={exportRows} />}>
        <Select<VendorKind> allowClear placeholder="Supplies anything" aria-label="Supplies" style={{ width: 190 }} value={kind} onChange={(v) => page.setFilter('kind', v)} options={VENDOR_KINDS.map((k) => ({ value: k, label: VENDOR_KIND_LABELS[k] }))} />
        <Select<MsmeCategory> allowClear placeholder="MSME or not" aria-label="MSME" style={{ width: 150 }} value={msme} onChange={(v) => page.setFilter('msme', v)} options={MSME_CATEGORIES.map((c) => ({ value: c, label: MSME_CATEGORY_LABELS[c] }))} />
        <Checkbox checked={includeInactive} onChange={(e) => page.setFilter('inactive', e.target.checked ? '1' : undefined)}>
          Show inactive
        </Checkbox>
      </ListToolbar>
      <DataTable<VendorDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<VendorDto>(data?.total)}
        onOpen={editable ? (id) => { const v = rows.find((x) => x.id === id); if (v) onEdit(v); } : undefined}
        bulk={[exportSelected<VendorDto>('vendors', 'Vendors', exportCols)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1100}
        emptyText={<EmptyArt art="entries" title={kind || msme || page.params.q ? 'No vendor matches these filters' : 'No vendors yet'} />}
        emptyAction={emptyAction}
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

  const newButton = editable ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding({})}>
      New vendor
    </Button>
  ) : null;

  return (
    <div className="page-container">
      <PageHeader
        title="Vendors"
        subtitle="Suppliers, hire agencies, subcontractors and service providers, with GSTIN, MSME registration and bank details. Expenses, machines and GRNs pick from this list."
        extra={newButton}
      />
      <Card size="small">
        <Tabs
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            { key: 'vendors', label: 'Vendor master', children: <VendorsTab editable={editable} onEdit={setEditing} emptyAction={newButton} /> },
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
