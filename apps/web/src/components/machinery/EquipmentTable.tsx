'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag, theme } from 'antd';
import dayjs from 'dayjs';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDto, EquipmentOwnership, EquipmentRateUnit, EquipmentSortField } from '@erp/shared';
import { EQUIPMENT_OWNERSHIPS, EQUIPMENT_OWNERSHIP_LABELS, EQUIPMENT_RATE_UNITS, EQUIPMENT_RATE_UNIT_LABELS, LIST_SORT_FIELDS, canManageEquipment } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEquipment, useProjects } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { EQUIPMENT_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { OwnershipTag } from './hours';
import { VendorPicker } from '@/components/vendors/VendorPicker';

const KEYS = ['ownership', 'inactive'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

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
  serviceIntervalHours?: number | null;
  serviceIntervalDays?: number | null;
  lastServiceDate?: dayjs.Dayjs | null;
}

/** Equipment master. Everyone sees the fleet and where it is deployed; approvers add machines, set rates and move them. */
export function EquipmentTable({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mayManage = !!user && canManageEquipment(user.roleKey);
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
        serviceIntervalHours: v.serviceIntervalHours ? String(v.serviceIntervalHours) : null,
        serviceIntervalDays: v.serviceIntervalDays || null,
        lastServiceDate: v.lastServiceDate ? v.lastServiceDate.format('YYYY-MM-DD') : null,
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
        serviceIntervalHours: e.serviceIntervalHours === null ? null : Number(e.serviceIntervalHours),
        serviceIntervalDays: e.serviceIntervalDays,
        lastServiceDate: e.lastServiceDate ? dayjs(e.lastServiceDate) : null,
      });
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<EquipmentDto>('/equipment', { ...filters });
    downloadXlsx(exportFileName('equipment'), 'equipment', EQUIPMENT_EXPORT, rows);
    return rows.length;
  };

  const frame = useListFrame<EquipmentSortField, EquipmentDto>({
    list: 'equipment',
    url: false,
    keys: KEYS,
    sortBy: 'code',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.equipment,
    fixedProject,
    chipLabels: { ownership: (v) => EQUIPMENT_OWNERSHIP_LABELS[v as EquipmentOwnership] ?? v, inactive: () => 'Including inactive' },
    columns: (sortOrderFor): ListColumn<EquipmentDto>[] => {
      const sort = (key: EquipmentSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Code', dataIndex: 'code', width: 110, className: 'mono', ...sort('code') },
        {
          title: 'Equipment',
          ...sort('name'),
          locked: true,
          render: (_, r) => (
            <div>
              {mayManage ? (
                <RecordLink onOpen={() => open(r)} strong>
                  {r.name}
                </RecordLink>
              ) : (
                r.name
              )}{' '}
              {r.isActive ? null : <Tag style={{ marginLeft: 4 }}>Inactive</Tag>}
              <Sub>{[r.registrationNo, r.supplier].filter(Boolean).join(' · ') || ' '}</Sub>
            </div>
          ),
        },
        { title: 'Category', dataIndex: 'category', width: 130, ...sort('category'), render: (v: string | null) => v ?? <Sub>-</Sub> },
        { title: 'Owned / hired', dataIndex: 'ownership', width: 120, ...sort('ownership'), render: (o: EquipmentOwnership) => <OwnershipTag ownership={o} /> },
        ...(fixedProject ? [] : [{ title: 'Deployed at', dataIndex: 'projectName', width: 240, ellipsis: true, ...sort('project'), render: (v: string | null) => v ?? <Sub>Yard / unassigned</Sub> } satisfies ListColumn<EquipmentDto>]),
        ...(mayManage
          ? [{ title: 'Rate', key: 'rate', width: 150, align: 'right' as const, render: (_: unknown, r: EquipmentDto) => (r.rate === null ? '-' : `${formatINR(r.rate)} ${EQUIPMENT_RATE_UNIT_LABELS[r.rateUnit]}`) } satisfies ListColumn<EquipmentDto>]
          : []),
        { key: 'lastLogDate', title: 'Last log', dataIndex: 'lastLogDate', width: 120, render: (v: string | null) => (v ? formatDate(v) : <Sub>never</Sub>) },
        ...(mayManage
          ? [
              {
                title: '',
                key: 'actions',
                label: 'Actions',
                locked: true,
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
              } satisfies ListColumn<EquipmentDto>,
            ]
          : []),
      ];
    },
  });
  const { page } = frame;
  const ownership = page.filters.ownership as EquipmentOwnership | undefined;
  const includeInactive = page.filters.inactive === '1';
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, ownership, includeInactive: includeInactive || undefined };
  const { data, isLoading, isFetching, error, refetch } = useEquipment(filters);
  const rows = data?.items ?? [];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
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
          aria-label="Owned or hired"
          style={{ width: 160 }}
          value={ownership}
          onChange={(v) => page.setFilter('ownership', v)}
          options={EQUIPMENT_OWNERSHIPS.map((o) => ({ value: o, label: EQUIPMENT_OWNERSHIP_LABELS[o] }))}
        />
        <Checkbox
          checked={includeInactive}
          onChange={(e) => page.setFilter('inactive', e.target.checked ? '1' : undefined)}
        >
          Show inactive
        </Checkbox>
      </ListToolbar>
      <DataTable<EquipmentDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<EquipmentDto>(data?.total)}
        onOpen={mayManage ? (id) => { const r = rows.find((x) => x.id === id); if (r) open(r); } : undefined}
        bulk={[exportSelected<EquipmentDto>('equipment', 'equipment', EQUIPMENT_EXPORT)]}
        chips={frame.chips}
        scrollX={1000}
        emptyText={<EmptyArt art="entries" title={ownership || includeInactive || page.params.q ? 'No machine matches these filters' : mayManage ? 'No machines yet. Add the fleet with Add machine.' : 'No machines yet'} />}
      />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="serviceIntervalHours" label="Service every (hours)" tooltip="Working hours from the daily logs; leave blank for no hour schedule">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="serviceIntervalDays" label="or every (days)">
              <InputNumber style={{ width: '100%' }} min={1} max={3650} precision={0} />
            </Form.Item>
            <Form.Item name="lastServiceDate" label="Last service" tooltip="Closing a service job card updates it">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </div>
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
