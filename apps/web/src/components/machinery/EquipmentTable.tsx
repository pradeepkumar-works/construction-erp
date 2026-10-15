'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDto, EquipmentOwnership, EquipmentRateUnit, EquipmentSortField } from '@erp/shared';
import { EQUIPMENT_OWNERSHIPS, EQUIPMENT_OWNERSHIP_LABELS, EQUIPMENT_RATE_UNITS, EQUIPMENT_RATE_UNIT_LABELS, canManageEquipment } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEquipment, useProjects } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate, formatINR } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { EQUIPMENT_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { OwnershipTag } from './hours';
import { VendorPicker } from '@/components/vendors/VendorPicker';

interface EquipmentForm {
  code: string;
  name: string;
  category?: string;
  ownership: EquipmentOwnership;
  supplier?: string;
  registrationNo?: string;
  rate?: number;
  rateUnit: EquipmentRateUnit;
  projectId?: string;
  isActive?: boolean;
}

/** Equipment master. Everyone sees the fleet and where it is deployed; approvers add machines, set rates and move them. */
export function EquipmentTable({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mayManage = !!user && canManageEquipment(user.roleKey);
  const list = useListState<EquipmentSortField>({ sortBy: 'code', sortOrder: 'asc', pageSize: 50 });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [ownership, setOwnership] = useState<EquipmentOwnership | undefined>();
  const [includeInactive, setIncludeInactive] = useState(false);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, ownership, includeInactive: includeInactive || undefined };
  const { data, isLoading, isFetching, error, refetch } = useEquipment(filters);
  const { data: projects } = useProjects();
  const [editing, setEditing] = useState<EquipmentDto | 'new' | null>(null);
  const [form] = Form.useForm<EquipmentForm>();
  const formOwnership = Form.useWatch('ownership', form);

  const save = useMutation({
    mutationFn: async (v: EquipmentForm) => {
      const body = {
        code: v.code,
        name: v.name,
        category: v.category?.trim() || null,
        ownership: v.ownership,
        supplier: v.ownership === 'HIRED' ? v.supplier?.trim() || null : null,
        registrationNo: v.registrationNo?.trim() || null,
        rate: v.rate === undefined || v.rate === null ? null : String(v.rate),
        rateUnit: v.rateUnit,
        projectId: v.projectId ?? null,
        ...(editing && editing !== 'new' ? { isActive: v.isActive ?? true } : {}),
      };
      return editing && editing !== 'new' ? (await api.patch<EquipmentDto>(`/equipment/${editing.id}`, body)).data : (await api.post<EquipmentDto>('/equipment', body)).data;
    },
    onSuccess: (e) => {
      message.success(`${e.code} saved`);
      qc.invalidateQueries({ queryKey: ['machinery'] });
      setEditing(null);
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: async (e: EquipmentDto) => (await api.delete(`/equipment/${e.id}`)).data,
    onSuccess: () => {
      message.success('Machine deleted');
      qc.invalidateQueries({ queryKey: ['machinery'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const open = (e: EquipmentDto | 'new') => {
    setEditing(e);
    form.resetFields();
    if (e === 'new') form.setFieldsValue({ ownership: 'OWNED', rateUnit: 'HOUR', projectId: fixedProject });
    else
      form.setFieldsValue({
        code: e.code,
        name: e.name,
        category: e.category ?? undefined,
        ownership: e.ownership,
        supplier: e.supplier ?? undefined,
        registrationNo: e.registrationNo ?? undefined,
        rate: e.rate === null ? undefined : Number(e.rate),
        rateUnit: e.rateUnit,
        projectId: e.projectId ?? undefined,
        isActive: e.isActive,
      });
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<EquipmentDto>('/equipment', { ...filters });
    downloadXlsx(exportFileName('equipment'), 'equipment', EQUIPMENT_EXPORT, rows);
    return rows.length;
  };

  const sort = (key: EquipmentSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<EquipmentDto>['columns'] = [
    { title: 'Code', dataIndex: 'code', width: 110, className: 'mono', ...sort('code') },
    {
      title: 'Equipment',
      dataIndex: 'name',
      ...sort('name'),
      render: (v, r) => (
        <div>
          {v} {r.isActive ? null : <Tag style={{ marginLeft: 4 }}>Inactive</Tag>}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[r.registrationNo, r.supplier].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
      ),
    },
    { title: 'Category', dataIndex: 'category', width: 130, ...sort('category'), render: (v) => v ?? <span className="text-muted">-</span> },
    { title: 'Owned / hired', dataIndex: 'ownership', width: 120, ...sort('ownership'), render: (o) => <OwnershipTag ownership={o} /> },
    ...(fixedProject ? [] : [{ title: 'Deployed at', dataIndex: 'projectName', width: 240, ellipsis: true, ...sort('project'), render: (v: string | null) => v ?? <span className="text-muted">Yard / unassigned</span> }]),
    ...(mayManage
      ? [{ title: 'Rate', key: 'rate', width: 150, align: 'right' as const, render: (_: unknown, r: EquipmentDto) => (r.rate === null ? '-' : `${formatINR(r.rate)} ${EQUIPMENT_RATE_UNIT_LABELS[r.rateUnit]}`) }]
      : []),
    { title: 'Last log', dataIndex: 'lastLogDate', width: 120, render: (v) => (v ? formatDate(v) : <span className="text-muted">never</span>) },
    ...(mayManage
      ? [
          {
            title: '',
            key: 'actions',
            fixed: 'right' as const,
            width: 90,
            render: (_: unknown, r: EquipmentDto) => (
              <Space size={2}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Edit" />
                <Popconfirm title={`Delete ${r.code}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(r)} disabled={!!r.lastLogDate}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={!!r.lastLogDate} title={r.lastLogDate ? 'Has logs; mark it inactive instead' : undefined} aria-label="Delete" />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={(v) => {
          setProjectFilter(v);
          list.resetPage();
        }}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search code, name, registration, agency"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {mayManage ? (
              <Button icon={<PlusOutlined />} onClick={() => open('new')}>
                Add machine
              </Button>
            ) : null}
          </>
        }
      >
        <Select
          allowClear
          placeholder="Owned and hired"
          style={{ width: 160 }}
          value={ownership}
          onChange={(v) => {
            setOwnership(v);
            list.resetPage();
          }}
          options={EQUIPMENT_OWNERSHIPS.map((o) => ({ value: o, label: EQUIPMENT_OWNERSHIP_LABELS[o] }))}
        />
        <Checkbox
          checked={includeInactive}
          onChange={(e) => {
            setIncludeInactive(e.target.checked);
            list.resetPage();
          }}
        >
          Show inactive
        </Checkbox>
      </ListToolbar>
      <Table<EquipmentDto> size="middle" rowKey="id" loading={isLoading || isFetching} dataSource={data?.items ?? []} columns={columns} {...list.tableProps<EquipmentDto>(data?.total)} scroll={{ x: 1000 }} />
      <Modal open={!!editing} title={editing === 'new' ? 'Add machine' : 'Edit machine'} onCancel={() => setEditing(null)} onOk={() => form.submit()} okButtonProps={{ loading: save.isPending }} width={620} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
            <Form.Item name="code" label="Code" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
              <Input maxLength={30} placeholder="EXC-02" />
            </Form.Item>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
              <Input maxLength={120} placeholder="Excavator (Tata Hitachi EX200)" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="category" label="Category">
              <Input maxLength={60} placeholder="Earthmoving, Compaction, Lifting" />
            </Form.Item>
            <Form.Item name="registrationNo" label="Registration / serial no.">
              <Input maxLength={40} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
            <Form.Item name="ownership" label="Owned / hired" rules={[{ required: true }]}>
              <Select options={EQUIPMENT_OWNERSHIPS.map((o) => ({ value: o, label: EQUIPMENT_OWNERSHIP_LABELS[o] }))} />
            </Form.Item>
            <Form.Item name="supplier" label="Hire agency" hidden={formOwnership !== 'HIRED'}>
              <VendorPicker kind="HIRE_AGENCY" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="rate" label={formOwnership === 'HIRED' ? 'Hire rate (₹)' : 'Internal rate (₹)'} extra="Used for the project cost view">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="rateUnit" label="Rate per" rules={[{ required: true }]}>
              <Select options={EQUIPMENT_RATE_UNITS.map((u) => ({ value: u, label: EQUIPMENT_RATE_UNIT_LABELS[u] }))} />
            </Form.Item>
          </div>
          <Form.Item name="projectId" label="Deployed at">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Yard / unassigned" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
          </Form.Item>
          {editing && editing !== 'new' ? (
            <Form.Item name="isActive" valuePropName="checked">
              <Checkbox>Active (inactive machines cannot be logged)</Checkbox>
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </>
  );
}
