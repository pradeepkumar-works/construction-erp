'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Checkbox, Form, Input, InputNumber, Select, Space, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import { PlusOutlined, ToolOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDto, EquipmentOwnership, EquipmentRateUnit, EquipmentSortField, FuelNormUnit, HireFuelBy } from '@erp/shared';
import {
  EQUIPMENT_OWNERSHIPS,
  EQUIPMENT_OWNERSHIP_LABELS,
  EQUIPMENT_RATE_UNITS,
  EQUIPMENT_RATE_UNIT_LABELS,
  FUEL_NORM_UNITS,
  FUEL_NORM_UNIT_LABELS,
  FUEL_TOLERANCE_DEFAULT_PCT,
  HIRE_FUEL_BY,
  HIRE_FUEL_BY_LABELS,
  LIST_SORT_FIELDS,
  canManageEquipment,
  fuelNormText,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useEquipment, useProjects } from '@/lib/queries';
import { formatDate, formatINR, NO_VALUE } from '@/lib/format';
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
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { RowMenu } from '@/components/list/RowMenu';
import { EquipmentPartsDrawer } from './EquipmentPartsDrawer';
import { MasterInput } from '@/components/masters/MasterInput';

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
  hireMinHours?: number | null;
  hireFuelBy?: HireFuelBy | null;
  hireOperator?: 'yes' | 'no' | null;
  fuelNorm?: number | null;
  fuelNormUnit?: FuelNormUnit | null;
  fuelTolerancePct?: number | null;
  fuelTankLitres?: number | null;
}

