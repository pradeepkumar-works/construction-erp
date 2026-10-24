'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, DatePicker, Flex, Form, Input, InputNumber, Segmented, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  APPROVAL_CODES,
  APPROVAL_CODE_LABELS,
  DEFAULT_PORT_TO_SITE_DAYS,
  DELIVERABLE_STATUSES,
  DELIVERABLE_STATUS_LABELS,
  ENGINEERING_DISCIPLINES,
  ENGINEERING_DISCIPLINE_LABELS,
  IMPORT_STAGES,
  PACKAGE_STAGES,
  PACKAGE_STAGE_LABELS,
  approvalCodeApproves,
  isForeign,
  type ApprovalCode,
  type ClientInputDto,
  type DeliverableDto,
  type DeliverableStatus,
  type DisciplineSummaryDto,
  type EngineeringDiscipline,
  type EpcDto,
  type PackageDto,
  type PackageStage,
  type ProjectDetail,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useEpc, usePurchaseOrders, useStructure } from '@/lib/queries';
import { useUrlTab } from '@/lib/url-state';
import { formatDate, formatMoney, formatPct, inContract, moneyPrefix, outOfContract, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { VendorSelect } from '@/components/common/SearchSelect';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

const VIEWS = ['engineering', 'packages', 'inputs'] as const;
type View = (typeof VIEWS)[number];
const figure = { content: { fontSize: themeFontSize('fontSizeXL') } };
const STATUS_COLORS: Record<DeliverableStatus, string> = { NOT_STARTED: 'default', SUBMITTED: 'blue', COMMENTS: 'orange', APPROVED: 'green' };
const day = (v: string | null) => (v ? <span translate="no">{formatDate(v)}</span> : '-');
const ymd = (d: dayjs.Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null);
const notAfterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');

/**
 * Engineering and packages tab of an EPC project (item 130, ARCHITECTURE "EPC"): the design deliverables by discipline
 * with where each stands with the client, the equipment packages from order to commissioning against the day site needs
 * them, and the inputs the client owes, which become delays when late. Payment stages read deliverables and packages.
 * The open view is `?sub=` in the URL.
 */
export function EpcPanel({ project }: { project: ProjectDetail }) {
  const { data, isLoading, error, refetch } = useEpc(project.id);
  const [view, setView] = useUrlTab<View>(VIEWS, 'engineering');
  const [deliverable, setDeliverable] = useState<DeliverableDto | 'new' | null>(null);
  const [pkg, setPkg] = useState<PackageDto | 'new' | null>(null);
  const [input, setInput] = useState<ClientInputDto | 'new' | null>(null);

  if (isLoading) return <PageSkeleton shape="list" header={false} />;
  if (error || !data) return <QueryError error={error} onRetry={refetch} />;
  const s = data.summary;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <Space size={32} wrap>
        <Statistic title="Engineering approved" value={s.deliverables ? `${s.approved} of ${s.deliverables} (${formatPct(s.engineeringPct)})` : 'None listed'} styles={figure} />
        <Statistic title="Packages on site" value={s.packages ? `${s.delivered} of ${s.packages}` : 'None listed'} styles={figure} />
        <Statistic title="Late for site" value={s.late} styles={figure} />
        <Statistic title="Client inputs overdue" value={s.clientInputsOverdue} styles={figure} />
      </Space>
      {isForeign(data) ? (
        <Typography.Text type="secondary" translate="no">
          Contract in {data.currency} at ₹ {data.exchangeRate} to 1 {data.currency}. Package values show in it.
        </Typography.Text>
      ) : null}

      <Segmented<View>
        aria-label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'engineering', label: `Engineering (${data.deliverables.length})` },
          { value: 'packages', label: `Packages (${data.packages.length})` },
          { value: 'inputs', label: `Client inputs (${data.clientInputs.length})` },
        ]}
      />

      {view === 'engineering' ? <Engineering data={data} onEdit={setDeliverable} /> : null}
      {view === 'packages' ? <Packages data={data} onEdit={setPkg} /> : null}
      {view === 'inputs' ? <ClientInputs data={data} onEdit={setInput} /> : null}

      {data.canEditDeliverables ? <DeliverableForm projectId={project.id} target={deliverable} onClose={() => setDeliverable(null)} /> : null}
      {data.canEditPackages ? <PackageForm projectId={project.id} data={data} target={pkg} onClose={() => setPkg(null)} /> : null}
      {data.canEditClientInputs ? <ClientInputForm projectId={project.id} target={input} onClose={() => setInput(null)} /> : null}
    </div>
  );
}

