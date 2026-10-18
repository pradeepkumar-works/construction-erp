'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Col, Empty, Row, Skeleton, Statistic, Table, Tabs, Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { ProjectCostDto } from '@erp/shared';
import { COST_HEADS, COST_HEAD_LABELS, EQUIPMENT_RATE_UNIT_LABELS, EXPENSE_CATEGORY_LABELS } from '@erp/shared';
import { useProjectCost } from '@/lib/queries';
import { formatINR, formatQty, toNumber, formatMonth, inSentence } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { CostBar, CostLegend, HEAD_COLORS } from './CostBar';
import { DEFAULT_PERIOD, PeriodPicker, periodLabel, periodParams, type PeriodState } from './PeriodPicker';
import { LabourRatesModal } from './LabourRatesModal';
import { unpricedText } from './UnpricedNote';
import { themeColor, themeFontSize } from '@/lib/theme';
import { Section, SectionStack } from '@/components/common/Section';

const money = (v: string) => <span className="mono" translate="no">{formatINR(v)}</span>;
const rateOrDash = (v: string | null, suffix: string) => (v === null ? <span style={{ color: themeColor('gold7') }}>no rate</span> : <span className="mono" translate="no">{`${formatINR(v, true)} ${suffix}`}</span>);

/** One project's cost heads, month by month, and what makes them up. */
export function ProjectCostPanel({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [ratesOpen, setRatesOpen] = useState(false);
  const { data, isLoading, error, refetch } = useProjectCost(projectId, periodParams(period));
  const missing = data ? unpricedText(data.unpriced) : [];
  const monthScale = data ? Math.max(1, ...data.months.map((m) => Math.max(toNumber(m.total), toNumber(m.executedValue)))) : 1;

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Button icon={<TeamOutlined />} onClick={() => setRatesOpen(true)} style={{ marginLeft: 'auto' }}>
          Labour rates
        </Button>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {missing.length ? <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Part of the cost is not counted because a rate is missing" description={missing.join('; ') + '. Set rates in the item master, the equipment master or Labour rates.'} /> : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Executed value" value={formatINR(data.executedValue)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Measured (approved MB)" value={formatINR(data.measuredValue)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Cost" value={formatINR(data.cost.total)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={`Margin${data.costPct !== null ? ` (cost ${data.costPct}% of executed)` : ''}`}
                value={formatINR(data.margin)}
                styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: toNumber(data.margin) < 0 ? themeColor('colorErrorText') : themeColor('colorSuccessText') } }}
              />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={12} md={6}>
              <Statistic title="Billed (approved RA bills)" value={formatINR(data.billedValue)} styles={{ content: { fontSize: themeFontSize('fontSizeLG') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Cash in from the client" value={formatINR(data.cashIn)} styles={{ content: { fontSize: themeFontSize('fontSizeLG') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Vendor and subcontractor bills (incl. GST)" value={formatINR(data.payableBilled)} styles={{ content: { fontSize: themeFontSize('fontSizeLG') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Cash out to them" value={formatINR(data.cashOut)} styles={{ content: { fontSize: themeFontSize('fontSizeLG') } }} />
            </Col>
          </Row>
          <Section style={{ marginTop: 16 }} title="Cost heads" extra={<CostLegend />}>
            <CostBar cost={data.cost} scale={toNumber(data.cost.total)} height={18} />
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginTop: 12 }}>
              {COST_HEADS.map((h) => (
                <Statistic key={h} title={<span style={{ color: HEAD_COLORS[h] }}>{COST_HEAD_LABELS[h]}</span>} value={formatINR(data.cost[h])} styles={{ content: { fontSize: themeFontSize('fontSizeLG') } }} />
              ))}
            </div>
          </Section>
          <Section style={{ marginTop: 16 }} title="By month" extra={<Typography.Text type="secondary">{periodLabel(period)}</Typography.Text>}>
            {data.months.length ? (
              <Table<ProjectCostDto['months'][number]>
                rowKey="month"
                size="small"
                pagination={false}
                dataSource={data.months}
                scroll={{ x: 760 }}
                columns={[
                  { title: 'Month', dataIndex: 'month', width: 100, render: (v) => formatMonth(v) },
                  { title: 'Executed value', dataIndex: 'executedValue', width: 140, align: 'right', render: money },
                  { title: 'Cost', dataIndex: 'total', width: 130, align: 'right', render: money },
                  {
                    title: '',
                    key: 'bars',
                    render: (_, m) => (
                      <div style={{ display: 'grid', gap: 3 }}>
                        <div style={{ height: 8, width: `${(toNumber(m.executedValue) / monthScale) * 100}%`, background: themeColor('colorSuccess'), borderRadius: 2, minWidth: toNumber(m.executedValue) > 0 ? 2 : 0 }} />
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
          <Section style={{ marginTop: 16 }}>
            <Tabs
              items={[
                {
                  key: 'expenses',
                  label: `Site expenses (${data.expensesByCategory.length})`,
                  children: (
                    <Table
                      rowKey="category"
                      size="small"
                      pagination={false}
                      dataSource={data.expensesByCategory}
                      columns={[
                        { title: 'Category', dataIndex: 'category', render: (c: keyof typeof EXPENSE_CATEGORY_LABELS) => EXPENSE_CATEGORY_LABELS[c] },
                        { title: 'Bills', dataIndex: 'count', width: 80, align: 'right' },
                        { title: 'Amount (incl. GST)', dataIndex: 'amount', width: 160, align: 'right', render: money },
                      ]}
                    />
                  ),
                },
                {
                  key: 'material',
                  label: `Material issued (${data.materialByItem.length})`,
                  children: (
                    <Table
                      rowKey="itemId"
                      size="small"
                      pagination={false}
                      dataSource={data.materialByItem}
                      scroll={{ x: 640 }}
                      columns={[
                        { title: 'Item', dataIndex: 'name' },
                        { title: 'Issued', dataIndex: 'quantity', width: 130, align: 'right', render: (v, r) => <span className="mono" translate="no">{`${formatQty(v)} ${r.unit}`}</span> },
                        { title: 'Rate', dataIndex: 'rate', width: 170, align: 'right', render: (v, r) => rateOrDash(v, `/ ${r.unit}`) },
                        { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: money },
                      ]}
                    />
                  ),
                },
                {
                  key: 'machinery',
                  label: `Machinery (${data.machineryByEquipment.length})`,
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
                        { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: money },
                      ]}
                    />
                  ),
                },
                {
                  key: 'labour',
                  label: `Labour (${data.labourByTrade.length})`,
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
                        { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: money },
                      ]}
                    />
                  ),
                },
                {
                  key: 'subcontract',
                  label: `Subcontractors (${data.subcontractByOrder.length})`,
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
                        { title: 'Work value', dataIndex: 'amount', width: 140, align: 'right', render: money },
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
