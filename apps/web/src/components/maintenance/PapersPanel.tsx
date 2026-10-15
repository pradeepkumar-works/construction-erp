'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, DriverDto, EquipmentDocType, EquipmentDocumentDto, ExpiryState } from '@erp/shared';
import { DOC_ALERT_DAYS, EQUIPMENT_DOC_TYPES, EQUIPMENT_DOC_TYPE_LABELS, EXPIRY_STATE_LABELS, MAX_PAGE_SIZE, canManageMaintenance } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDrivers, useEquipment, useEquipmentDocuments } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ExpiryTag } from './maintenanceUi';

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

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 16 } as const;
const t = (v: string | undefined) => v?.trim() || null;
const EXPIRY_STATES: ExpiryState[] = ['EXPIRED', 'EXPIRING', 'VALID'];

/** Vehicle papers that expire (insurance, fitness, permit, PUC, road tax, RC) and the drivers with their licences. */
export function PapersPanel() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const manager = !!user && canManageMaintenance(user.roleKey);
  const { data: equipment } = useEquipment({ pageSize: MAX_PAGE_SIZE });
  const machines = (equipment?.items ?? []).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}` }));

  /* ---------- papers ---------- */
  const docList = useListState<'validTo'>({ sortBy: 'validTo', sortOrder: 'asc', pageSize: 20 });
  const [docType, setDocType] = useState<EquipmentDocType | undefined>();
  const [docState, setDocState] = useState<ExpiryState | undefined>();
  const [docMachine, setDocMachine] = useState<string | undefined>();
  const [showOld, setShowOld] = useState(false);
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
      setDocEditing(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const removeDoc = useMutation({
    mutationFn: async (d: EquipmentDocumentDto) => (await api.delete(`/equipment-documents/${d.id}`)).data,
    onSuccess: () => {
      message.success('Paper deleted');
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const docColumns: TableProps<EquipmentDocumentDto>['columns'] = [
    {
      title: 'Machine',
      key: 'm',
      width: 230,
      render: (_, r) => (
        <span>
          <b className="mono">{r.equipmentCode}</b> {r.equipmentName}
        </span>
      ),
    },
    { title: 'Paper', dataIndex: 'type', width: 160, render: (v: EquipmentDocType) => EQUIPMENT_DOC_TYPE_LABELS[v] },
    {
      title: 'Number / issued by',
      key: 'n',
      render: (_, r) => (
        <div>
          {r.number ?? '-'}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[r.issuer, r.notes].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
      ),
    },
    { title: 'Valid to', dataIndex: 'validTo', width: 120, render: (v) => formatDate(v) },
    { title: '', key: 'state', width: 120, render: (_, r) => <ExpiryTag state={r.state} daysLeft={r.daysLeft} /> },
    {
      title: '',
      key: 'a',
      width: 170,
      render: (_, r) => (
        <Space size={2}>
          {r.attachments.length ? <AttachmentGallery attachments={r.attachments} size={28} /> : null}
          {manager ? (
            <>
              {r.state !== 'VALID' ? (
                <Button size="small" type="link" onClick={() => openDoc(r, true)}>
                  Renew
                </Button>
              ) : null}
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openDoc(r)} aria-label="Edit" />
              <Popconfirm title="Delete this paper?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => removeDoc.mutate(r)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" />
              </Popconfirm>
            </>
          ) : null}
        </Space>
      ),
    },
  ];

  /* ---------- drivers ---------- */
  const drvList = useListState<'name'>({ sortBy: 'name', sortOrder: 'asc', pageSize: 20 });
  const [showLeft, setShowLeft] = useState(false);
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
      setDrvEditing(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const removeDriver = useMutation({
    mutationFn: async (d: DriverDto) => (await api.delete(`/drivers/${d.id}`)).data,
    onSuccess: () => {
      message.success('Driver deleted');
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const driverColumns: TableProps<DriverDto>['columns'] = [
    { title: 'Driver / operator', dataIndex: 'name', render: (v, r) => <div>{v}{r.isActive ? null : <span className="text-muted"> (left)</span>}<div className="text-muted" style={{ fontSize: 12 }}>{r.phone ?? ' '}</div></div> },
    { title: 'Licence', key: 'l', render: (_, r) => <div>{r.licenceNo ?? '-'}<div className="text-muted" style={{ fontSize: 12 }}>{r.licenceClass ?? ' '}</div></div> },
    { title: 'Valid to', dataIndex: 'licenceValidTo', width: 120, render: (v) => (v ? formatDate(v) : '-') },
    { title: '', key: 's', width: 120, render: (_, r) => <ExpiryTag state={r.licenceState} daysLeft={r.daysLeft} /> },
    { title: 'Drives', key: 'e', width: 220, render: (_, r) => (r.equipmentCode ? <span><b className="mono">{r.equipmentCode}</b> {r.equipmentName}</span> : <span className="text-muted">-</span>) },
    ...(manager
      ? [
          {
            title: '',
            key: 'a',
            width: 80,
            render: (_: unknown, r: DriverDto) => (
              <Space size={2}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openDriver(r)} aria-label="Edit" />
                <Popconfirm title={`Delete ${r.name}?`} description="Or edit and untick Active to keep the record" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => removeDriver.mutate(r)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="papers-panel">
      <div style={{ padding: '12px 16px 0' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Vehicle and machine papers
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          The latest paper of each kind per machine. Admins, management and the store team are alerted {DOC_ALERT_DAYS} days before one expires.
        </Typography.Text>
      </div>
      {docs.error && <QueryError error={docs.error} onRetry={() => docs.refetch()} />}
      <ListToolbar
        hideProject
        onProject={() => undefined}
        search={docList.search}
        onSearch={docList.setSearch}
        searchPlaceholder="Search machine, number, issuer"
        extra={
          manager ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openDoc('new')}>
              Add paper
            </Button>
          ) : null
        }
      >
        <Select allowClear placeholder="All papers" style={{ width: 170 }} value={docType} onChange={(v) => { setDocType(v); docList.resetPage(); }} options={EQUIPMENT_DOC_TYPES.map((x) => ({ value: x, label: EQUIPMENT_DOC_TYPE_LABELS[x] }))} />
        <Select allowClear placeholder="Any validity" style={{ width: 150 }} value={docState} onChange={(v) => { setDocState(v); docList.resetPage(); }} options={EXPIRY_STATES.map((x) => ({ value: x, label: EXPIRY_STATE_LABELS[x] }))} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="All machines" style={{ width: 220 }} value={docMachine} onChange={(v) => { setDocMachine(v); docList.resetPage(); }} options={machines} />
        <Checkbox checked={showOld} onChange={(e) => { setShowOld(e.target.checked); docList.resetPage(); }}>
          Show renewed ones too
        </Checkbox>
      </ListToolbar>
      <Table<EquipmentDocumentDto> className="papers-table" size="middle" rowKey="id" loading={docs.isLoading || docs.isFetching} dataSource={docs.data?.items ?? []} columns={docColumns} {...docList.tableProps<EquipmentDocumentDto>(docs.data?.total)} scroll={{ x: 960 }} />

      <div style={{ padding: '20px 16px 0' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Drivers and operators
        </Typography.Title>
      </div>
      {drivers.error && <QueryError error={drivers.error} onRetry={() => drivers.refetch()} />}
      <ListToolbar
        hideProject
        onProject={() => undefined}
        search={drvList.search}
        onSearch={drvList.setSearch}
        searchPlaceholder="Search name, phone, licence, machine"
        extra={
          manager ? (
            <Button icon={<PlusOutlined />} onClick={() => openDriver('new')}>
              Add driver
            </Button>
          ) : null
        }
      >
        <Checkbox checked={showLeft} onChange={(e) => { setShowLeft(e.target.checked); drvList.resetPage(); }}>
          Show those who left
        </Checkbox>
      </ListToolbar>
      <Table<DriverDto> className="drivers-table" size="middle" rowKey="id" loading={drivers.isLoading || drivers.isFetching} dataSource={drivers.data?.items ?? []} columns={driverColumns} {...drvList.tableProps<DriverDto>(drivers.data?.total)} scroll={{ x: 900 }} />

      <Modal open={!!docEditing} title={docEditing === 'new' ? 'Add a paper' : 'Change paper'} onCancel={() => setDocEditing(null)} onOk={() => docForm.submit()} okButtonProps={{ loading: saveDoc.isPending }} okText="Save" width={640} destroyOnHidden>
        <Form form={docForm} layout="vertical" onFinish={(v) => saveDoc.mutate(v)}>
          <div style={grid}>
            <Form.Item name="equipmentId" label="Machine" rules={[{ required: true, message: 'Pick the machine' }]}>
              <Select showSearch optionFilterProp="label" disabled={docEditing !== 'new'} options={machines} />
            </Form.Item>
            <Form.Item name="type" label="Paper" rules={[{ required: true, message: 'Which paper?' }]}>
              <Select options={EQUIPMENT_DOC_TYPES.map((x) => ({ value: x, label: EQUIPMENT_DOC_TYPE_LABELS[x] }))} />
            </Form.Item>
          </div>
          <div style={grid}>
            <Form.Item name="number" label="Number">
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="issuer" label="Issued by">
              <Input maxLength={200} placeholder="Insurer, RTO, authority" />
            </Form.Item>
          </div>
          <Form.Item name="validity" label="Valid from / to" rules={[{ validator: (_, v?: [unknown, unknown]) => (v?.[1] ? Promise.resolve() : Promise.reject(new Error('When does it expire?'))) }]}>
            <DatePicker.RangePicker format="DD MMM YYYY" style={{ width: '100%' }} allowEmpty={[true, false]} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item name="scans" label="Scan">
            <PhotoUpload />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!drvEditing} title={drvEditing === 'new' ? 'Add a driver' : 'Change driver'} onCancel={() => setDrvEditing(null)} onOk={() => drvForm.submit()} okButtonProps={{ loading: saveDriver.isPending }} okText="Save" width={600} destroyOnHidden>
        <Form form={drvForm} layout="vertical" onFinish={(v) => saveDriver.mutate(v)}>
          <div style={grid}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input maxLength={20} />
            </Form.Item>
          </div>
          <div style={grid}>
            <Form.Item name="licenceNo" label="Licence no.">
              <Input maxLength={40} />
            </Form.Item>
            <Form.Item name="licenceClass" label="Class">
              <Input maxLength={40} placeholder="HMV, LMV, crane operator" />
            </Form.Item>
            <Form.Item name="licenceValidTo" label="Licence valid to">
              <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="equipmentId" label="Drives">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Machine or vehicle" options={machines} />
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
      </Modal>
    </div>
  );
}
