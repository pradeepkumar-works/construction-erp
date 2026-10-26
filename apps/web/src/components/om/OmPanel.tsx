'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, Flex, Form, Input, InputNumber, Segmented, Select, Space, Statistic, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { DeleteOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_OM_BENCHMARKS,
  OM_BENCHMARK_INFO,
  omLimitText,
  omRuleText,
  type ItemDto,
  type OmBenchmark,
  type OmBenchmarkMonthDto,
  type OmChemicalRowDto,
  type OmDto,
  type OmPeriodDto,
  type OmPeriodStatus,
  type ProjectDetail,
  type RaBillDto,
  type ServiceLevelDayDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useOm } from '@/lib/queries';
import { useUrlParam, useUrlTab } from '@/lib/url-state';
import { formatDate, formatINR, formatMonth, formatPct, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { ItemSelect } from '@/components/common/SearchSelect';
import { recordPage } from '@/components/approvals/queue';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';

const VIEWS = ['service', 'periods', 'staff', 'chemicals', 'terms'] as const;
type View = (typeof VIEWS)[number];
const figure = { content: { fontSize: themeFontSize('fontSizeXL') } };
const small = { fontSize: themeFontSize('fontSizeSM') };
const PERIOD_COLORS: Record<OmPeriodStatus, string> = { FUTURE: 'default', RUNNING: 'blue', DUE: 'orange', BILLED: 'green' };
const PERIOD_LABELS: Record<OmPeriodStatus, string> = { FUTURE: 'Not started', RUNNING: 'Running', DUE: 'Due to bill', BILLED: 'Billed' };
const CHEMICAL_COLORS: Record<OmChemicalRowDto['status'], string> = { OVER: 'red', UNDER: 'orange', WITHIN: 'green', NO_WATER: 'default' };
const CHEMICAL_LABELS: Record<OmChemicalRowDto['status'], string> = { OVER: 'Over the norm', UNDER: 'Under the norm', WITHIN: 'Within the norm', NO_WATER: 'No water logged' };
const num = (v: string | number | null) => (v === null || v === '' ? '-' : <span translate="no">{formatQty(v)}</span>);
const shiftMonth = (m: string, n: number) => dayjs(`${m}-01`).add(n, 'month').format('YYYY-MM');
const toStr = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

/**
 * O&M tab of a handed-over project (item 131, ARCHITECTURE "Operation and maintenance"): the contract's years paid in
 * instalments, the daily service levels against the benchmarks with the month's failures and penalties, the staff
 * deployed against the minimum, the treatment chemicals against their norm, and each period's O&M bill. The open view is
 * `?sub=` and the month the log shows `?month=` in the URL.
 */
export function OmPanel({ project }: { project: ProjectDetail }) {
  const [month, setMonth] = useUrlParam('month');
  const { data, isLoading, error, refetch, isFetching } = useOm(project.id, month);
  const [view, setView] = useUrlTab<View>(VIEWS, 'service');
  const [day, setDay] = useState<ServiceLevelDayDto | 'new' | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  if (isLoading) return <PageSkeleton shape="list" header={false} />;
  if (error || !data) return <QueryError error={error} onRetry={refetch} />;

  if (!data.contract)
    return (
      <div style={{ padding: 24 }}>
        <p>
          {data.handedOverOn
            ? `Handed over on ${formatDate(data.handedOverOn)}. Set out the O&M terms (years, % of the contract each year, instalments, service level benchmarks, minimum staff and chemical norms) to log service levels and bill each period.`
            : 'O&M starts after handover. Record the handover in the Handover tab first.'}
        </p>
        {data.handedOverOn && data.canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setTermsOpen(true)}>
            Set out O&M terms
          </Button>
        ) : null}
        {data.canManage ? <TermsForm project={project} data={data} open={termsOpen} onClose={() => setTermsOpen(false)} /> : null}
      </div>
    );

  const c = data.contract;
  const running = data.periods.find((p) => p.status === 'RUNNING');
  const due = data.periods.filter((p) => p.status === 'DUE').length;
  const shown = data.months.find((m) => m.month === data.month);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <Space size={32} wrap>
        <Statistic title="Now in" value={data.current?.label ?? (data.today < c.startOn ? `Starts ${formatDate(c.startOn)}` : 'Ended')} styles={figure} />
        <Statistic title="This period so far" value={running ? formatINR(running.net) : '-'} styles={figure} />
        <Statistic title="Penalties this period" value={running ? formatINR(running.penalty) : '-'} styles={figure} />
        <Statistic title="Periods due to bill" value={due} styles={figure} />
      </Space>
      <Typography.Text type="secondary">
        {`${c.years} years from ${formatDate(c.startOn)} to ${formatDate(c.endsOn)}${c.extensionYears ? ` (extendable by ${c.extensionYears})` : ''}, paid in ${c.instalmentsPerYear} instalments a year, serving ${c.population.toLocaleString('en-IN')} people.`}
      </Typography.Text>

      <Segmented<View>
        aria-label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'service', label: 'Service levels' },
          { value: 'periods', label: `Periods and bills (${data.periods.filter((p) => p.status !== 'FUTURE').length})` },
          { value: 'staff', label: 'Staff' },
          { value: 'chemicals', label: 'Chemicals' },
          { value: 'terms', label: 'Terms' },
        ]}
      />

      {view === 'service' || view === 'staff' || view === 'chemicals' ? (
        <Flex align="center" gap={8} wrap>
          <Button icon={<LeftOutlined />} aria-label="Previous month" disabled={data.month <= c.startOn.slice(0, 7)} onClick={() => setMonth(shiftMonth(data.month, -1))} />
          <Typography.Text strong style={{ minWidth: 90, textAlign: 'center' }} translate="no">
            {formatMonth(data.month)}
          </Typography.Text>
          <Button icon={<RightOutlined />} aria-label="Next month" disabled={data.month >= data.today.slice(0, 7) || data.month >= c.endsOn.slice(0, 7)} onClick={() => setMonth(shiftMonth(data.month, 1))} />
          {month ? (
            <Button type="link" onClick={() => setMonth(undefined)}>
              This month
            </Button>
          ) : null}
          {isFetching ? <Typography.Text type="secondary">Loading…</Typography.Text> : null}
        </Flex>
      ) : null}

      {view === 'service' ? <ServiceLevels data={data} benchmarks={shown?.benchmarks ?? []} missing={shown?.missingDays ?? []} onEdit={setDay} /> : null}
      {view === 'periods' ? <Periods project={project} data={data} /> : null}
      {view === 'staff' ? <Staff data={data} onRecord={() => setStaffOpen(true)} /> : null}
      {view === 'chemicals' ? <Chemicals data={data} /> : null}
      {view === 'terms' ? <Terms data={data} onEdit={() => setTermsOpen(true)} /> : null}

      {data.canLog ? <DayForm data={data} target={day} onClose={() => setDay(null)} /> : null}
      {data.canRecordStaff ? <StaffForm data={data} open={staffOpen} onClose={() => setStaffOpen(false)} /> : null}
      {data.canManage ? <TermsForm project={project} data={data} open={termsOpen} onClose={() => setTermsOpen(false)} /> : null}
    </div>
  );
}