/** Equipment master. Everyone sees the fleet and where it is deployed; approvers add machines, set rates and move them. */
export function EquipmentTable({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const mayManage = !!user && canManageEquipment(user.roleKey);
  const { data: projects } = useProjects();
  const [editing, setEditing] = useState<EquipmentDto | 'new' | null>(null);
  const [partsOf, setPartsOf] = useState<EquipmentDto | null>(null);
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
        // Hire terms (v5 item 91): what its hire bill is checked against.
        hireMinHours: v.ownership === 'HIRED' && v.hireMinHours ? String(v.hireMinHours) : null,
        hireFuelBy: v.ownership === 'HIRED' ? (v.hireFuelBy ?? null) : null,
        hireOperator: v.ownership === 'HIRED' && v.hireOperator ? v.hireOperator === 'yes' : null,
        // Fuel norm (v5 item 93): what its fuel use is checked against.
        fuelNorm: v.fuelNorm ? String(v.fuelNorm) : null,
        fuelNormUnit: v.fuelNorm ? (v.fuelNormUnit ?? 'LITRES_PER_HOUR') : null,
        fuelTolerancePct: v.fuelNorm && v.fuelTolerancePct ? String(v.fuelTolerancePct) : null,
        fuelTankLitres: v.fuelTankLitres ? String(v.fuelTankLitres) : null,
        ...(editing && editing !== 'new' ? { isActive: v.isActive ?? true } : {}),
      };
      return editing && editing !== 'new' ? (await api.patch<EquipmentDto>(`/equipment/${editing.id}`, body)).data : (await api.post<EquipmentDto>('/equipment', body)).data;
    },
    onSuccess: (e) => {
      message.success(`${e.code} saved`);
      qc.invalidateQueries({ queryKey: ['machinery'] });
    },
    meta: FAIL_NOTICE,
  });
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async (e: EquipmentDto) => (await api.delete(`/equipment/${e.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machinery'] });
    },
    meta: FAIL_NOTICE,
  });

  const open = (e: EquipmentDto | 'new') => {
    setEditing(e);
    form.resetFields();
    if (e === 'new') form.setFieldsValue({ ownership: 'OWNED', rateUnit: 'HOUR', projectId: fixedProject, fuelNormUnit: 'LITRES_PER_HOUR' });
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
        hireMinHours: e.hireMinHours === null ? null : Number(e.hireMinHours),
        hireFuelBy: e.hireFuelBy,
        hireOperator: e.hireOperator === null ? null : e.hireOperator ? 'yes' : 'no',
        fuelNorm: e.fuelNorm ? Number(e.fuelNorm) : null,
        fuelNormUnit: e.fuelNormUnit ?? 'LITRES_PER_HOUR',
        fuelTolerancePct: e.fuelTolerancePct ? Number(e.fuelTolerancePct) : null,
        fuelTankLitres: e.fuelTankLitres ? Number(e.fuelTankLitres) : null,
      });
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<EquipmentDto>('/equipment', { ...filters });
    await downloadXlsx(exportFileName('equipment'), 'equipment', EQUIPMENT_EXPORT, rows);
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
              {r.isActive ? null : <AppTag style={{ marginLeft: 4 }}>Inactive</AppTag>}
              {r.loan ? (
                <AppTag style={{ marginLeft: 4 }}>
                  <RecordLink href={`/machine-loans/${r.loan.id}`} onOpen={() => router.push(`/machine-loans/${r.loan!.id}`)}>
                    {`Loan · ${r.loan.lenderName}`}
                  </RecordLink>
                </AppTag>
              ) : null}
              <Sub>{[r.registrationNo, r.supplier, r.fuelNorm && r.fuelNormUnit ? `Norm ${fuelNormText(r.fuelNorm, r.fuelNormUnit)}` : null].filter(Boolean).join(' · ') || ' '}</Sub>
            </div>
          ),
        },
        { title: 'Category', dataIndex: 'category', width: 130, ...sort('category'), render: (v: string | null) => v ?? <Sub>{NO_VALUE}</Sub> },
        { title: 'Owned or hired', dataIndex: 'ownership', width: 120, ...sort('ownership'), render: (o: EquipmentOwnership) => <OwnershipTag ownership={o} /> },
        ...(fixedProject ? [] : [{ title: 'Deployed at', dataIndex: 'projectName', width: 240, ellipsis: true, ...sort('project'), render: (v: string | null) => v ?? <Sub>Yard / unassigned</Sub> } satisfies ListColumn<EquipmentDto>]),
        ...(mayManage
          ? [{ title: 'Rate', key: 'rate', width: 150, align: 'right' as const, render: (_: unknown, r: EquipmentDto) => (r.rate === null ? NO_VALUE : `${formatINR(r.rate)} ${EQUIPMENT_RATE_UNIT_LABELS[r.rateUnit]}`) } satisfies ListColumn<EquipmentDto>]
          : []),
        { key: 'lastLogDate', title: 'Last log', dataIndex: 'lastLogDate', width: 120, render: (v: string | null) => (v ? formatDate(v) : <Sub>never</Sub>) },
        {
          title: '',
          key: 'actions',
          label: 'Actions',
          locked: true,
          fixed: 'right' as const,
          width: mayManage ? 96 : 56,
          render: (_: unknown, r: EquipmentDto) => (
            <Space size="small">
              <Button type="text" size="small" icon={<ToolOutlined />} onClick={() => setPartsOf(r)} aria-label={`Tyres and batteries of ${r.code}`} title="Tyres and batteries" />
              {mayManage ? (
                <RowMenu
                  label={`Actions for ${r.code}`}
                  items={[
                    { key: 'edit', label: 'Edit', onSelect: () => open(r) },
                    { key: 'delete', label: r.lastLogDate ? 'Delete (it has logs; mark it inactive instead)' : 'Delete', danger: true, disabled: !!r.lastLogDate, onSelect: () => askDelete({ what: `machine ${r.code}`, onConfirm: () => remove.mutateAsync(r) }) },
                  ]}
                />
              ) : null}
            </Space>
          ),
        } satisfies ListColumn<EquipmentDto>,
      ];
    },
  });
  const { page } = frame;
  const ownership = page.filters.ownership as EquipmentOwnership | undefined;
  const includeInactive = page.filters.inactive === '1';
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, ownership, includeInactive: includeInactive || undefined };
  const { data, isLoading, isFetching, error, refetch } = useEquipment(filters);
  const rows = data?.items ?? [];

  const newButton = mayManage ? (
    <Button icon={<PlusOutlined />} onClick={() => open('new')}>
      New machine
    </Button>
  ) : null;

  return (
    <>
      {deleteDialog}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search code, name, registration, agency"
        searchLabel="Search equipment"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
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
        // A row opens its edit form for those who manage the fleet, and its tyres and batteries for the rest (a phone's
        // cards have no actions column).
        onOpen={(id) => {
          const r = rows.find((x) => x.id === id);
          if (r) (mayManage ? open : setPartsOf)(r);
        }}
        bulk={[exportSelected<EquipmentDto>('equipment', 'equipment', EQUIPMENT_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1000}
        emptyText={<EmptyArt art="entries" title={ownership || includeInactive || page.params.q ? 'No machine matches these filters' : mayManage ? 'No machines yet. Add the fleet with New machine.' : 'No machines yet'} />}
        emptyAction={newButton}
      />
      {/* Where a new machine is deployed is a deliberate choice (the yard by default), not the header's project. */}
      <FormShell
        open={!!editing}
        onClose={() => setEditing(null)}
        form={form}
        layout="drawer"
        title={editing === 'new' ? 'New machine' : 'Edit machine'}
        okText="Save"
        projectDefault={false}
        onSubmit={(v) => save.mutateAsync(v)}
        footerExtra={
          editing && editing !== 'new' ? (
            <Button icon={<ToolOutlined />} onClick={() => setPartsOf(editing)}>
              Tyres and batteries
            </Button>
          ) : null
        }
      >
        <Form form={form} layout="vertical">
          <FormSection title="Machine">
            <FormGrid cols={2}>
              <Form.Item name="code" label="Code" rules={[{ required: true, whitespace: true, message: 'Enter the code, e.g. EXC-02' }]}>
                <Input maxLength={30} placeholder="EXC-02" />
              </Form.Item>
              <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the machine name' }]}>
                <Input maxLength={120} placeholder="Excavator (Tata Hitachi EX200)" />
              </Form.Item>
            </FormGrid>
            <FormGrid cols={2}>
              <Form.Item name="category" label="Category">
                <MasterInput list="equipmentCategory" maxLength={60} placeholder="Earthmoving, Compaction, Lifting" />
              </Form.Item>
              <Form.Item name="registrationNo" label="Registration / serial no.">
                <Input maxLength={40} />
              </Form.Item>
            </FormGrid>
          </FormSection>
          <FormSection title="Ownership and rate">
            <FormGrid cols={2}>
              <Form.Item name="ownership" label="Owned or hired" rules={[{ required: true, message: 'Choose owned or hired' }]}>
                <Select options={EQUIPMENT_OWNERSHIPS.map((o) => ({ value: o, label: EQUIPMENT_OWNERSHIP_LABELS[o] }))} />
              </Form.Item>
              <Form.Item name="supplier" label="Hire agency" hidden={formOwnership !== 'HIRED'}>
                <VendorPicker kind="HIRE_AGENCY" />
              </Form.Item>
            </FormGrid>
            <FormGrid cols={2}>
              <Form.Item name="rate" label={formOwnership === 'HIRED' ? 'Hire rate' : 'Internal rate'} extra="Used for the project cost view">
                <MoneyInput />
              </Form.Item>
              <Form.Item name="rateUnit" label="Rate per" rules={[{ required: true, message: 'Choose what the rate is per' }]}>
                <Select options={EQUIPMENT_RATE_UNITS.map((u) => ({ value: u, label: EQUIPMENT_RATE_UNIT_LABELS[u] }))} />
              </Form.Item>
            </FormGrid>
            {formOwnership === 'HIRED' ? (
              <FormGrid cols={3}>
                <Form.Item name="hireMinHours" label="Minimum hours a month" extra="Paid for even if not worked">
                  <QuantityInput unit="hour" />
                </Form.Item>
                <Form.Item name="hireFuelBy" label="Fuel">
                  <Select allowClear placeholder="Not agreed" options={HIRE_FUEL_BY.map((f) => ({ value: f, label: HIRE_FUEL_BY_LABELS[f] }))} />
                </Form.Item>
                <Form.Item name="hireOperator" label="Operator">
                  <Select
                    allowClear
                    placeholder="Not agreed"
                    options={[
                      { value: 'yes', label: 'Comes with the machine' },
                      { value: 'no', label: 'Ours' },
                    ]}
                  />
                </Form.Item>
              </FormGrid>
            ) : null}
          </FormSection>
          <FormSection title="Fuel">
            <FormGrid cols={3}>
              <Form.Item name="fuelNorm" label="Norm" extra="Leave blank for no fuel check">
                <QuantityInput />
              </Form.Item>
              <Form.Item name="fuelNormUnit" label="In">
                <Select options={FUEL_NORM_UNITS.map((u) => ({ value: u, label: FUEL_NORM_UNIT_LABELS[u] }))} />
              </Form.Item>
              <Form.Item name="fuelTolerancePct" label="Tolerance" tooltip="How far its average over recent logs may stray before the watch list flags it">
                <QuantityInput unit="%" precision={1} max={100} placeholder={String(FUEL_TOLERANCE_DEFAULT_PCT)} />
              </Form.Item>
            </FormGrid>
            <FormGrid cols={3}>
              <Form.Item name="fuelTankLitres" label="Tank size" extra="For a fuel sensor that reads a %">
                <QuantityInput unit="L" max={20000} />
              </Form.Item>
            </FormGrid>
          </FormSection>
          <FormSection title="Deployment and service">
            <Form.Item name="projectId" label="Deployed at">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Yard / unassigned" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
            </Form.Item>
            <FormGrid cols={3}>
              <Form.Item name="serviceIntervalHours" label="Service every (hours)" tooltip="Working hours from the daily logs; leave blank for no hour schedule">
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
              <Form.Item name="serviceIntervalDays" label="or every (days)">
                <InputNumber style={{ width: '100%' }} min={1} max={3650} precision={0} inputMode="numeric" />
              </Form.Item>
              <Form.Item name="lastServiceDate" label="Last service" tooltip="Closing a service job card updates it">
                <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
            </FormGrid>
            {editing && editing !== 'new' ? (
              <Form.Item name="isActive" valuePropName="checked">
                <Checkbox>Active (inactive machines cannot be logged)</Checkbox>
              </Form.Item>
            ) : null}
          </FormSection>
        </Form>
      </FormShell>
      <EquipmentPartsDrawer machine={partsOf} onClose={() => setPartsOf(null)} />
    </>
  );
}
