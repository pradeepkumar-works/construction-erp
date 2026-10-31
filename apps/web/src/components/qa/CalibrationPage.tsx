'use client';

import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Card, Checkbox, Drawer, Flex, Form, Input, InputNumber, Select, Statistic, Switch, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CALIBRATION_RESULTS, CALIBRATION_RESULT_LABELS, CALIBRATION_SOON_DAYS, calibrationDaysFor, canManageQaPlan, type AttachmentDto, type CalibrationResult, type QaInstrumentDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useInstrument, useInstruments, useMasterList, useQaLabs } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CalibrationTag } from './qaUi';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** "Due 10 Nov 2026, in 13 days" or "12 days overdue". */
function dueText(i: Pick<QaInstrumentDto, 'dueOn' | 'daysLeft' | 'state'>): string {
  if (!i.dueOn) return i.state === 'OUT_OF_USE' ? 'Not in use' : 'Calibrate before use';
  if (i.daysLeft === null) return formatDate(i.dueOn);
  if (i.daysLeft < 0) return `${formatDate(i.dueOn)}, ${-i.daysLeft} day${i.daysLeft === -1 ? '' : 's'} overdue`;
  return `${formatDate(i.dueOn)}, in ${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'}`;
}

interface InstrumentForm {
  name: string;
  kind: string;
  serialNo?: string;
  make?: string;
  range?: string;
  projectId?: string;
  labId?: string;
  intervalDays: number;
  active: boolean;
  notes?: string;
}

