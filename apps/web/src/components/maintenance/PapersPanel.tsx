'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, Form, Input, Select, Space, Typography, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, DriverDto, EquipmentDocType, EquipmentDocumentDto, ExpiryState } from '@erp/shared';
import { DOC_ALERT_DAYS, EQUIPMENT_DOC_TYPES, EQUIPMENT_DOC_TYPE_LABELS, EXPIRY_STATE_LABELS, canManageMaintenance } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useDrivers, useEquipmentDocuments } from '@/lib/queries';
import { EquipmentSelect, useEquipmentItem } from '@/components/common/SearchSelect';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { PHONE_INPUT, phoneRule } from '@/components/form/inputs';
import { ExpiryTag } from './maintenanceUi';
import { themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

interface DocValues {
  equipmentId: string;
  type: EquipmentDocType;
  number?: string;
  issuer?: string;
  validity: [dayjs.Dayjs | null, dayjs.Dayjs];
  notes?: string;
  scans?: AttachmentDto[];
}

interface DriverValues {
  name: string;
  phone?: string;
  licenceNo?: string;
  licenceClass?: string;
  licenceValidTo?: dayjs.Dayjs | null;
  equipmentId?: string | null;
  notes?: string;
  isActive?: boolean;
}

const t = (v: string | undefined) => v?.trim() || null;
const EXPIRY_STATES: ExpiryState[] = ['EXPIRED', 'EXPIRING', 'VALID'];
const DOC_KEYS = ['type', 'state', 'equipmentId', 'old'] as const;
const DRIVER_KEYS = ['left'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Vehicle papers that expire (insurance, fitness, permit, PUC, road tax, RC) and the drivers with their licences. */
export function PapersPanel() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const manager = !!user && canManageMaintenance(user.roleKey);

  // Papers
  const docFrame = useListFrame<'validTo', EquipmentDocumentDto>({
    list: 'machine-papers',
    url: false,
    keys: DOC_KEYS,
    sortBy: 'validTo',
    sortOrder: 'asc',
    sortFields: ['validTo'],
    projectScoped: false,
    chipLabels: {
      type: (v) => EQUIPMENT_DOC_TYPE_LABELS[v as EquipmentDocType] ?? v,
      state: (v) => EXPIRY_STATE_LABELS[v as ExpiryState] ?? v,
      equipmentId: () => `Machine: ${docMachineItem?.code ?? 'one machine'}`,
      old: () => 'Renewed ones too',
    },
    columns: (): ListColumn<EquipmentDocumentDto>[] =>
  [
      {
        title: 'Machine',
        key: 'm',
        width: 230,
        locked: true,
        render: (_, r) => (
          <span>
            {manager ? (
              <RecordLink onOpen={() => openDoc(r)} strong className="mono">
                {r.equipmentCode}
              </RecordLink>
            ) : (
              <b className="mono" translate="no">{r.equipmentCode}</b>
            )}{' '}
            {r.equipmentName}
          </span>
        ),
      },
      { key: 'type', title: 'Paper', dataIndex: 'type', width: 160, render: (v: EquipmentDocType) => EQUIPMENT_DOC_TYPE_LABELS[v] },
      {
        title: 'Number / issued by',
        key: 'n',
        render: (_, r) => (
          <div>
            {r.number ?? '-'}
            <Sub>{[r.issuer, r.notes].filter(Boolean).join(' · ') || ' '}</Sub>
          </div>
        ),
      },
      { key: 'validTo', title: 'Valid to', dataIndex: 'validTo', width: 120, render: (v: string) => formatDate(v) },
      { title: '', key: 'state', label: 'Validity', width: 120, render: (_, r) => <ExpiryTag state={r.state} daysLeft={r.daysLeft} /> },
      {
        title: '',
        key: 'a',
        label: 'Scans and actions',
        locked: true,
        width: 170,
        render: (_, r) => (
          <Space size="small">
            {r.attachments.length ? <AttachmentGallery attachments={r.attachments} size={28} /> : null}
            {manager ? (
              <>
                {r.state !== 'VALID' ? (
                  <Button size="small" type="link" onClick={() => openDoc(r, true)}>
                    Renew
                  </Button>
                ) : null}
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openDoc(r)} aria-label="Edit" />
                <ConfirmDelete what={`the ${EQUIPMENT_DOC_TYPE_LABELS[r.type].replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())} paper${r.number ? ` ${r.number}` : ''} of ${r.equipmentCode}`} onConfirm={() => removeDoc.mutateAsync(r)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" />
                </ConfirmDelete>
              </>
            ) : null}
          </Space>
        ),
      },
    ],
  });
  const docList = docFrame.page;
  const docType = docList.filters.type as EquipmentDocType | undefined;
  const docState = docList.filters.state as ExpiryState | undefined;
  const docMachine = docList.filters.equipmentId;
  // Read by the chip's label once the list has drawn.
  const docMachineItem = useEquipmentItem(docMachine);
  const showOld = docList.filters.old === '1';
  const docs = useEquipmentDocuments({ page: docList.params.page, pageSize: docList.params.pageSize, q: docList.params.q, type: docType, state: docState, equipmentId: docMachine, latestOnly: showOld ? false : undefined });
  const [docEditing, setDocEditing] = useState<EquipmentDocumentDto | 'new' | null>(null);
  const [docForm] = Form.useForm<DocValues>();
  const openDoc = (d: EquipmentDocumentDto | 'new', renew = false) => {
    docForm.resetFields();
    if (d === 'new') docForm.setFieldsValue({ equipmentId: docMachine as string });
    else if (renew)
      docForm.setFieldsValue({ equipmentId: d.equipmentId, type: d.type, issuer: d.issuer ?? undefined, validity: [dayjs(d.validTo).add(1, 'day'), dayjs(d.validTo).add(1, 'year')] });
    else
      docForm.setFieldsValue({
        equipmentId: d.equipmentId,
        type: d.type,
        number: d.number ?? undefined,
        issuer: d.issuer ?? undefined,
        validity: [d.validFrom ? dayjs(d.validFrom) : null, dayjs(d.validTo)],
        notes: d.notes ?? undefined,
        scans: d.attachments,
      });
    setDocEditing(renew ? 'new' : d);
  };
  const saveDoc = useMutation({
    mutationFn: async (v: DocValues) => {
      const body = {
        type: v.type,
        number: t(v.number),
        issuer: t(v.issuer),
        validFrom: v.validity[0] ? v.validity[0].format('YYYY-MM-DD') : null,
        validTo: v.validity[1].format('YYYY-MM-DD'),
        notes: t(v.notes),
        attachmentIds: (v.scans ?? []).map((a) => a.id),
      };
      return docEditing && docEditing !== 'new'
        ? (await api.patch<EquipmentDocumentDto>(`/equipment-documents/${docEditing.id}`, body)).data
        : (await api.post<EquipmentDocumentDto>('/equipment-documents', { equipmentId: v.equipmentId, ...body })).data;
    },
    onSuccess: (d) => {
      message.success(`${EQUIPMENT_DOC_TYPE_LABELS[d.type]} of ${d.equipmentCode} saved`);
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    meta: FAIL_NOTICE,
  });
  const removeDoc = useMutation({
    mutationFn: async (d: EquipmentDocumentDto) => (await api.delete(`/equipment-documents/${d.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    meta: FAIL_NOTICE,
  });

  // Drivers
  const drvFrame = useListFrame<'name', DriverDto>({
    list: 'drivers',
    url: false,
    keys: DRIVER_KEYS,
    sortBy: 'name',
    sortOrder: 'asc',
    sortFields: ['name'],
    projectScoped: false,
    chipLabels: { left: () => 'Including those who left' },
    columns: (): ListColumn<DriverDto>[] =>
  [
      { key: 'name', title: 'Driver / operator', locked: true, render: (_, r) => <div>{manager ? <RecordLink onOpen={() => openDriver(r)} strong>{r.name}</RecordLink> : r.name}{r.isActive ? null : <Typography.Text type="secondary"> (left)</Typography.Text>}<Sub>{r.phone ?? ' '}</Sub></div> },
      { title: 'Licence', key: 'l', render: (_, r) => <div>{r.licenceNo ?? '-'}<Sub>{r.licenceClass ?? ' '}</Sub></div> },
      { key: 'licenceValidTo', title: 'Valid to', dataIndex: 'licenceValidTo', width: 120, render: (v: string | null) => (v ? formatDate(v) : '-') },
      { title: '', key: 's', label: 'Validity', width: 120, render: (_, r) => <ExpiryTag state={r.licenceState} daysLeft={r.daysLeft} /> },
      { title: 'Drives', key: 'e', width: 220, render: (_, r) => (r.equipmentCode ? <span><b className="mono" translate="no">{r.equipmentCode}</b> {r.equipmentName}</span> : <Typography.Text type="secondary">-</Typography.Text>) },
      ...(manager
        ? [
            {
              title: '',
              key: 'a',
              label: 'Actions',
              locked: true,
              width: 80,
              render: (_: unknown, r: DriverDto) => (
                <Space size="small">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openDriver(r)} aria-label="Edit" />
                  <ConfirmDelete what={`driver ${r.name}`} description="Or edit and untick Active to keep the record." onConfirm={() => removeDriver.mutateAsync(r)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" />
                  </ConfirmDelete>
                </Space>
              ),
            } satisfies ListColumn<DriverDto>,
          ]
        : []),
    ],
  });
  const drvList = drvFrame.page;
  const showLeft = drvList.filters.left === '1';
  const drivers = useDrivers({ page: drvList.params.page, pageSize: drvList.params.pageSize, q: drvList.params.q, includeInactive: showLeft || undefined });
  const [drvEditing, setDrvEditing] = useState<DriverDto | 'new' | null>(null);
  const [drvForm] = Form.useForm<DriverValues>();
  const openDriver = (d: DriverDto | 'new') => {
    drvForm.resetFields();
    if (d !== 'new')
      drvForm.setFieldsValue({
        name: d.name,
        phone: d.phone ?? undefined,
        licenceNo: d.licenceNo ?? undefined,
        licenceClass: d.licenceClass ?? undefined,
        licenceValidTo: d.licenceValidTo ? dayjs(d.licenceValidTo) : null,
        equipmentId: d.equipmentId,
        notes: d.notes ?? undefined,
        isActive: d.isActive,
      });
    setDrvEditing(d);
  };
  const saveDriver = useMutation({
    mutationFn: async (v: DriverValues) => {
      const body = {
        name: v.name.trim(),
        phone: t(v.phone),
        licenceNo: t(v.licenceNo),
        licenceClass: t(v.licenceClass),
        licenceValidTo: v.licenceValidTo ? v.licenceValidTo.format('YYYY-MM-DD') : null,
        equipmentId: v.equipmentId ?? null,
        notes: t(v.notes),
        ...(drvEditing && drvEditing !== 'new' ? { isActive: v.isActive ?? true } : {}),
      };
      return drvEditing && drvEditing !== 'new' ? (await api.patch<DriverDto>(`/drivers/${drvEditing.id}`, body)).data : (await api.post<DriverDto>('/drivers', body)).data;
    },
    onSuccess: (d) => {
      message.success(`${d.name} saved`);
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    meta: FAIL_NOTICE,
  });
  const removeDriver = useMutation({
    mutationFn: async (d: DriverDto) => (await api.delete(`/drivers/${d.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    meta: FAIL_NOTICE,
  });

  const newButton = manager ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => openDoc('new')}>
      New paper
    </Button>
  ) : null;
  const newDriverButton = manager ? (
    <Button icon={<PlusOutlined />} onClick={() => openDriver('new')}>
      New driver
    </Button>
  ) : null;

  return (
    <div className="papers-panel">
      <div style={{ padding: '12px 16px 0' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Vehicle and machine papers
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          The latest paper of each kind per machine. Admins, management and the store team are alerted {DOC_ALERT_DAYS} days before one expires.
        </Typography.Text>
      </div>
      {docs.error && <QueryError error={docs.error} onRetry={() => docs.refetch()} />}
      <ListToolbar filters={docFrame.filterState}
        hideProject
        onProject={() => undefined}
        search={docList.search}
        onSearch={docList.setSearch}
        searchPlaceholder="Search machine, number, issuer"
        searchLabel="Search machine papers"
        extra={newButton}
      >
        <Select allowClear placeholder="All papers" style={{ width: 170 }} value={docType} aria-label="Paper" onChange={(v) => docList.setFilter('type', v)} options={EQUIPMENT_DOC_TYPES.map((x) => ({ value: x, label: EQUIPMENT_DOC_TYPE_LABELS[x] }))} />
        <Select allowClear placeholder="Any validity" style={{ width: 150 }} value={docState} aria-label="Validity" onChange={(v) => docList.setFilter('state', v)} options={EXPIRY_STATES.map((x) => ({ value: x, label: EXPIRY_STATE_LABELS[x] }))} />
        <EquipmentSelect allowClear placeholder="All machines" style={{ width: 220 }} value={docMachine} aria-label="Machine" onChange={(v) => docList.setFilter('equipmentId', v)} />
        <Checkbox checked={showOld} onChange={(e) => docList.setFilter('old', e.target.checked ? '1' : undefined)}>
          Show renewed ones too
        </Checkbox>
      </ListToolbar>
      <DataTable<EquipmentDocumentDto>
        className="papers-table"
        columns={docFrame.columns}
        visible={docFrame.choice.visible}
        onChooseColumns={docFrame.choice.setChosen}
        chosenIsDefault={docFrame.choice.isDefault}
        rows={docs.data?.items ?? []}
        loading={docs.isLoading || docs.isFetching}
        table={docList.tableProps<EquipmentDocumentDto>(docs.data?.total)}
        onOpen={manager ? (id) => { const d = docs.data?.items.find((x) => x.id === id); if (d) openDoc(d); } : undefined}
        chips={docFrame.chips}
        empty={docFrame.empty}
        scrollX={960}
        emptyText={<EmptyArt art="entries" title={docType || docState || docMachine || showOld || docList.params.q ? 'No paper matches these filters' : 'No papers recorded'} />}
        emptyAction={newButton}
      />

      <div style={{ padding: '20px 16px 0' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Drivers and operators
        </Typography.Title>
      </div>
      {drivers.error && <QueryError error={drivers.error} onRetry={() => drivers.refetch()} />}
      <ListToolbar filters={drvFrame.filterState}
        hideProject
        onProject={() => undefined}
        search={drvList.search}
        onSearch={drvList.setSearch}
        searchPlaceholder="Search name, phone, licence, machine"
        searchLabel="Search drivers and operators"
        extra={newDriverButton}
      >
        <Checkbox checked={showLeft} onChange={(e) => drvList.setFilter('left', e.target.checked ? '1' : undefined)}>
          Show those who left
        </Checkbox>
      </ListToolbar>
      <DataTable<DriverDto>
        className="drivers-table"
        columns={drvFrame.columns}
        visible={drvFrame.choice.visible}
        onChooseColumns={drvFrame.choice.setChosen}
        chosenIsDefault={drvFrame.choice.isDefault}
        rows={drivers.data?.items ?? []}
        loading={drivers.isLoading || drivers.isFetching}
        table={drvList.tableProps<DriverDto>(drivers.data?.total)}
        onOpen={manager ? (id) => { const d = drivers.data?.items.find((x) => x.id === id); if (d) openDriver(d); } : undefined}
        chips={drvFrame.chips}
        empty={drvFrame.empty}
        scrollX={900}
        emptyText={<EmptyArt art="entries" title={showLeft || drvList.params.q ? 'No driver matches these filters' : 'No drivers recorded'} />}
        emptyAction={newDriverButton}
      />

      <FormShell open={!!docEditing} onClose={() => setDocEditing(null)} form={docForm} layout="modal" title={docEditing === 'new' ? 'New paper' : 'Change paper'} okText="Save" onSubmit={(v) => saveDoc.mutateAsync(v)}>
        <Form form={docForm} layout="vertical">
          <FormGrid cols={2}>
            <Form.Item name="equipmentId" label="Machine" rules={[{ required: true, message: 'Pick the machine' }]}>
              <EquipmentSelect disabled={docEditing !== 'new'} />
            </Form.Item>
            <Form.Item name="type" label="Paper" rules={[{ required: true, message: 'Choose the paper' }]}>
              <Select options={EQUIPMENT_DOC_TYPES.map((x) => ({ value: x, label: EQUIPMENT_DOC_TYPE_LABELS[x] }))} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="number" label="Number">
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="issuer" label="Issued by">
              <Input maxLength={200} placeholder="Insurer, RTO, authority" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="validity" label="Valid from / to" rules={[{ validator: (_, v?: [unknown, unknown]) => (v?.[1] ? Promise.resolve() : Promise.reject(new Error('Pick the date it expires'))) }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} allowEmpty={[true, false]} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item name="scans" label="Scan">
            <PhotoUpload />
          </Form.Item>
        </Form>
      </FormShell>

      <FormShell open={!!drvEditing} onClose={() => setDrvEditing(null)} form={drvForm} layout="modal" title={drvEditing === 'new' ? 'New driver' : 'Change driver'} okText="Save" onSubmit={(v) => saveDriver.mutateAsync(v)} width={600}>
        <Form form={drvForm} layout="vertical">
          <FormGrid cols={2}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name' }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
              <Input {...PHONE_INPUT} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={3}>
            <Form.Item name="licenceNo" label="Licence no.">
              <Input maxLength={40} />
            </Form.Item>
            <Form.Item name="licenceClass" label="Class">
              <Input maxLength={40} placeholder="HMV, LMV, crane operator" />
            </Form.Item>
            <Form.Item name="licenceValidTo" label="Licence valid to">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="equipmentId" label="Drives">
            <EquipmentSelect allowClear placeholder="Machine or vehicle" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input maxLength={1000} />
          </Form.Item>
          {drvEditing && drvEditing !== 'new' ? (
            <Form.Item name="isActive" valuePropName="checked">
              <Checkbox>Active</Checkbox>
            </Form.Item>
          ) : null}
        </Form>
      </FormShell>
    </div>
  );
}
