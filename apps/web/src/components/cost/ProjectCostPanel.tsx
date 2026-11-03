'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Col, Empty, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTabs } from '@/components/common/AppTabs';
import { TeamOutlined } from '@/components/common/icons';
import type { CostExpenseCategory, ProjectCostDto } from '@erp/shared';
import { COST_HEADS, EQUIPMENT_RATE_UNIT_LABELS, COST_EXPENSE_LABELS, unitLabel } from '@erp/shared';
import { useProjectCost } from '@/lib/queries';
import { formatDate, formatINR, formatPct, formatQty, toNumber, formatMonth, inSentence } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { CostBar, CostHeadTitle, CostLegend } from './CostBar';
import { defaultPeriod, PeriodPicker, periodLabel, periodParams, type PeriodState } from './PeriodPicker';
import { LabourRatesModal } from './LabourRatesModal';
import { unpricedText } from './UnpricedNote';
import { Section, SectionStack } from '@/components/common/Section';
import { Money } from '@/components/common/Money';

const rateOrDash = (v: string | null, suffix: string) => (v === null ? <span style={{ color: tk.color.tone.pending.fg }}>No rate</span> : <span className="mono" translate="no">{`${formatINR(v, true)} ${suffix}`}</span>);

/** One project's cost heads, month by month, and what makes them up. */
export function ProjectCostPanel({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod);
  const [ratesOpen, setRatesOpen] = useState(false);
  const { data, isLoading, error, refetch } = useProjectCost(projectId, periodParams(period));
  const missing = data ? unpricedText(data.unpriced) : [];
  const monthScale = data ? Math.max(1, ...data.months.map((m) => Math.max(toNumber(m.total), toNumber(m.executedValue)))) : 1;

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: tk.space[3], flexWrap: 'wrap', alignItems: 'center', marginBottom: tk.space[3] }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Button icon={<TeamOutlined />} onClick={() => setRatesOpen(true)} style={{ marginLeft: 'auto' }}>
          Labour rates
        </Button>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {missing.length ? <Alert type="warning" showIcon style={{ marginBottom: tk.space[3] }} title="Part of the cost is not counted because a rate is missing" description={missing.join('; ') + '. Set rates in the item master, the equipment master or Labour rates.'} /> : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Work done" value={formatINR(data.executedValue)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Measured (approved MB)" value={formatINR(data.measuredValue)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Cost" value={formatINR(data.cost.total)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={`Margin${data.costPct !== null ? ` (cost ${formatPct(data.costPct)} of work done)` : ''}`}
                value={formatINR(data.margin)}
                styles={{ content: { fontSize: tk.type.subhead.fontSize, color: toNumber(data.margin) < 0 ? tk.color.tone.danger.fg : tk.color.tone.success.fg } }}
              />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginTop: tk.space[2] }}>
            <Col xs={12} md={6}>
              <Statistic title="Billed (approved RA bills)" value={formatINR(data.billedValue)} styles={{ content: { fontSize: tk.type.lead.fontSize } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Money in from the client" value={formatINR(data.cashIn)} styles={{ content: { fontSize: tk.type.lead.fontSize } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Vendor and subcontractor bills (incl. GST)" value={formatINR(data.payableBilled)} styles={{ content: { fontSize: tk.type.lead.fontSize } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Money out to them" value={formatINR(data.cashOut)} styles={{ content: { fontSize: tk.type.lead.fontSize } }} />
            </Col>
          </Row>
          <Section style={{ marginTop: tk.space[4] }} title="Cost heads" extra={<CostLegend />}>
            <CostBar cost={data.cost} scale={toNumber(data.cost.total)} height={18} />
            {data.opening ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: tk.space[2], marginBottom: 0 }}>
                Includes the opening cost of <Money value={data.opening.cost.total} />, what the project had spent by {formatDate(data.opening.asOf)} when it came on Nirmaan
                {data.opening.workDone ? (
                  <>
                    ; work done includes the <Money value={data.opening.workDone} /> done by then
                  </>
                ) : null}
                .
              </Typography.Paragraph>
            ) : null}
            <div style={{ display: 'flex', gap: tk.space[8], flexWrap: 'wrap', marginTop: tk.space[3] }}>
              {COST_HEADS.map((h) => (
                <Statistic key={h} title={<CostHeadTitle head={h} />} value={formatINR(data.cost[h])} styles={{ content: { fontSize: tk.type.lead.fontSize } }} />
              ))}
            </div>
          </Section>
          <Section style={{ marginTop: tk.space[4] }} title="By month" extra={<Typography.Text type="secondary">{periodLabel(period)}</Typography.Text>}>
            {data.months.length ? (
              <Table<ProjectCostDto['months'][number]>
                rowKey="month"
                size="small"
                pagination={false}
                dataSource={data.months}
                scroll={{ x: 760 }}
                columns={[
                  { title: 'Month', dataIndex: 'month', width: 100, render: (v) => formatMonth(v) },
                  { title: 'Work done', dataIndex: 'executedValue', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                  { title: 'Cost', dataIndex: 'total', width: 130, align: 'right', render: (v) => <Money value={v} /> },
                  {
                    title: '',
                    key: 'bars',
                    render: (_, m) => (
                      <div style={{ display: 'grid', gap: tk.space[1] }}>
                        <div style={{ height: 8, width: `${(toNumber(m.executedValue) / monthScale) * 100}%`, background: tk.color.tone.success.solid, borderRadius: tk.radius.xs, minWidth: toNumber(m.executedValue) > 0 ? 2 : 0 }} />
                        <CostBar cost={m} scale={monthScale} height={8} />
                      </div>
                    ),
                  },
                ]}
              />
            ) : (
              <Empty description="Nothing executed or spent in this period" />
            )}
          </Section>
          <Section style={{ marginTop: tk.space[4] }}>
            <AppTabs
              items={[
                {
                  key: 'expenses',
                  label: 'Site expenses',
                  count: data.expensesByCategory.length,
                  countLabel: 'categories',
                  children: (
                    <Table
                      rowKey="category"
                      size="small"
                      pagination={false}
                      dataSource={data.expensesByCategory}
                      columns={[
                        { title: 'Category', dataIndex: 'category', render: (c: CostExpenseCategory) => COST_EXPENSE_LABELS[c] },
                        { title: 'Bills', dataIndex: 'count', width: 80, align: 'right' },
                        { title: 'Amount (incl. GST)', dataIndex: 'amount', width: 160, align: 'right', render: (v) => <Money value={v} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'material',
                  label: 'Material issued',
                  count: data.materialByItem.length,
                  countLabel: 'items',
                  children: (
                    <Table
                      rowKey="itemId"
                      size="small"
                      pagination={false}
                      dataSource={data.materialByItem}
                      scroll={{ x: 640 }}
                      columns={[
                        { title: 'Item', dataIndex: 'name' },
                        { title: 'Issued', dataIndex: 'quantity', width: 130, align: 'right', render: (v, r) => <span className="mono" translate="no">{`${formatQty(v)} ${unitLabel(r.unit)}`}</span> },
                        { title: 'Rate', dataIndex: 'rate', width: 170, align: 'right', render: (v, r) => rateOrDash(v, `/ ${r.unit}`) },
                        { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'machinery',
                  label: 'Machinery',
                  count: data.machineryByEquipment.length,
                  countLabel: 'machines',
                  children: (
                    <Table
                      rowKey="equipmentId"
                      size="small"
                      pagination={false}
                      dataSource={data.machineryByEquipment}
                      scroll={{ x: 720 }}
                      columns={[
                        { title: 'Machine', dataIndex: 'code', render: (v, r) => <span><span className="mono" translate="no">{v}</span> {r.name}</span> },
                        { title: 'Days', dataIndex: 'days', width: 70, align: 'right' },
                        { title: 'Hours', dataIndex: 'hours', width: 80, align: 'right', render: (v) => formatQty(v) },
                        { title: 'Rate', dataIndex: 'rate', width: 180, align: 'right', render: (v, r) => rateOrDash(v, inSentence(EQUIPMENT_RATE_UNIT_LABELS[r.rateUnit])) },
                        { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'labour',
                  label: 'Labour',
                  count: data.labourByTrade.length,
                  countLabel: 'trades',
                  children: (
                    <Table
                      rowKey="category"
                      size="small"
                      pagination={false}
                      dataSource={data.labourByTrade}
                      columns={[
                        { title: 'Trade', dataIndex: 'category' },
                        { title: 'Man-days', dataIndex: 'manDays', width: 100, align: 'right' },
                        { title: 'Daily rate', dataIndex: 'dailyRate', width: 150, align: 'right', render: (v) => rateOrDash(v, '/ day') },
                        { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'subcontract',
                  label: 'Subcontractors',
                  count: data.subcontractByOrder.length,
                  countLabel: 'work orders',
                  children: (
                    <Table
                      rowKey="workOrderId"
                      size="small"
                      pagination={false}
                      dataSource={data.subcontractByOrder}
                      locale={{ emptyText: 'No approved subcontractor bill in this period' }}
                      columns={[
                        { title: 'Work order', dataIndex: 'woNo', width: 150, render: (v, r) => <Link href={`/work-orders/${r.workOrderId}`} className="mono">{v}</Link> },
                        { title: 'Subcontractor', dataIndex: 'vendorName' },
                        { title: 'Bills', dataIndex: 'bills', width: 80, align: 'right' },
                        { title: 'Work done', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Section>
        </>
      )}
      <LabourRatesModal open={ratesOpen} onClose={() => setRatesOpen(false)} />
    </SectionStack>
  );
}
