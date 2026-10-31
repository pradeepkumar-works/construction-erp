'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Descriptions, Divider, Drawer, Form, Input, Select, Skeleton, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MaintenanceJobDto } from '@erp/shared';
import { MAX_PAGE_SIZE, canManageMaintenance, unitLabel } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useMaintenanceJob, useStockBalances } from '@/lib/queries';
import { formatDate, formatINR, formatQty, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { JobKindTag, JobStatusTag } from './maintenanceUi';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

interface CloseValues {
  closedDate: dayjs.Dayjs;
  workDone: string;
  downtimeHours?: number | null;
  labourCost?: number | null;
  partsCost?: number | null;
  meterReading?: number | null;
  workshop?: string;
}

interface SpareValues {
  date: dayjs.Dayjs;
  lines?: { itemId?: string; quantity?: number | null }[];
}

const str = (n: number | null | undefined) => (n === undefined || n === null ? null : String(n));

/** One job card: the fault or service, spares issued from the store, and closing it with the work done and its cost. */
export function JobDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit: (j: MaintenanceJobDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: j, isLoading, error, refetch } = useMaintenanceJob(id ?? undefined);
  const [closing, setClosing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [closeForm] = Form.useForm<CloseValues>();
  const [spareForm] = Form.useForm<SpareValues>();
  const spareLines = Form.useWatch('lines', spareForm);
  const manager = !!user && canManageMaintenance(user.roleKey);
  const mayEdit = !!j && j.status === 'OPEN' && (manager || j.reportedById === user?.id);
  const stock = useStockBalances({ projectId: j?.projectId ?? undefined, inStock: true, pageSize: MAX_PAGE_SIZE, sortBy: 'item', sortOrder: 'asc' }, issuing && !!j?.projectId);
  const items = useMemo(() => stock.data?.items ?? [], [stock.data]);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['maintenance'] });
  };
  const close = useMutation({
    mutationFn: async (v: CloseValues) =>
      (
        await api.post<MaintenanceJobDto>(`/maintenance/jobs/${id}/close`, {
          closedDate: v.closedDate.format('YYYY-MM-DD'),
          workDone: v.workDone.trim(),
          downtimeHours: str(v.downtimeHours),
          labourCost: str(v.labourCost) ?? '0',
          partsCost: str(v.partsCost) ?? '0',
          meterReading: str(v.meterReading),
          workshop: v.workshop?.trim() || null,
        })
      ).data,
    onSuccess: (x) => {
      done(`${x.jobNo} closed`);
    },
    meta: FAIL_NOTICE,
  });
  const spares = useMutation({
    mutationFn: async (v: SpareValues) => {
      const lines = (v.lines ?? []).filter((l) => l?.itemId && l.quantity && l.quantity > 0).map((l) => ({ itemId: l.itemId!, quantity: String(l.quantity) }));
      if (!lines.length) throw new Error('Add at least one spare with a quantity.');
      return (await api.post<MaintenanceJobDto>(`/maintenance/jobs/${id}/spares`, { date: v.date.format('YYYY-MM-DD'), lines })).data;
    },
    onSuccess: (x) => {
      done(`Spares issued against ${x.jobNo}`);
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/maintenance/jobs/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  const startClose = () => {
    if (!j) return;
    closeForm.resetFields();
    closeForm.setFieldsValue({ closedDate: dayjs(), meterReading: j.meterReading === null ? null : Number(j.meterReading), workshop: j.workshop ?? undefined });
    setClosing(true);
  };
  const startIssue = () => {
    spareForm.resetFields();
    spareForm.setFieldsValue({ date: dayjs(), lines: [{}] });
    setIssuing(true);
  };
  const chosen = new Set((spareLines ?? []).map((l) => l?.itemId).filter(Boolean));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={680}
      className="job-drawer"
      title={
        j ? (
          <Space>
            {j.jobNo} <JobKindTag kind={j.kind} /> <JobStatusTag status={j.status} />
          </Space>
        ) : (
          'Job card'
        )
      }
      extra={
        j ? (
          <Space wrap>
            {mayEdit ? (
              <Button size="small" onClick={() => onEdit(j)}>
                Edit
              </Button>
            ) : null}
            {manager && j.status === 'OPEN' && j.projectId ? (
              <Button size="small" icon={<PlusOutlined />} onClick={startIssue}>
                Issue spares
              </Button>
            ) : null}
            {manager && j.status === 'OPEN' ? (
              <Button size="small" type="primary" onClick={startClose}>
                Close job
              </Button>
            ) : null}
            {manager ? (
              <ConfirmDelete what={`job card ${j.jobNo}`} onConfirm={() => remove.mutateAsync()} disabled={j.spares.length > 0 || !!j.vendorBillId}>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={j.spares.length > 0 || !!j.vendorBillId}
                  title={j.vendorBillId ? `Billed on ${j.vendorBillNo}` : j.spares.length ? 'Spares were issued; delete those stock issues first' : undefined}
                  aria-label="Delete"
                />
              </ConfirmDelete>
            ) : null}
          </Space>
        ) : null
      }
    >
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      {isLoading || !j ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Machine" span={2}>
              <b>{j.equipmentCode}</b> {j.equipmentName}
            </Descriptions.Item>
            <Descriptions.Item label="At">{j.projectName ?? 'Yard'}</Descriptions.Item>
            <Descriptions.Item label="Date">{formatDate(j.date)}</Descriptions.Item>
            <Descriptions.Item label="Reported by">{j.reportedByName}</Descriptions.Item>
            <Descriptions.Item label="Meter">{j.meterReading ? formatQty(j.meterReading) : NO_VALUE}</Descriptions.Item>
            <Descriptions.Item label={j.kind === 'BREAKDOWN' ? 'Fault' : 'Work to do'} span={2}>
              <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{j.description}</Typography.Paragraph>
            </Descriptions.Item>
            <Descriptions.Item label="Workshop" span={2}>
              {j.workshop ?? NO_VALUE}
            </Descriptions.Item>
            {j.status === 'CLOSED' ? (
              <>
                <Descriptions.Item label="Work done" span={2}>
                  <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{j.workDone}</Typography.Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="Closed">
                  {formatDate(j.closedDate)} by {j.closedByName}
                </Descriptions.Item>
                <Descriptions.Item label="Downtime">{j.downtimeHours ? `${formatQty(j.downtimeHours)} h` : NO_VALUE}</Descriptions.Item>
              </>
            ) : null}
            <Descriptions.Item label="Labour">{formatINR(j.labourCost)}</Descriptions.Item>
            <Descriptions.Item label="Parts bought">{formatINR(j.partsCost)}</Descriptions.Item>
            <Descriptions.Item label="Spares from store">{formatINR(j.sparesValue)}</Descriptions.Item>
            <Descriptions.Item label="Total cost">
              <b>{formatINR(j.totalCost)}</b>
            </Descriptions.Item>
            {j.vendorBillId ? (
              <Descriptions.Item label="Billed on" span={2}>
                <Link href={`/vendor-bills/${j.vendorBillId}`} className="mono">
                  {j.vendorBillNo}
                </Link>
              </Descriptions.Item>
            ) : null}
          </Descriptions>
          <Divider titlePlacement="start" plain>
            Spares issued
          </Divider>
          {j.spares.length ? (
            <Table
              size="small"
              rowKey={(r) => `${r.entryId}-${r.itemId}`}
              pagination={false}
              className="spares-table"
              dataSource={j.spares}
              columns={[
                { title: 'Fuel issue', dataIndex: 'entryNo', width: 130, className: 'mono' },
                { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
                { title: 'Spare', dataIndex: 'itemName' },
                { title: 'Qty', key: 'q', width: 100, align: 'right', render: (_, r) => `${formatQty(r.quantity)} ${unitLabel(r.unit)}` },
                { title: 'Value', dataIndex: 'value', width: 110, align: 'right', render: (v) => (v ? formatINR(v) : NO_VALUE) },
              ]}
            />
          ) : (
            <Typography.Text type="secondary">{j.projectId ? 'None yet.' : 'The machine is in the yard; parts bought are entered when the job is closed.'}</Typography.Text>
          )}
          {j.attachments.length ? (
            <>
              <Divider titlePlacement="start" plain>
                Photos
              </Divider>
              <AttachmentGallery attachments={j.attachments} />
            </>
          ) : null}
        </>
      )}

      <FormShell open={closing} onClose={() => setClosing(false)} form={closeForm} layout="modal" title={`Close ${j?.jobNo ?? ''}`} okText="Close job" onSubmit={(v) => close.mutateAsync(v)} width={620}>
        <Form form={closeForm} layout="vertical">
          {j?.kind === 'SERVICE' ? <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Closing a service restarts the machine's service schedule from this date." /> : null}
          <FormGrid cols={3}>
            <Form.Item name="closedDate" label="Back in work on" rules={[{ required: true, message: 'Choose the date' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || (!!j && d.isBefore(dayjs(j.date), 'day'))} allowClear={false} />
            </Form.Item>
            <Form.Item name="downtimeHours" label="Working hours lost">
              <QuantityInput unit="hours" />
            </Form.Item>
            <Form.Item name="meterReading" label="Hour meter / km">
              <QuantityInput />
            </Form.Item>
          </FormGrid>
          <Form.Item name="workDone" label="Work done" rules={[{ required: true, whitespace: true, message: 'Enter what was done' }]}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="labourCost" label="Labour">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="partsCost" label="Parts bought outside" tooltip="Spares issued from the store are counted on their own">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="workshop" label="Workshop / mechanic">
              <Input maxLength={200} />
            </Form.Item>
          </FormGrid>
        </Form>
      </FormShell>

      <FormShell open={issuing} onClose={() => setIssuing(false)} form={spareForm} layout="modal" title={`Issue spares for ${j?.jobNo ?? ''}`} okText="Issue" onSubmit={(v) => spares.mutateAsync(v)} width={620}>
        <Form form={spareForm} layout="vertical">
          <Typography.Paragraph type="secondary">From the store at {j?.projectName}. The issue slip is linked to this job card.</Typography.Paragraph>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]} style={{ maxWidth: 220 }}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
          </Form.Item>
          {!stock.isLoading && !items.length ? <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Nothing is in stock at this project." /> : null}
          <Form.List name="lines">
            {(fields, { add, remove: drop }) => (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {fields.map((f) => {
                  const itemId = spareForm.getFieldValue(['lines', f.name, 'itemId']) as string | undefined;
                  const row = items.find((i) => i.itemId === itemId);
                  return (
                    <div key={f.key} data-line-label={`Spare ${f.name + 1}`} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <Form.Item name={[f.name, 'itemId']} style={{ flex: 3, marginBottom: 0 }} rules={[{ required: true, message: 'Choose a spare' }]}>
                        <Select
                          showSearch={{ optionFilterProp: 'label' }}
                          placeholder="Spare or lubricant"
                          loading={stock.isLoading}
                          aria-label="Spare"
                          options={items.map((i) => ({ value: i.itemId, label: `${i.itemName} (${formatQty(i.balance)} ${unitLabel(i.unit)} in stock)`, disabled: chosen.has(i.itemId) && i.itemId !== itemId }))}
                        />
                      </Form.Item>
                      <Form.Item name={[f.name, 'quantity']} style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: 'Enter the quantity' }]}>
                        <QuantityInput unit={row?.unit} max={row ? Number(row.balance) : undefined} placeholder="Qty" aria-label="Quantity" />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => drop(f.name)} disabled={fields.length === 1} aria-label="Remove line" />
                    </div>
                  );
                })}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({})}>
                  Add spare
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </FormShell>
    </Drawer>
  );
}