/** Saves through the EPC endpoints, which answer with the whole tab, and refreshes what reads it. */
function useEpcSave<V>(projectId: string, call: (v: V) => Promise<EpcDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (d) => {
      qc.setQueryData(['epc', projectId], d);
      qc.invalidateQueries({ queryKey: ['contract', projectId, 'billing-breakup'] });
      qc.invalidateQueries({ queryKey: ['warnings'] });
    },
    meta: FAIL_NOTICE,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Engineering

function Engineering({ data, onEdit }: { data: EpcDto; onEdit: (d: DeliverableDto | 'new') => void }) {
  const [discipline, setDiscipline] = useState<EngineeringDiscipline | 'all'>('all');
  const [status, setStatus] = useState<DeliverableStatus | 'late' | 'all'>('all');
  const remove = useEpcSave<string>(data.projectId, async (id) => (await api.delete<EpcDto>(`/projects/${data.projectId}/epc/deliverables/${id}`)).data);
  const shown = data.deliverables.filter(
    (d) => (discipline === 'all' || d.discipline === discipline) && (status === 'all' || (status === 'late' ? d.lateDays !== null : d.status === status)),
  );
  const newButton = data.canEditDeliverables ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit('new')}>
      New deliverable
    </Button>
  ) : null;

  return (
    <>
      {data.summary.disciplines.length ? (
        <Section title="By discipline">
          <Table<DisciplineSummaryDto>
            size="small"
            rowKey="discipline"
            pagination={false}
            dataSource={data.summary.disciplines}
            scroll={{ x: 520 }}
            columns={[
              { key: 'd', title: 'Discipline', render: (_, r) => ENGINEERING_DISCIPLINE_LABELS[r.discipline] },
              { key: 't', title: 'Deliverables', align: 'right', render: (_, r) => <span translate="no">{r.total}</span> },
              { key: 's', title: 'Submitted', align: 'right', render: (_, r) => <span translate="no">{r.submitted}</span> },
              { key: 'a', title: 'Approved', align: 'right', render: (_, r) => <span translate="no">{`${r.approved} (${formatPct((100 * r.approved) / r.total)})`}</span> },
              { key: 'l', title: 'Late', align: 'right', render: (_, r) => (r.late ? <Tag color="red">{r.late}</Tag> : '0') },
            ]}
          />
        </Section>
      ) : null}
      <Section
        title="Deliverables"
        extra={
          <Space wrap>
            <Select
              aria-label="Discipline"
              value={discipline}
              onChange={setDiscipline}
              style={{ width: 210 }}
              options={[{ value: 'all', label: 'All disciplines' }, ...ENGINEERING_DISCIPLINES.map((d) => ({ value: d, label: ENGINEERING_DISCIPLINE_LABELS[d] }))]}
            />
            <Select
              aria-label="Status"
              value={status}
              onChange={setStatus}
              style={{ width: 190 }}
              options={[{ value: 'all', label: 'Any status' }, { value: 'late', label: 'Late' }, ...DELIVERABLE_STATUSES.map((st) => ({ value: st, label: DELIVERABLE_STATUS_LABELS[st] }))]}
            />
            {newButton}
          </Space>
        }
      >
        <Table<DeliverableDto>
          size="small"
          rowKey="id"
          dataSource={shown}
          pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 1000 }}
          locale={{ emptyText: data.deliverables.length ? 'None match these filters' : 'No deliverables yet. List the drawings and documents the client approves, by discipline.' }}
          columns={[
            {
              key: 'code',
              title: 'Deliverable',
              render: (_, d) => (
                <>
                  <div>
                    <span className="mono" translate="no">
                      {d.code}
                    </span>{' '}
                    {d.title}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {[ENGINEERING_DISCIPLINE_LABELS[d.discipline], d.workElementLabel, d.documentNo ? `filed as ${d.documentNo}${d.documentRevision ? ` ${d.documentRevision}` : ''}` : null].filter(Boolean).join(' · ')}
                  </Typography.Text>
                </>
              ),
            },
            { key: 'plan', title: 'Planned submit / approval', width: 190, render: (_, d) => <span translate="no">{`${d.plannedSubmitOn ? formatDate(d.plannedSubmitOn) : '-'} / ${d.plannedApprovalOn ? formatDate(d.plannedApprovalOn) : '-'}`}</span> },
            { key: 'sub', title: 'Submitted', width: 130, render: (_, d) => (d.submittedOn ? <span translate="no">{`${formatDate(d.submittedOn)}${d.revision ? ` ${d.revision}` : ''}`}</span> : '-') },
            {
              key: 'status',
              title: 'Status',
              width: 210,
              render: (_, d) => (
                <Flex vertical gap={2} align="start">
                  <Tag color={STATUS_COLORS[d.status]}>{d.approvalCode ? `${DELIVERABLE_STATUS_LABELS[d.status]}, code ${d.approvalCode}` : DELIVERABLE_STATUS_LABELS[d.status]}</Tag>
                  {d.approvedOn ? <span translate="no">{formatDate(d.approvedOn)}</span> : null}
                  {d.lateDays !== null ? <Tag color="red">{`${d.lateDays} days late for ${d.lateFor === 'SUBMISSION' ? 'submission' : 'approval'}`}</Tag> : null}
                </Flex>
              ),
            },
            { key: 'rel', title: 'Releases', width: 200, render: (_, d) => (d.releases.length ? d.releases.join('; ') : '-') },
            ...(data.canEditDeliverables
              ? [
                  {
                    key: 'actions',
                    title: '',
                    width: 120,
                    render: (_: unknown, d: DeliverableDto) => (
                      <Space size={0}>
                        <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Change ${d.code}`} onClick={() => onEdit(d)} />
                        <ConfirmDelete what={`deliverable ${d.code}`} verb="Remove" notice={false} onConfirm={() => remove.mutateAsync(d.id)}>
                          <Button size="small" type="link" danger>
                            Remove
                          </Button>
                        </ConfirmDelete>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Section>
    </>
  );
}

interface DeliverableValues {
  discipline: EngineeringDiscipline;
  code: string;
  title: string;
  workElementId?: string | null;
  plannedSubmitOn?: dayjs.Dayjs | null;
  plannedApprovalOn?: dayjs.Dayjs | null;
  submittedOn?: dayjs.Dayjs | null;
  revision?: string | null;
  approvalCode?: ApprovalCode | null;
  approvedOn?: dayjs.Dayjs | null;
  note?: string | null;
}

function DeliverableForm({ projectId, target, onClose }: { projectId: string; target: DeliverableDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<DeliverableValues>();
  const { message } = App.useApp();
  const code = Form.useWatch('approvalCode', form);
  const submitted = Form.useWatch('submittedOn', form);
  const { data: structure } = useStructure(target ? projectId : undefined);
  const d = target && target !== 'new' ? target : null;
  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (d)
      form.setFieldsValue({
        discipline: d.discipline,
        code: d.code,
        title: d.title,
        workElementId: d.workElementId,
        plannedSubmitOn: d.plannedSubmitOn ? dayjs(d.plannedSubmitOn) : null,
        plannedApprovalOn: d.plannedApprovalOn ? dayjs(d.plannedApprovalOn) : null,
        submittedOn: d.submittedOn ? dayjs(d.submittedOn) : null,
        revision: d.revision,
        approvalCode: d.approvalCode,
        approvedOn: d.approvedOn ? dayjs(d.approvedOn) : null,
        note: d.note,
      });
  }, [target, d, form]);
  const save = useEpcSave<DeliverableValues>(projectId, async (v) => {
    const approves = approvalCodeApproves(v.approvalCode);
    return (
      await api.put<EpcDto>(`/projects/${projectId}/epc/deliverables`, {
        id: d?.id,
        discipline: v.discipline,
        code: v.code,
        title: v.title,
        workElementId: v.workElementId ?? null,
        documentId: d?.documentId ?? null,
        plannedSubmitOn: ymd(v.plannedSubmitOn),
        plannedApprovalOn: ymd(v.plannedApprovalOn),
        submittedOn: ymd(v.submittedOn),
        revision: v.revision?.trim() || null,
        approvalCode: v.submittedOn ? (v.approvalCode ?? null) : null,
        approvedOn: approves ? ymd(v.approvedOn) : null,
        note: v.note?.trim() || null,
      })
    ).data;
  });
  return (
    <FormShell<DeliverableValues>
      open={!!target}
      onClose={onClose}
      form={form}
      layout="modal"
      width={680}
      projectDefault={false}
      title={d ? `Change ${d.code}` : 'New deliverable'}
      okText="Save deliverable"
      onSubmit={async (v) => {
        await save.mutateAsync(v);
        message.success(`Deliverable ${v.code} saved`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormGrid cols={3}>
          <Form.Item name="discipline" label="Discipline" rules={[{ required: true, message: 'Choose the discipline' }]}>
            <Select options={ENGINEERING_DISCIPLINES.map((x) => ({ value: x, label: ENGINEERING_DISCIPLINE_LABELS[x] }))} />
          </Form.Item>
          <Form.Item name="code" label="Number" rules={[{ required: true, whitespace: true, message: 'Give it a number, e.g. PRC-003' }]}>
            <Input maxLength={30} placeholder="PRC-003" />
          </Form.Item>
          <Form.Item name="workElementId" label="Component">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={structure?.elements.length ? 'The whole project' : 'No breakdown yet'}
              options={(structure?.elements ?? []).map((e) => ({ value: e.id, label: `${e.code} ${e.name}` }))}
            />
          </Form.Item>
        </FormGrid>
        <Form.Item name="title" label="Deliverable" rules={[{ required: true, whitespace: true, message: 'Say what the deliverable is' }]}>
          <Input maxLength={200} placeholder="Process design basis and mass balance" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="plannedSubmitOn" label="Planned submission">
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="plannedApprovalOn" label="Planned approval">
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="submittedOn" label="Submitted on" extra="The latest submission">
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={notAfterToday} />
          </Form.Item>
          <Form.Item name="revision" label="Revision">
            <Input maxLength={20} placeholder="R1" />
          </Form.Item>
          <Form.Item name="approvalCode" label="Returned with" extra={submitted ? 'Empty while the client has it' : 'Once it is submitted'}>
            <Select allowClear disabled={!submitted} options={APPROVAL_CODES.map((c) => ({ value: c, label: APPROVAL_CODE_LABELS[c] }))} />
          </Form.Item>
        </FormGrid>
        {approvalCodeApproves(code) ? (
          <Form.Item name="approvedOn" label="Approved on" rules={[{ required: true, message: 'Give the day the client approved it' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: 220, maxWidth: '100%' }} disabledDate={notAfterToday} />
          </Form.Item>
        ) : null}
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Equipment packages

function StageTimeline({ p }: { p: PackageDto }) {
  return (
    <Flex vertical gap={8}>
      <Table
        size="small"
        rowKey="stage"
        pagination={false}
        dataSource={p.stages}
        scroll={{ x: 520 }}
        columns={[
          { key: 'stage', title: 'Stage', render: (_, r) => PACKAGE_STAGE_LABELS[r.stage] },
          { key: 'plan', title: 'Planned', render: (_, r) => day(r.plannedOn) },
          { key: 'actual', title: 'Done', render: (_, r) => day(r.actualOn) },
          {
            key: 'slip',
            title: 'Slip',
            align: 'right',
            render: (_, r) =>
              r.slipDays === null ? (r.stage === p.nextStage && p.nextOverdueDays ? <Tag color="orange">{`${p.nextOverdueDays} days overdue`}</Tag> : '-') : r.slipDays > 0 ? <Tag color="orange">{`${r.slipDays} days late`}</Tag> : r.slipDays < 0 ? `${-r.slipDays} days early` : 'On the day',
          },
        ]}
      />
      {p.imported ? (
        <Typography.Text type="secondary" translate="no">
          {[p.vessel ? `Vessel ${p.vessel}` : null, p.billOfLading ? `B/L ${p.billOfLading}` : null, p.eta ? `ETA ${formatDate(p.eta)}` : null, `${p.portToSiteDays ?? DEFAULT_PORT_TO_SITE_DAYS} days from the port to site`].filter(Boolean).join(' · ')}
        </Typography.Text>
      ) : null}
      {p.problems.map((t) => (
        <Typography.Text key={t} type="danger">
          {t}
        </Typography.Text>
      ))}
      {p.note ? <Typography.Text>{p.note}</Typography.Text> : null}
    </Flex>
  );
}

function Packages({ data, onEdit }: { data: EpcDto; onEdit: (p: PackageDto | 'new') => void }) {
  const [only, setOnly] = useState<'all' | 'late' | 'open'>('all');
  const remove = useEpcSave<string>(data.projectId, async (id) => (await api.delete<EpcDto>(`/projects/${data.projectId}/epc/packages/${id}`)).data);
  const shown = data.packages.filter((p) => only === 'all' || (only === 'late' ? p.lateDays !== null : p.forecastFrom !== 'DELIVERED'));
  const values = data.packages.some((p) => p.value !== null);
  const late = data.packages.filter((p) => p.lateDays !== null);

  return (
    <>
      {late.length ? (
        <Alert
          type="warning"
          showIcon
          title={`${late.length === 1 ? 'One package reaches' : `${late.length} packages reach`} site after it is needed`}
          description={late.map((p) => `${p.code} ${p.name}: ${p.lateDays} days`).join('; ')}
        />
      ) : null}
      <Section
        title="Equipment packages"
        extra={
          <Space wrap>
            <Select
              aria-label="Show packages"
              value={only}
              onChange={setOnly}
              style={{ width: 190 }}
              options={[
                { value: 'all', label: 'All packages' },
                { value: 'open', label: 'Not yet on site' },
                { value: 'late', label: 'Late for site' },
              ]}
            />
            {data.canEditPackages ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit('new')}>
                New package
              </Button>
            ) : null}
          </Space>
        }
      >
        <Table<PackageDto>
          size="small"
          rowKey="id"
          dataSource={shown}
          pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 1080 }}
          expandable={{ expandedRowRender: (p) => <StageTimeline p={p} />, rowExpandable: (p) => p.stages.length > 0 || p.problems.length > 0 }}
          locale={{ emptyText: data.packages.length ? 'None match' : 'No packages yet. List the equipment bought for the plant, each with the day site needs it.' }}
          columns={[
            {
              key: 'pkg',
              title: 'Package',
              render: (_, p) => (
                <>
                  <div>
                    <span className="mono" translate="no">
                      {p.code}
                    </span>{' '}
                    {p.name}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {[ENGINEERING_DISCIPLINE_LABELS[p.discipline], p.vendorName, p.poNo, p.scope].filter(Boolean).join(' · ')}
                  </Typography.Text>
                </>
              ),
            },
            ...(values ? [{ key: 'value', title: 'Value', align: 'right' as const, width: 130, render: (_: unknown, p: PackageDto) => (p.value ? <span className="mono" translate="no">{formatMoney(p.value, data)}</span> : '-') }] : []),
            {
              key: 'stage',
              title: 'Stage',
              width: 220,
              render: (_, p) => (
                <Flex vertical gap={2} align="start">
                  <span>{p.currentStage ? PACKAGE_STAGE_LABELS[p.currentStage] : 'Not started'}</span>
                  {p.nextStage ? (
                    <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      Next: {PACKAGE_STAGE_LABELS[p.nextStage]}
                      {p.nextPlannedOn ? <span translate="no">{`, ${formatDate(p.nextPlannedOn)}`}</span> : null}
                    </Typography.Text>
                  ) : null}
                  {p.nextOverdueDays ? <Tag color="orange">{`${p.nextOverdueDays} days overdue`}</Tag> : null}
                </Flex>
              ),
            },
            { key: 'needed', title: 'Needed on site', width: 130, render: (_, p) => day(p.neededOn) },
            {
              key: 'forecast',
              title: 'On site',
              width: 200,
              render: (_, p) => (
                <Flex vertical gap={2} align="start">
                  <span translate="no">{p.forecastOnSite ? formatDate(p.forecastOnSite) : '-'}</span>
                  {p.forecastFrom && p.forecastFrom !== 'DELIVERED' ? (
                    <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      {p.forecastFrom === 'ETA' ? 'From the ship’s ETA' : 'From the plan and the slip so far'}
                    </Typography.Text>
                  ) : p.forecastFrom === 'DELIVERED' ? (
                    <Tag color="green">Delivered</Tag>
                  ) : null}
                  {p.lateDays !== null ? <Tag color="red">{`${p.lateDays} days late for site`}</Tag> : null}
                  {p.problems.length ? <Tag color="red">Dates to check</Tag> : null}
                </Flex>
              ),
            },
            ...(data.canEditPackages
              ? [
                  {
                    key: 'actions',
                    title: '',
                    width: 120,
                    render: (_: unknown, p: PackageDto) => (
                      <Space size={0}>
                        <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Change ${p.code}`} onClick={() => onEdit(p)} />
                        <ConfirmDelete what={`package ${p.code}`} verb="Remove" notice={false} onConfirm={() => remove.mutateAsync(p.id)}>
                          <Button size="small" type="link" danger>
                            Remove
                          </Button>
                        </ConfirmDelete>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Section>
    </>
  );
}

interface PackageValues {
  code: string;
  name: string;
  discipline: EngineeringDiscipline;
  workElementId?: string | null;
  vendorId?: string | null;
  purchaseOrderId?: string | null;
  scope?: string | null;
  value?: number | null;
  neededOn?: dayjs.Dayjs | null;
  vessel?: string | null;
  billOfLading?: string | null;
  eta?: dayjs.Dayjs | null;
  portToSiteDays?: number | null;
  note?: string | null;
  byShip?: 'yes' | 'no';
  stages?: Partial<Record<PackageStage, { plannedOn?: dayjs.Dayjs | null; actualOn?: dayjs.Dayjs | null }>>;
}

function PackageForm({ projectId, data, target, onClose }: { projectId: string; data: EpcDto; target: PackageDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<PackageValues>();
  const { message } = App.useApp();
  const vendorId = Form.useWatch('vendorId', form);
  const { data: structure } = useStructure(target ? projectId : undefined);
  const pos = usePurchaseOrders({ projectId, vendorId: vendorId ?? undefined, pageSize: 50 }, !!target && !!vendorId);
  const p = target && target !== 'new' ? target : null;
  const byShip = Form.useWatch('byShip', form) === 'yes';
  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (p)
      form.setFieldsValue({
        code: p.code,
        name: p.name,
        discipline: p.discipline,
        workElementId: p.workElementId,
        vendorId: p.vendorId,
        purchaseOrderId: p.purchaseOrderId,
        scope: p.scope,
        value: p.value === null ? null : inContract(toNumber(p.value), data),
        neededOn: p.neededOn ? dayjs(p.neededOn) : null,
        vessel: p.vessel,
        billOfLading: p.billOfLading,
        eta: p.eta ? dayjs(p.eta) : null,
        portToSiteDays: p.portToSiteDays,
        note: p.note,
        byShip: p.imported ? 'yes' : 'no',
        stages: Object.fromEntries(p.stages.map((s) => [s.stage, { plannedOn: s.plannedOn ? dayjs(s.plannedOn) : null, actualOn: s.actualOn ? dayjs(s.actualOn) : null }])),
      });
    else form.setFieldsValue({ discipline: 'MECHANICAL', byShip: 'no' });
  }, [target, p, data, form]);
  const poOptions = useMemo(() => {
    const named = new Map<string, string>(p?.purchaseOrderId && p.poNo ? [[p.purchaseOrderId, p.poNo]] : []);
    for (const o of pos.data?.items ?? []) named.set(o.id, `${o.poNo} · ${formatDate(o.poDate)}`);
    return [...named].map(([value, label]) => ({ value, label }));
  }, [pos.data, p]);
  const stages = PACKAGE_STAGES.filter((s) => byShip || !IMPORT_STAGES.includes(s));
  const save = useEpcSave<PackageValues>(projectId, async (v) => {
    const rows = stages
      .map((stage) => ({ stage, plannedOn: ymd(v.stages?.[stage]?.plannedOn), actualOn: ymd(v.stages?.[stage]?.actualOn) }))
      .filter((r) => r.plannedOn || r.actualOn);
    return (
      await api.put<EpcDto>(`/projects/${projectId}/epc/packages`, {
        id: p?.id,
        code: v.code,
        name: v.name,
        discipline: v.discipline,
        workElementId: v.workElementId ?? null,
        vendorId: v.vendorId ?? null,
        purchaseOrderId: v.vendorId ? (v.purchaseOrderId ?? null) : null,
        scope: v.scope?.trim() || null,
        value: v.value === null || v.value === undefined ? null : String(outOfContract(v.value, data)),
        neededOn: ymd(v.neededOn),
        vessel: byShip ? v.vessel?.trim() || null : null,
        billOfLading: byShip ? v.billOfLading?.trim() || null : null,
        eta: byShip ? ymd(v.eta) : null,
        portToSiteDays: byShip ? (v.portToSiteDays ?? null) : null,
        note: v.note?.trim() || null,
        stages: rows,
      })
    ).data;
  });
  return (
    <FormShell<PackageValues>
      open={!!target}
      onClose={onClose}
      form={form}
      layout="drawer"
      projectDefault={false}
      title={p ? `Change ${p.code}` : 'New equipment package'}
      okText="Save package"
      onSubmit={async (v) => {
        await save.mutateAsync(v);
        message.success(`Package ${v.code} saved`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormSection title="Package">
          <FormGrid cols={3}>
            <Form.Item name="code" label="Number" rules={[{ required: true, whitespace: true, message: 'Give it a number, e.g. PKG-04' }]}>
              <Input maxLength={30} placeholder="PKG-04" />
            </Form.Item>
            <Form.Item name="discipline" label="Discipline" rules={[{ required: true, message: 'Choose the discipline' }]}>
              <Select options={ENGINEERING_DISCIPLINES.map((x) => ({ value: x, label: ENGINEERING_DISCIPLINE_LABELS[x] }))} />
            </Form.Item>
            <Form.Item name="workElementId" label="Component">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="The whole plant" options={(structure?.elements ?? []).map((e) => ({ value: e.id, label: `${e.code} ${e.name}` }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="name" label="Equipment" rules={[{ required: true, whitespace: true, message: 'Say what the package is' }]}>
            <Input maxLength={200} placeholder="Air blowers with motors and acoustic hoods" />
          </Form.Item>
          <Form.Item name="scope" label="Scope">
            <Input maxLength={300} placeholder="2 duty + 1 standby, 850 m³/h at 6 m" />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="vendorId" label="Supplier">
              <VendorSelect allowClear prefer={['SUPPLIER']} selected={p?.vendorId && p.vendorName ? { value: p.vendorId, label: p.vendorName } : null} onChange={() => form.setFieldValue('purchaseOrderId', null)} />
            </Form.Item>
            <Form.Item name="purchaseOrderId" label="Purchase order">
              <Select allowClear disabled={!vendorId} loading={pos.isFetching} options={poOptions} placeholder={vendorId ? 'Its order on this project' : 'Choose the supplier first'} />
            </Form.Item>
            <Form.Item name="value" label="Value">
              <MoneyInput prefix={moneyPrefix(data)} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="neededOn" label="Needed on site" extra="The day erection needs it; a package forecast after it is late">
              <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="byShip" label="Comes by sea or air">
              <Segmented<'yes' | 'no'>
                aria-label="Comes by sea or air"
                options={[
                  { value: 'no', label: 'By road' },
                  { value: 'yes', label: 'Imported' },
                ]}
              />
            </Form.Item>
          </FormGrid>
        </FormSection>
        {byShip ? (
          <FormSection title="Shipping">
            <FormGrid cols={2}>
              <Form.Item name="vessel" label="Vessel">
                <Input maxLength={100} placeholder="MV Sea Falcon" />
              </Form.Item>
              <Form.Item name="billOfLading" label="Bill of lading">
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item name="eta" label="ETA at the port" extra="The forecast on site is the ETA plus the days to site">
                <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="portToSiteDays" label="Days from the port to site" extra="Customs and the truck">
                <InputNumber<number> min={0} max={120} precision={0} style={{ width: '100%' }} placeholder={String(DEFAULT_PORT_TO_SITE_DAYS)} inputMode="numeric" />
              </Form.Item>
            </FormGrid>
          </FormSection>
        ) : null}
        <FormSection title="Stages">
          <Typography.Paragraph type="secondary">Give a planned day to the stages that apply, and the day each is done. A stage with neither is left out.</Typography.Paragraph>
          {stages.map((stage) => (
            <FormGrid key={stage} cols={3}>
              <div style={{ alignSelf: 'center', paddingBottom: 12 }}>{PACKAGE_STAGE_LABELS[stage]}</div>
              <Form.Item name={['stages', stage, 'plannedOn']} label="Planned">
                <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name={['stages', stage, 'actualOn']} label="Done">
                <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={notAfterToday} />
              </Form.Item>
            </FormGrid>
          ))}
        </FormSection>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Client inputs

function ClientInputs({ data, onEdit }: { data: EpcDto; onEdit: (m: ClientInputDto | 'new') => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const remove = useEpcSave<string>(data.projectId, async (id) => (await api.delete<EpcDto>(`/projects/${data.projectId}/epc/client-inputs/${id}`)).data);
  const delay = useEpcSave<ClientInputDto>(data.projectId, async (m) => (await api.post<EpcDto>(`/projects/${data.projectId}/epc/client-inputs/${m.id}/delay`)).data);
  const lateGiven = (m: ClientInputDto) => !!m.achievedOn && m.achievedOn > m.dueDate;
  return (
    <Section
      title="What the client owes"
      extra={
        data.canEditClientInputs ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit('new')}>
            New client input
          </Button>
        ) : null
      }
    >
      <Typography.Paragraph type="secondary">Land, approvals, power for testing, design data: each with the day it is due. A late one becomes a delay the client answers for.</Typography.Paragraph>
      <Table<ClientInputDto>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={data.clientInputs}
        scroll={{ x: 760 }}
        locale={{ emptyText: 'Nothing listed yet' }}
        columns={[
          { key: 'name', title: 'Input', render: (_, m) => (m.note ? <>{m.name}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{m.note}</div></> : m.name) },
          { key: 'due', title: 'Due', width: 120, render: (_, m) => day(m.dueDate) },
          {
            key: 'given',
            title: 'Given',
            width: 170,
            render: (_, m) =>
              m.achievedOn ? (
                <Flex vertical gap={2} align="start">
                  <span translate="no">{formatDate(m.achievedOn)}</span>
                  {lateGiven(m) ? <Tag color="orange">{`${dayjs(m.achievedOn).diff(dayjs(m.dueDate), 'day')} days late`}</Tag> : null}
                </Flex>
              ) : m.overdueDays ? (
                <Tag color="red">{`${m.overdueDays} days overdue`}</Tag>
              ) : (
                'Not yet due'
              ),
          },
          {
            key: 'delay',
            title: 'Delay',
            width: 170,
            render: (_, m) =>
              m.delayId ? (
                <Link href={`/risks?id=${m.delayId}`}>{m.delayNo ?? 'Recorded'}</Link>
              ) : data.canRecordDelay && (m.overdueDays || lateGiven(m)) ? (
                <Button
                  size="small"
                  loading={delay.isPending && delay.variables?.id === m.id}
                  onClick={async () => {
                    await delay.mutateAsync(m);
                    qc.invalidateQueries({ queryKey: ['risks'] });
                    message.success(`Delay recorded for ${m.name}`);
                  }}
                >
                  Record delay
                </Button>
              ) : (
                '-'
              ),
          },
          ...(data.canEditClientInputs
            ? [
                {
                  key: 'actions',
                  title: '',
                  width: 120,
                  render: (_: unknown, m: ClientInputDto) => (
                    <Space size={0}>
                      <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Change ${m.name}`} onClick={() => onEdit(m)} />
                      <ConfirmDelete what={m.name} verb="Remove" notice={false} onConfirm={() => remove.mutateAsync(m.id)}>
                        <Button size="small" type="link" danger>
                          Remove
                        </Button>
                      </ConfirmDelete>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Section>
  );
}

interface ClientInputValues {
  name: string;
  dueDate: dayjs.Dayjs;
  achievedOn?: dayjs.Dayjs | null;
  note?: string | null;
}

function ClientInputForm({ projectId, target, onClose }: { projectId: string; target: ClientInputDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<ClientInputValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const m = target && target !== 'new' ? target : null;
  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (m) form.setFieldsValue({ name: m.name, dueDate: dayjs(m.dueDate), achievedOn: m.achievedOn ? dayjs(m.achievedOn) : null, note: m.note });
  }, [target, m, form]);
  const save = useEpcSave<ClientInputValues>(projectId, async (v) =>
    (
      await api.put<EpcDto>(`/projects/${projectId}/epc/client-inputs`, {
        id: m?.id,
        name: v.name,
        dueDate: ymd(v.dueDate),
        achievedOn: ymd(v.achievedOn),
        note: v.note?.trim() || null,
      })
    ).data,
  );
  return (
    <FormShell<ClientInputValues>
      open={!!target}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={m ? `Change ${m.name}` : 'New client input'}
      okText="Save"
      onSubmit={async (v) => {
        await save.mutateAsync(v);
        qc.invalidateQueries({ queryKey: ['risks'] });
        message.success(`${v.name} saved`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="name" label="What the client owes" rules={[{ required: true, whitespace: true, message: 'Say what the client owes' }]}>
          <Input maxLength={200} placeholder="Power for testing at the plant" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="dueDate" label="Due on" rules={[{ required: true, message: 'Give the day it is due' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="achievedOn" label="Given on" extra={m?.delayId ? 'Also ends the delay recorded for it' : 'Empty until the client gives it'}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={notAfterToday} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