function InstrumentDialog({ editing, onClose }: { editing: QaInstrumentDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<InstrumentForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const [projectId] = useProjectScope();
  const inst = editing && editing !== 'new' ? editing : null;
  const { data: kinds } = useMasterList('instrument-kind', false, !!editing);
  const { data: labs } = useQaLabs(!!editing);
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(
      inst
        ? {
            name: inst.name,
            kind: inst.kind,
            serialNo: inst.serialNo ?? '',
            make: inst.make ?? '',
            range: inst.range ?? '',
            projectId: inst.projectId ?? undefined,
            labId: inst.labId ?? undefined,
            intervalDays: inst.intervalDays,
            active: inst.active,
            notes: inst.notes ?? '',
          }
        : { projectId, intervalDays: 365, active: true },
    );
  }, [editing, inst, form, projectId]);
  const save = useMutation({
    mutationFn: async (v: InstrumentForm) => {
      const body = { ...v, serialNo: v.serialNo || null, make: v.make || null, range: v.range || null, projectId: v.projectId || null, labId: v.labId || null, notes: v.notes || null };
      return inst ? (await api.put<QaInstrumentDto>(`/qa/instruments/${inst.id}`, body)).data : (await api.post<QaInstrumentDto>('/qa/instruments', body)).data;
    },
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved(`${i.name} saved`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="modal" width={640} projectDefault={false} title={inst ? `Edit ${inst.name}` : 'New instrument'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the instrument, such as CTM 2000 kN, site lab' }]}>
          <Input maxLength={120} placeholder="CTM 2000 kN, site lab" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="kind" label="Kind" rules={[{ required: true, message: 'Choose the kind of instrument' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Compression testing machine"
              options={(kinds?.entries ?? []).filter((e) => e.isActive || e.code === inst?.kind).map((e) => ({ value: e.code, label: e.name }))}
              onChange={(k: string) => {
                // A new instrument starts on its kind's usual interval.
                if (!inst) form.setFieldValue('intervalDays', calibrationDaysFor(k));
              }}
            />
          </Form.Item>
          <Form.Item name="intervalDays" label="Calibrate every (days)" rules={[{ required: true, message: 'Give the days between calibrations' }]}>
            <InputNumber min={7} max={1825} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="make" label="Make">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="serialNo" label="Serial number">
            <Input maxLength={60} translate="no" />
          </Form.Item>
          <Form.Item name="range" label="Range">
            <Input maxLength={80} placeholder="0 to 2000 kN" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="projectId" label="At the project">
            <ProjectSelect placeholder="Head office or a lab" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="labId" label="In the lab">
            <Select allowClear placeholder="None" showSearch={{ optionFilterProp: 'label' }} options={(labs ?? []).filter((l) => l.active || l.id === inst?.labId).map((l) => ({ value: l.id, label: l.name }))} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="notes" label="Notes">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item name="active" label="In use" valuePropName="checked">
            <Switch />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

interface CalibrationForm {
  calibratedOn: dayjs.Dayjs;
  result: CalibrationResult;
  certificateNo?: string;
  agency?: string;
  nextDueOn?: dayjs.Dayjs | null;
  remarks?: string;
  photos?: AttachmentDto[];
}

function CalibrateDialog({ inst, onClose }: { inst: QaInstrumentDto | null; onClose: () => void }) {
  const [form] = Form.useForm<CalibrationForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const result = Form.useWatch('result', form);
  useEffect(() => {
    if (!inst) return;
    form.resetFields();
    form.setFieldsValue({ calibratedOn: dayjs(), result: 'OK' });
  }, [inst, form]);
  const save = useMutation({
    mutationFn: async (v: CalibrationForm) =>
      (
        await api.post<QaInstrumentDto>(`/qa/instruments/${inst!.id}/calibrations`, {
          calibratedOn: v.calibratedOn.format('YYYY-MM-DD'),
          result: v.result,
          certificateNo: v.certificateNo || null,
          agency: v.agency || null,
          nextDueOn: v.result !== 'FAILED' && v.nextDueOn ? v.nextDueOn.format('YYYY-MM-DD') : null,
          remarks: v.remarks || null,
          attachmentIds: (v.photos ?? []).map((a) => a.id),
        })
      ).data,
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved(i.state === 'OUT_OF_USE' ? `${i.name} is out of use until calibrated again` : `${i.name} calibrated, next due ${formatDate(i.dueOn)}`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!inst} onClose={onClose} form={form} layout="modal" width={560} projectDefault={false} title={inst ? `Record calibration of ${inst.name}` : 'Record calibration'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="calibratedOn" label="Calibrated on" rules={[{ required: true, message: 'Pick the day it was calibrated' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="result" label="Result" rules={[{ required: true, message: 'Choose the result' }]}>
            <Select options={CALIBRATION_RESULTS.map((r) => ({ value: r, label: CALIBRATION_RESULT_LABELS[r] }))} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="certificateNo" label="Certificate number" rules={result === 'FAILED' ? [] : [{ required: true, whitespace: true, message: 'Give the certificate number' }]}>
            <Input maxLength={60} translate="no" placeholder="CAL/2026/1182" />
          </Form.Item>
          <Form.Item name="agency" label="Calibrated by">
            <Input maxLength={120} placeholder="An NABL calibration lab" />
          </Form.Item>
        </FormGrid>
        {result !== 'FAILED' ? (
          <Form.Item name="nextDueOn" label="Next due" extra={inst ? `Left empty, ${inst.intervalDays} days from the calibration` : undefined}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        ) : null}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="photos" label="Certificate">
          <PhotoUpload max={3} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function InstrumentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const { data, isLoading } = useInstrument(id);
  return (
    <Drawer open={!!id} onClose={onClose} size="large" title={data?.name ?? 'Instrument'}>
      {isLoading || !data ? (
        <PageSkeleton shape="record" header={false} />
      ) : (
        <Flex vertical gap={token.margin}>
          <Flex gap={token.marginXS} wrap align="center">
            <CalibrationTag state={data.state} />
            <Typography.Text type="secondary">{dueText(data)}</Typography.Text>
          </Flex>
          <Typography.Paragraph style={{ margin: 0 }}>
            {[data.kindName, data.make, data.serialNo && `serial ${data.serialNo}`, data.range].filter(Boolean).join(' · ')}
            <br />
            {[data.projectName, data.labName].filter(Boolean).join(', ') || 'Head office'} · calibrated every {data.intervalDays} days
          </Typography.Paragraph>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Calibrations
          </Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.history ?? []}
            locale={{ emptyText: 'Not calibrated yet' }}
            scroll={{ x: 560 }}
            columns={[
              { title: 'On', dataIndex: 'calibratedOn', render: (v: string) => formatDate(v) },
              { title: 'Certificate', key: 'cert', render: (_, c) => <span translate="no">{[c.certificateNo, c.agency].filter(Boolean).join(', ') || '-'}</span> },
              { title: 'Result', dataIndex: 'result', render: (v: CalibrationResult) => <AppTag tone={v === 'FAILED' ? 'danger' : 'success'}>{CALIBRATION_RESULT_LABELS[v]}</AppTag> },
              { title: 'Next due', dataIndex: 'nextDueOn', render: (v: string | null) => (v ? formatDate(v) : '-') },
              { title: 'File', key: 'files', render: (_, c) => (c.attachments.length ? <AttachmentGallery attachments={c.attachments} size={48} /> : '-') },
            ]}
          />
        </Flex>
      )}
    </Drawer>
  );
}

/** The calibration register (item 137 part 2): lab and survey instruments by where they stand, oldest due first. */
export function CalibrationPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const manage = !!user && canManageQaPlan(user.roleKey);
  const [projectId, setProjectId] = useProjectScope();
  const [attention, setAttention] = useState(false);
  const { data, isLoading, error, refetch } = useInstruments({ projectId, attention: attention || undefined });
  const qc = useQueryClient();
  const [editing, setEditing] = useState<QaInstrumentDto | 'new' | null>(null);
  const [calibrating, setCalibrating] = useState<QaInstrumentDto | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/qa/instruments/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality', 'qa'] }),
  });
  const newButton = manage ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
      New instrument
    </Button>
  ) : undefined;

  return (
    <div className="page-container">
      <PageHeader title="Calibration register" subtitle="Lab and survey instruments with their certificates and when each falls due. A test on an instrument out of calibration is flagged." extra={newButton} />
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} style={{ minWidth: 240, maxWidth: '100%' }} />
          <Checkbox checked={attention} onChange={(e) => setAttention(e.target.checked)}>
            Only those needing attention
          </Checkbox>
        </Flex>
        {isLoading ? (
          <PageSkeleton shape="list" header={false} />
        ) : error || !data ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <Flex gap={token.marginXL} wrap style={{ marginBottom: token.margin }}>
              <Statistic title="Overdue" value={data.overdue} styles={{ content: data.overdue ? { color: token.colorErrorText } : undefined }} />
              <Statistic title={`Due in the next ${CALIBRATION_SOON_DAYS} days`} value={data.dueSoon} />
              <Statistic title="Out of use" value={data.outOfUse} />
            </Flex>
            <Table<QaInstrumentDto>
              rowKey="id"
              size="middle"
              dataSource={data.items}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{
                emptyText: (
                  <Flex vertical align="center" gap={token.marginSM}>
                    <Typography.Text type="secondary">{attention ? 'Every instrument is in calibration.' : 'No instrument yet. Add the compression testing machine, moulds, cones and scales.'}</Typography.Text>
                    {attention ? null : newButton}
                  </Flex>
                ),
              }}
              columns={[
                {
                  title: 'Instrument',
                  key: 'name',
                  render: (_, i) => (
                    <Flex vertical gap={2} align="start">
                      <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setOpen(i.id)}>
                        {i.name}
                      </Button>
                      <Typography.Text type="secondary">{[i.kindName, i.serialNo].filter(Boolean).join(' · ')}</Typography.Text>
                    </Flex>
                  ),
                },
                { title: 'Where', key: 'where', render: (_, i) => [i.projectName, i.labName].filter(Boolean).join(', ') || 'Head office' },
                {
                  title: 'Last calibrated',
                  key: 'last',
                  render: (_, i) =>
                    i.lastCalibratedOn ? (
                      <Flex vertical gap={2}>
                        <span>{formatDate(i.lastCalibratedOn)}</span>
                        <Typography.Text type="secondary" translate="no">
                          {i.certificateNo ?? ''}
                        </Typography.Text>
                      </Flex>
                    ) : (
                      'Never'
                    ),
                },
                {
                  title: 'Due',
                  key: 'due',
                  render: (_, i) => (
                    <Flex vertical gap={2} align="start">
                      <CalibrationTag state={i.state} />
                      <Typography.Text type="secondary">{dueText(i)}</Typography.Text>
                    </Flex>
                  ),
                },
                ...(manage
                  ? [
                      {
                        title: <span style={srOnly}>Actions</span>,
                        key: 'actions',
                        width: 220,
                        render: (_: unknown, i: QaInstrumentDto) => (
                          <Flex gap={4} align="center">
                            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => setCalibrating(i)}>
                              Record calibration
                            </Button>
                            <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)} />
                            <ConfirmDelete what={i.name} description={i.lastCalibratedOn ? 'It has calibrations, so it is switched off and kept with them.' : undefined} verb={i.lastCalibratedOn ? 'Remove' : 'Delete'} onConfirm={() => remove.mutateAsync(i.id)}>
                              <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${i.name}`} />
                            </ConfirmDelete>
                          </Flex>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        )}
      </Card>
      <InstrumentDialog editing={editing} onClose={() => setEditing(null)} />
      <CalibrateDialog inst={calibrating} onClose={() => setCalibrating(null)} />
      <InstrumentDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