/** Saves through the O&M endpoints, which answer with the tab for the month saved, and refreshes what reads it. */
function useOmSave<V>(projectId: string, call: (v: V) => Promise<OmDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['om', projectId] });
      qc.invalidateQueries({ queryKey: ['warnings'] });
    },
    meta: FAIL_NOTICE,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Service levels

function ServiceLevels({ data, benchmarks, missing, onEdit }: { data: OmDto; benchmarks: OmBenchmarkMonthDto[]; missing: string[]; onEdit: (d: ServiceLevelDayDto | 'new') => void }) {
  const remove = useOmSave<string>(data.projectId, async (id) => (await api.delete<OmDto>(`/projects/${data.projectId}/om/days/${id}`)).data);
  const newButton = data.canLog ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit('new')}>
      Record a day
    </Button>
  ) : null;
  const penalty = benchmarks.reduce((s, b) => s + Number(b.penalty), 0);
  return (
    <>
      <Section title={`Benchmarks in ${formatMonth(data.month)}`} extra={<span translate="no">{penalty ? `Penalties ${formatINR(penalty)}` : 'No penalties'}</span>}>
        <Table<OmBenchmarkMonthDto>
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={benchmarks}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'No readings this month yet' }}
          columns={[
            {
              key: 'b',
              title: 'Benchmark',
              render: (_, b) => (
                <>
                  <div>{OM_BENCHMARK_INFO[b.key].label}</div>
                  <Typography.Text type="secondary" style={small}>
                    {`${omRuleText(b.key, b.limit)}, ${OM_BENCHMARK_INFO[b.key].basis === 'DAY' ? 'each day' : 'over the month'}`}
                  </Typography.Text>
                </>
              ),
            },
            { key: 'v', title: 'Month or worst day', width: 170, align: 'right', render: (_, b) => (b.value === null ? '-' : <span translate="no">{omLimitText(b.key, b.value)}</span>) },
            {
              key: 'f',
              title: 'Failures',
              width: 220,
              render: (_, b) => (
                <Flex vertical gap={2} align="start">
                  <span translate="no">{`${b.failures} (${b.allowed} allowed)`}</span>
                  {b.days.length ? (
                    <Typography.Text type="secondary" style={small} translate="no">
                      {b.days.map((d) => dayjs(d).format('D MMM')).join(', ')}
                    </Typography.Text>
                  ) : null}
                </Flex>
              ),
            },
            { key: 'p', title: 'Penalty', width: 130, align: 'right', render: (_, b) => (Number(b.penalty) ? <AppTag tone="danger">{formatINR(b.penalty)}</AppTag> : <span translate="no">{formatINR(0)}</span>) },
          ]}
        />
      </Section>
      <Section title="Daily log" extra={newButton}>
        {missing.length ? (
          <p>
            <Typography.Text type="warning">
              {`${missing.length} ${missing.length === 1 ? 'day has' : 'days have'} no reading: ${missing.map((d) => dayjs(d).format('D MMM')).join(', ')}. Missing days are not penalised, but the client will ask for them.`}
            </Typography.Text>
          </p>
        ) : null}
        <Table<ServiceLevelDayDto>
          size="small"
          rowKey="id"
          dataSource={data.days}
          pagination={false}
          scroll={{ x: 1280 }}
          locale={{ emptyText: 'No days logged this month' }}
          columns={[
            { key: 'date', title: 'Day', width: 110, render: (_, d) => <span translate="no" style={{ whiteSpace: 'nowrap' }}>{dayjs(d.date).format('ddd D MMM')}</span> },
            { key: 'prod', title: 'Produced (kl)', width: 110, align: 'right', render: (_, d) => num(d.producedKl) },
            { key: 'sup', title: 'Supplied (kl)', width: 110, align: 'right', render: (_, d) => num(d.suppliedKl) },
            { key: 'lpcd', title: 'lpcd', width: 80, align: 'right', render: (_, d) => num(d.lpcd) },
            { key: 'loss', title: 'Lost', width: 80, align: 'right', render: (_, d) => (d.lossPct === null ? '-' : <span translate="no">{formatPct(d.lossPct)}</span>) },
            { key: 'cl', title: 'Chlorine (mg/l)', width: 120, align: 'right', render: (_, d) => num(d.residualChlorine) },
            { key: 'pr', title: 'Pressure (m)', width: 110, align: 'right', render: (_, d) => num(d.tailPressureM) },
            { key: 'cm', title: 'Complaints closed', width: 140, align: 'right', render: (_, d) => <span translate="no">{`${d.complaintsClosed48h} of ${d.complaintsReceived}`}</span> },
            { key: 'pe', title: 'Pumps', width: 80, align: 'right', render: (_, d) => (d.pumpEfficiencyPct === null ? '-' : <span translate="no">{formatPct(d.pumpEfficiencyPct)}</span>) },
            {
              key: 'fail',
              title: 'Missed and notes',
              width: 260,
              render: (_, d) => (
                <Flex vertical gap={2} align="start">
                  {d.failures.length ? (
                    <Flex gap={4} wrap>
                      {d.failures.map((f) => (
                        <AppTag key={f} tone="danger">
                          {OM_BENCHMARK_INFO[f].short}
                        </AppTag>
                      ))}
                    </Flex>
                  ) : null}
                  {d.note ? (
                    <Typography.Text type="secondary" style={small}>
                      {d.note}
                    </Typography.Text>
                  ) : null}
                  {!d.failures.length && !d.note ? '-' : null}
                </Flex>
              ),
            },
            { key: 'by', title: 'Entered by', width: 130, render: (_, d) => d.enteredByName },
            ...(data.canLog
              ? [
                  {
                    key: 'actions',
                    title: '',
                    width: 80,
                    render: (_: unknown, d: ServiceLevelDayDto) =>
                      d.locked ? (
                        <Typography.Text type="secondary" style={small}>
                          Billed
                        </Typography.Text>
                      ) : (
                        <Space size={0}>
                          <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Change ${formatDate(d.date)}`} onClick={() => onEdit(d)} />
                          <ConfirmDelete what={`the reading of ${formatDate(d.date)}`} verb="Remove" notice={false} onConfirm={() => remove.mutateAsync(d.id)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${formatDate(d.date)}`} />
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

interface DayValues {
  date: dayjs.Dayjs;
  producedKl: number;
  suppliedKl: number;
  residualChlorine?: number | null;
  tailPressureM?: number | null;
  complaintsReceived?: number | null;
  complaintsClosed48h?: number | null;
  pumpEfficiencyPct?: number | null;
  note?: string | null;
}

function DayForm({ data, target, onClose }: { data: OmDto; target: ServiceLevelDayDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<DayValues>();
  const { message } = App.useApp();
  const d = target && target !== 'new' ? target : null;
  const c = data.contract!;
  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (d)
      form.setFieldsValue({
        date: dayjs(d.date),
        producedKl: Number(d.producedKl),
        suppliedKl: Number(d.suppliedKl),
        residualChlorine: d.residualChlorine === null ? null : Number(d.residualChlorine),
        tailPressureM: d.tailPressureM === null ? null : Number(d.tailPressureM),
        complaintsReceived: d.complaintsReceived,
        complaintsClosed48h: d.complaintsClosed48h,
        pumpEfficiencyPct: d.pumpEfficiencyPct === null ? null : Number(d.pumpEfficiencyPct),
        note: d.note,
      });
    else form.setFieldsValue({ date: dayjs(data.today), complaintsReceived: 0, complaintsClosed48h: 0 });
  }, [target, d, form, data.today]);
  const save = useOmSave<DayValues>(data.projectId, async (v) =>
    (
      await api.put<OmDto>(`/projects/${data.projectId}/om/days`, {
        date: v.date.format('YYYY-MM-DD'),
        producedKl: String(v.producedKl),
        suppliedKl: String(v.suppliedKl),
        residualChlorine: toStr(v.residualChlorine),
        tailPressureM: toStr(v.tailPressureM),
        complaintsReceived: v.complaintsReceived ?? 0,
        complaintsClosed48h: v.complaintsClosed48h ?? 0,
        pumpEfficiencyPct: toStr(v.pumpEfficiencyPct),
        note: v.note?.trim() || null,
      })
    ).data,
  );
  const limit = (key: OmBenchmark) => {
    const b = c.benchmarks.find((x) => x.key === key);
    return b ? `The contract asks ${omRuleText(key, b.limit)}` : undefined;
  };
  return (
    <FormShell<DayValues>
      open={!!target}
      onClose={onClose}
      form={form}
      layout="modal"
      width={680}
      projectDefault={false}
      title={d ? `Change the reading of ${formatDate(d.date)}` : 'Record a day’s service levels'}
      okText="Save reading"
      onSubmit={async (v) => {
        await save.mutateAsync(v);
        message.success(`Reading of ${formatDate(v.date.format('YYYY-MM-DD'))} saved`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormGrid cols={3}>
          <Form.Item name="date" label="Day" rules={[{ required: true, message: 'Choose the day' }]}>
            <DatePicker
             
              style={{ width: '100%' }}
              disabled={!!d}
              disabledDate={(x) => x.isAfter(dayjs(data.today), 'day') || x.isBefore(dayjs(c.startOn), 'day') || x.isAfter(dayjs(c.endsOn), 'day')}
            />
          </Form.Item>
          <Form.Item name="producedKl" label="Water produced" rules={[{ required: true, message: 'Give the treated water out of the plant' }]} extra="Out of the treatment plant">
            <QuantityInput unit="kl" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="suppliedKl"
            label="Water supplied"
            extra={limit('LPCD')}
            dependencies={['producedKl']}
            rules={[
              { required: true, message: 'Give the water that reached consumers' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (v === null || v === undefined || !getFieldValue('producedKl') || v <= getFieldValue('producedKl') * 1.05 ? Promise.resolve() : Promise.reject(new Error('Supplied cannot be more than produced: check both meters'))),
              }),
            ]}
          >
            <QuantityInput unit="kl" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="residualChlorine" label="Residual chlorine at the tail end" extra={limit('CHLORINE')}>
            <QuantityInput unit="mg/l" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="tailPressureM" label="Pressure at the tail end" extra={limit('PRESSURE')}>
            <QuantityInput unit="m" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pumpEfficiencyPct" label="Pump efficiency" rules={[{ type: 'number', max: 100, message: 'Give the efficiency as a % up to 100' }]}>
            <QuantityInput unit="%" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="complaintsReceived" label="Complaints received">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="complaintsClosed48h"
            label="Closed within 48 hours"
            dependencies={['complaintsReceived']}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, v) => ((v ?? 0) <= (getFieldValue('complaintsReceived') ?? 0) ? Promise.resolve() : Promise.reject(new Error('Closed cannot be more than received'))),
              }),
            ]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} placeholder="Pipe burst at the market, supply cut 3 hours" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Periods and their bills

function Periods({ project, data }: { project: ProjectDetail; data: OmDto }) {
  const qc = useQueryClient();
  const notify = useNotify();
  const firstDue = data.periods.find((p) => p.status === 'DUE');
  const prepare = useMutation({
    mutationFn: async (p: OmPeriodDto) => (await api.post<RaBillDto>('/ra-bills', { projectId: project.id, billDate: data.today, omYear: p.year, omInstalment: p.instalment })).data,
    onSuccess: (b) => {
      notify.saved(`${b.billLabel} prepared as a draft`, recordPage('BILL', b.id));
      qc.invalidateQueries({ queryKey: ['om', project.id] });
      qc.invalidateQueries({ queryKey: ['bills'] });
    },
    meta: FAIL_NOTICE,
  });
  const shown = data.periods.filter((p) => p.status !== 'FUTURE' || p === data.periods.find((x) => x.status === 'FUTURE'));
  return (
    <Section title="Periods" extra={<Typography.Text type="secondary">Each period is billed once it is over, in order</Typography.Text>}>
      <Table<OmPeriodDto>
        size="small"
        rowKey={(p) => `${p.year}-${p.instalment}`}
        dataSource={[...shown].reverse()}
        pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 1000 }}
        columns={[
          {
            key: 'p',
            title: 'Period',
            render: (_, p) => (
              <>
                <div>{p.label}</div>
                <Typography.Text type="secondary" style={small} translate="no">
                  {`${formatDate(p.from)} to ${formatDate(p.to)}`}
                </Typography.Text>
              </>
            ),
          },
          { key: 'a', title: 'Instalment', width: 130, align: 'right', render: (_, p) => <span translate="no">{formatINR(p.amount)}</span> },
          { key: 's', title: 'Staff short', width: 120, align: 'right', render: (_, p) => <span translate="no">{Number(p.staffDeduction) ? `− ${formatINR(p.staffDeduction)}` : '-'}</span> },
          { key: 'pen', title: 'Penalties', width: 120, align: 'right', render: (_, p) => <span translate="no">{Number(p.penalty) ? `− ${formatINR(p.penalty)}` : '-'}</span> },
          { key: 'n', title: 'Net', width: 130, align: 'right', render: (_, p) => <Typography.Text strong translate="no">{formatINR(p.net)}</Typography.Text> },
          { key: 'st', title: 'Status', width: 120, render: (_, p) => <AppTag color={PERIOD_COLORS[p.status]}>{PERIOD_LABELS[p.status]}</AppTag> },
          {
            key: 'bill',
            title: 'Bill',
            width: 200,
            render: (_, p) =>
              p.billId ? (
                <Flex vertical gap={0}>
                  <Link href={recordPage('BILL', p.billId) ?? `/bills/${p.billId}`} translate="no">
                    {p.billLabel}
                  </Link>
                  <Typography.Text type="secondary" style={small}>
                    {p.billState}
                  </Typography.Text>
                </Flex>
              ) : p === firstDue && data.canBill ? (
                <Button size="small" loading={prepare.isPending} onClick={() => prepare.mutate(p)}>
                  Prepare bill
                </Button>
              ) : (
                '-'
              ),
          },
        ]}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Staff

function Staff({ data, onRecord }: { data: OmDto; onRecord: () => void }) {
  const m = data.months.find((x) => x.month === data.month);
  const rows = m?.staff ?? data.contract!.staff.map((s) => ({ role: s.role, required: s.required, deployed: null, short: 0, deduction: '0.00' }));
  return (
    <Section
      title={`Staff in ${formatMonth(data.month)}`}
      extra={
        data.canRecordStaff ? (
          <Button type="primary" icon={<EditOutlined />} onClick={onRecord}>
            Record staff
          </Button>
        ) : null
      }
    >
      {m && !m.staffRecorded ? (
        <p>
          <Typography.Text type="warning">Staff deployed this month are not recorded yet, so nothing is deducted for them.</Typography.Text>
        </p>
      ) : null}
      <Table
        size="small"
        rowKey="role"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 600 }}
        locale={{ emptyText: 'The contract sets no minimum staff' }}
        columns={[
          { key: 'r', title: 'Role', dataIndex: 'role' },
          { key: 'q', title: 'Minimum', width: 100, align: 'right', render: (_, r) => <span translate="no">{r.required}</span> },
          { key: 'd', title: 'Deployed', width: 100, align: 'right', render: (_, r) => (r.deployed === null ? '-' : <span translate="no">{r.deployed}</span>) },
          { key: 's', title: 'Short', width: 90, align: 'right', render: (_, r) => (r.short ? <AppTag tone="danger">{r.short}</AppTag> : '0') },
          { key: 'x', title: 'Deducted', width: 130, align: 'right', render: (_, r) => <span translate="no">{formatINR(r.deduction)}</span> },
        ]}
      />
    </Section>
  );
}

interface StaffValues {
  month: dayjs.Dayjs;
  rows: { role: string; required: number; deployed: number | null }[];
}

function StaffForm({ data, open, onClose }: { data: OmDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<StaffValues>();
  const { message } = App.useApp();
  const c = data.contract!;
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    const m = data.months.find((x) => x.month === data.month);
    form.setFieldsValue({
      month: dayjs(`${data.month}-01`),
      rows: c.staff.map((s) => ({ role: s.role, required: s.required, deployed: m?.staff.find((l) => l.role === s.role)?.deployed ?? s.required })),
    });
  }, [open, form, c.staff, data.months, data.month]);
  const save = useOmSave<StaffValues>(data.projectId, async (v) =>
    (await api.put<OmDto>(`/projects/${data.projectId}/om/staff`, { month: v.month.format('YYYY-MM'), rows: v.rows.map((r) => ({ role: r.role, deployed: r.deployed ?? 0 })) })).data,
  );
  return (
    <FormShell<StaffValues>
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={620}
      projectDefault={false}
      title="Record staff deployed"
      okText="Save staff"
      onSubmit={async (v) => {
        await save.mutateAsync(v);
        message.success(`Staff for ${formatMonth(v.month.format('YYYY-MM'))} saved`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="month" label="Month" rules={[{ required: true, message: 'Choose the month' }]}>
          <DatePicker picker="month" format="MMM YYYY" disabled disabledDate={(x) => x.isAfter(dayjs(data.today), 'month')} />
        </Form.Item>
        <LineTable
          name="rows"
          label="Role"
          locked
          columns={[
            { key: 'role', title: 'Role', render: (f) => <Form.Item noStyle shouldUpdate>{() => form.getFieldValue(['rows', f.name, 'role'])}</Form.Item> },
            { key: 'req', title: 'Minimum', width: 100, align: 'right', render: (f) => <Form.Item noStyle shouldUpdate>{() => <span translate="no">{form.getFieldValue(['rows', f.name, 'required'])}</span>}</Form.Item> },
            {
              key: 'dep',
              title: 'Deployed',
              width: 140,
              render: (f) => (
                <Form.Item name={[f.name, 'deployed']} noStyle rules={[{ required: true, message: 'Give the number deployed' }]}>
                  <InputNumber min={0} max={500} precision={0} aria-label="Deployed" style={{ width: '100%' }} />
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Chemicals

function Chemicals({ data }: { data: OmDto }) {
  return (
    <Section title={`Treatment chemicals in ${formatMonth(data.month)}`} extra={<Typography.Text type="secondary">Issued less returned, against the norm × water produced</Typography.Text>}>
      <Table<OmChemicalRowDto>
        size="small"
        rowKey="itemId"
        pagination={false}
        dataSource={data.chemicals}
        scroll={{ x: 820 }}
        locale={{ emptyText: 'The contract sets no chemical norms' }}
        columns={[
          { key: 'i', title: 'Chemical', render: (_, r) => r.itemName },
          { key: 'n', title: 'Norm per ML', width: 130, align: 'right', render: (_, r) => <span translate="no">{`${formatQty(r.perMl)} ${r.unit}`}</span> },
          { key: 'w', title: 'Water produced', width: 140, align: 'right', render: (_, r) => <span translate="no">{`${formatQty(r.producedMl)} ML`}</span> },
          { key: 'q', title: 'Norm', width: 120, align: 'right', render: (_, r) => <span translate="no">{`${formatQty(r.normQty)} ${r.unit}`}</span> },
          { key: 'c', title: 'Used', width: 120, align: 'right', render: (_, r) => <span translate="no">{`${formatQty(r.consumedQty)} ${r.unit}`}</span> },
          {
            key: 's',
            title: 'Against the norm',
            width: 190,
            render: (_, r) => <AppTag color={CHEMICAL_COLORS[r.status]}>{r.variancePct === null ? CHEMICAL_LABELS[r.status] : `${CHEMICAL_LABELS[r.status]} (${r.variancePct > 0 ? '+' : ''}${formatPct(r.variancePct)})`}</AppTag>,
          },
        ]}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Terms

function Terms({ data, onEdit }: { data: OmDto; onEdit: () => void }) {
  const c = data.contract!;
  return (
    <>
      <Section
        title="Payment"
        extra={
          data.canManage ? (
            <Button icon={<EditOutlined />} onClick={onEdit}>
              Change terms
            </Button>
          ) : null
        }
      >
        <Table
          size="small"
          rowKey="year"
          pagination={false}
          scroll={{ x: 520 }}
          dataSource={c.yearPcts.map((pct, i) => ({ year: i + 1, pct }))}
          columns={[
            { key: 'y', title: 'Year', render: (_, r) => <span translate="no">{`Year ${r.year}`}</span> },
            { key: 'p', title: '% of the contract', width: 150, align: 'right', render: (_, r) => <span translate="no">{formatPct(r.pct, { digits: 2 })}</span> },
            { key: 'a', title: 'A year', width: 160, align: 'right', render: (_, r) => <span translate="no">{c.contractValue ? formatINR((Number(c.contractValue) * Number(r.pct)) / 100) : '-'}</span> },
            { key: 'i', title: 'Each instalment', width: 160, align: 'right', render: (_, r) => <span translate="no">{c.contractValue ? formatINR((Number(c.contractValue) * Number(r.pct)) / 100 / c.instalmentsPerYear) : '-'}</span> },
          ]}
        />
      </Section>
      <Section title="Service level benchmarks">
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          scroll={{ x: 640 }}
          dataSource={c.benchmarks}
          columns={[
            { key: 'b', title: 'Benchmark', render: (_, b) => OM_BENCHMARK_INFO[b.key as OmBenchmark].label },
            { key: 'l', title: 'Must be', width: 160, render: (_, b) => omRuleText(b.key, b.limit) },
            { key: 'a', title: 'Failures allowed a month', width: 190, align: 'right', render: (_, b) => (OM_BENCHMARK_INFO[b.key as OmBenchmark].basis === 'DAY' ? b.allowedPerMonth : 'Judged monthly') },
            { key: 'p', title: 'Penalty each', width: 130, align: 'right', render: (_, b) => <span translate="no">{formatINR(b.penalty)}</span> },
          ]}
        />
      </Section>
      {c.note ? <Typography.Paragraph>{c.note}</Typography.Paragraph> : null}
    </>
  );
}

interface TermsValues {
  startOn: dayjs.Dayjs;
  years: number;
  yearPcts: (number | null)[];
  instalmentsPerYear: number;
  extensionYears?: number | null;
  population: number;
  benchmarks: { key: OmBenchmark; limit: number; allowedPerMonth: number; penalty: number }[];
  staff: { role: string; required: number; monthlyPay: number }[];
  chemicals: { itemId: string; itemName?: string; perMl: number }[];
  note?: string | null;
}

function TermsForm({ project, data, open, onClose }: { project: ProjectDetail; data: OmDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<TermsValues>();
  const { message } = App.useApp();
  const years = Form.useWatch('years', form) ?? 0;
  const c = data.contract;
  const billed = data.periods.some((p) => p.billId);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      c
        ? {
            startOn: dayjs(c.startOn),
            years: c.years,
            yearPcts: c.yearPcts.map(Number),
            instalmentsPerYear: c.instalmentsPerYear,
            extensionYears: c.extensionYears,
            population: c.population,
            benchmarks: c.benchmarks.map((b) => ({ key: b.key, limit: Number(b.limit), allowedPerMonth: b.allowedPerMonth, penalty: Number(b.penalty) })),
            staff: c.staff.map((s) => ({ role: s.role, required: s.required, monthlyPay: Number(s.monthlyPay) })),
            chemicals: c.chemicals.map((x) => ({ itemId: x.itemId, itemName: `${x.itemName} (${x.unit})`, perMl: Number(x.perMl) })),
            note: c.note,
          }
        : {
            startOn: data.handedOverOn ? dayjs(data.handedOverOn).add(1, 'month').startOf('month') : undefined,
            years: 5,
            yearPcts: [3, 3.25, 3.5, 3.75, 4],
            instalmentsPerYear: 4,
            extensionYears: 0,
            benchmarks: DEFAULT_OM_BENCHMARKS.map((b) => ({ key: b.key, limit: Number(b.limit), allowedPerMonth: b.allowedPerMonth, penalty: Number(b.penalty) })),
            staff: [],
            chemicals: [],
          },
    );
  }, [open, form, c, data.handedOverOn]);
  const save = useOmSave<TermsValues>(data.projectId, async (v) =>
    (
      await api.put<OmDto>(`/projects/${data.projectId}/om/contract`, {
        startOn: v.startOn.startOf('month').format('YYYY-MM-DD'),
        years: v.years,
        yearPcts: v.yearPcts.slice(0, v.years).map((p) => String(p ?? 0)),
        instalmentsPerYear: v.instalmentsPerYear,
        extensionYears: v.extensionYears ?? 0,
        population: v.population,
        benchmarks: v.benchmarks.map((b) => ({ key: b.key, limit: String(b.limit), allowedPerMonth: b.allowedPerMonth ?? 0, penalty: String(b.penalty ?? 0) })),
        staff: (v.staff ?? []).map((s) => ({ role: s.role, required: s.required, monthlyPay: String(s.monthlyPay ?? 0) })),
        chemicals: (v.chemicals ?? []).map((x) => ({ itemId: x.itemId, perMl: String(x.perMl) })),
        note: v.note?.trim() || null,
      })
    ).data,
  );
  return (
    <FormShell<TermsValues>
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      projectDefault={false}
      title={c ? 'Change O&M terms' : `O&M terms for ${project.code}`}
      okText="Save terms"
      onSubmit={async (v) => {
        await save.mutateAsync(v);
        message.success('O&M terms saved');
      }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormSection title="Period and payment">
          <FormGrid cols={3}>
            <Form.Item name="startOn" label="O&M starts" rules={[{ required: true, message: 'Choose the month O&M starts' }]} extra={billed ? 'Fixed once a period is billed' : 'The first of the month after completion'}>
              <DatePicker picker="month" format="MMM YYYY" style={{ width: '100%' }} disabled={billed} disabledDate={(x) => !!data.handedOverOn && !x.isAfter(dayjs(data.handedOverOn), 'month')} />
            </Form.Item>
            <Form.Item name="years" label="Years" rules={[{ required: true, message: 'Give the O&M years' }]}>
              <InputNumber min={1} max={15} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="instalmentsPerYear" label="Instalments a year" rules={[{ required: true, message: 'Choose the instalments a year' }]}>
              <Select
                disabled={billed}
                options={[
                  { value: 1, label: 'Once a year' },
                  { value: 2, label: 'Half-yearly (2)' },
                  { value: 4, label: 'Quarterly (4)' },
                  { value: 6, label: 'Every two months (6)' },
                  { value: 12, label: 'Monthly (12)' },
                ]}
              />
            </Form.Item>
            <Form.Item name="population" label="Population served" rules={[{ required: true, message: 'Give the population the scheme serves' }]}>
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="extensionYears" label="Extension years">
              <InputNumber min={0} max={10} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <Typography.Text strong>% of the contract value each year</Typography.Text>
          <FormGrid cols={4}>
            {Array.from({ length: Math.min(Math.max(years, 0), 15) }, (_, i) => (
              <Form.Item key={i} name={['yearPcts', i]} label={`Year ${i + 1}`} rules={[{ required: true, message: `Give year ${i + 1}’s %` }]}>
                <QuantityInput unit="%" style={{ width: '100%' }} />
              </Form.Item>
            ))}
          </FormGrid>
        </FormSection>
        <FormSection title="Service level benchmarks">
          <LineTable
            name="benchmarks"
            label="Benchmark"
            locked
            columns={[
              { key: 'k', title: 'Benchmark', render: (f) => <Form.Item noStyle shouldUpdate>{() => OM_BENCHMARK_INFO[form.getFieldValue(['benchmarks', f.name, 'key']) as OmBenchmark]?.label}</Form.Item> },
              {
                key: 'l',
                title: 'Limit',
                width: 150,
                render: (f) => (
                  <Form.Item noStyle shouldUpdate>
                    {() => (
                      <Form.Item name={[f.name, 'limit']} noStyle rules={[{ required: true, message: 'Give the limit' }]}>
                        <QuantityInput unit={OM_BENCHMARK_INFO[form.getFieldValue(['benchmarks', f.name, 'key']) as OmBenchmark]?.unit} aria-label="Limit" style={{ width: '100%' }} />
                      </Form.Item>
                    )}
                  </Form.Item>
                ),
              },
              {
                key: 'a',
                title: 'Allowed a month',
                width: 130,
                render: (f) => (
                  <Form.Item name={[f.name, 'allowedPerMonth']} noStyle>
                    <InputNumber min={0} max={31} precision={0} aria-label="Failures allowed a month" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
              {
                key: 'p',
                title: 'Penalty each',
                width: 160,
                render: (f) => (
                  <Form.Item name={[f.name, 'penalty']} noStyle>
                    <MoneyInput aria-label="Penalty for each failure" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        <FormSection title="Minimum staff">
          <LineTable
            name="staff"
            label="Role"
            addText="Add role"
            newLine={() => ({ role: '', required: 1, monthlyPay: null })}
            columns={[
              {
                key: 'r',
                title: 'Role',
                render: (f) => (
                  <Form.Item name={[f.name, 'role']} noStyle rules={[{ required: true, whitespace: true, message: 'Name the role' }]}>
                    <Input aria-label="Role" maxLength={60} placeholder="Pump operator" />
                  </Form.Item>
                ),
              },
              {
                key: 'q',
                title: 'Minimum',
                width: 110,
                render: (f) => (
                  <Form.Item name={[f.name, 'required']} noStyle rules={[{ required: true, message: 'Give the minimum' }]}>
                    <InputNumber min={1} max={200} precision={0} aria-label="Minimum" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
              {
                key: 'p',
                title: 'Monthly pay',
                width: 160,
                render: (f) => (
                  <Form.Item name={[f.name, 'monthlyPay']} noStyle rules={[{ required: true, message: 'Give the monthly pay deducted for each person short' }]}>
                    <MoneyInput aria-label="Monthly pay" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        <FormSection title="Treatment chemicals">
          <LineTable
            name="chemicals"
            label="Chemical"
            addText="Add chemical"
            newLine={() => ({ itemId: undefined, perMl: null })}
            columns={[
              {
                key: 'i',
                title: 'Item',
                render: (f) => (
                  <Form.Item noStyle shouldUpdate>
                    {() => {
                      const row = form.getFieldValue(['chemicals', f.name]) as TermsValues['chemicals'][number] | undefined;
                      return (
                        <Form.Item name={[f.name, 'itemId']} noStyle rules={[{ required: true, message: 'Choose the chemical from the item master' }]}>
                          <ItemSelect
                            aria-label="Chemical"
                            style={{ width: '100%' }}
                            selected={row?.itemId && row.itemName ? { value: row.itemId, label: row.itemName } : null}
                            onPick={(i: ItemDto) => form.setFieldValue(['chemicals', f.name, 'itemName'], `${i.name} (${i.unit})`)}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                ),
              },
              {
                key: 'n',
                title: 'Per ML treated',
                width: 160,
                render: (f) => (
                  <Form.Item name={[f.name, 'perMl']} noStyle rules={[{ required: true, message: 'Give the norm per ML' }]}>
                    <QuantityInput aria-label="Quantity per ML treated" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
