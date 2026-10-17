'use client';

import React, { useState } from 'react';
import { Alert, Button, Card, Col, Empty, Progress, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { BudgetBoqItemDto, BudgetHeadDto } from '@erp/shared';
import { COST_HEAD_LABELS, canSetBudget } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProjectBudget } from '@/lib/queries';
import { formatDateTime, formatINR, formatQty, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { HEAD_COLORS } from './CostBar';
import { BudgetFormModal } from './BudgetFormModal';
import { CashFlowPanel } from './CashFlowPanel';
import { themeColor } from '@/lib/theme';

const RED = themeColor('colorErrorText');
const GREEN = themeColor('colorSuccessText');
const money = (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono">{formatINR(v)}</span>);
const variance = (v: string | null) =>
  v === null ? <span className="text-muted">-</span> : <span className="mono" style={{ color: toNumber(v) < 0 ? RED : GREEN }}>{formatINR(v)}</span>;

/** A project's budget against actual cost, the forecast to complete, and its cash-flow forecast. */
export function ProjectBudgetPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error, refetch } = useProjectBudget(projectId);
  const canEdit = !!user && canSetBudget(user.roleKey);
  const differs =
    data?.hasHeadBudget && data.boqBudget !== null && data.budgetAtCompletion !== null && Math.abs(toNumber(data.boqBudget) - toNumber(data.budgetAtCompletion)) > 0.01 * toNumber(data.budgetAtCompletion);

  return (
    <div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {data.updatedAt ? `Budget last set by ${data.updatedByName} on ${formatDateTime(data.updatedAt)}` : data.boqBudget ? 'Budget from BOQ budget rates' : 'No budget yet'}
            </Typography.Text>
            {canEdit && (
              <Button type={data.budgetAtCompletion ? 'default' : 'primary'} icon={<EditOutlined />} onClick={() => setEditing(true)} style={{ marginLeft: 'auto' }}>
                {data.budgetAtCompletion ? 'Edit budget' : 'Set budget'}
              </Button>
            )}
          </div>
          {!data.budgetAtCompletion && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title="This project has no budget yet"
              description={`Set a budget by cost head, or a budget rate on the BOQ items, to see budget against actual and the forecast to complete.${canEdit ? '' : ' Admin, management or the project manager can set it.'}`}
            />
          )}
          {differs ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title={`The cost-head budget (${formatINR(data.budgetAtCompletion)}) and the BOQ budget (${formatINR(data.boqBudget)}) differ`}
              description="The cost-head budget is used for the forecast. Bring them in line, or remove the cost-head budget to forecast from the BOQ."
            />
          ) : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Budget at completion" value={data.budgetAtCompletion ? formatINR(data.budgetAtCompletion) : '-'} styles={{ content: { fontSize: 18 } }} />
            </Col>
            <Col xs={12} md={8} lg={4}>
              <div className="text-muted" style={{ fontSize: 14, marginBottom: 4 }}>
                Work done
              </div>
              <Progress percent={data.pctComplete} size="small" aria-label={`Work done ${data.pctComplete}%`} />
              <div className="text-muted" style={{ fontSize: 12 }}>
                {formatINR(data.executedValue)} of {formatINR(data.boqValue)} BOQ
              </div>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Actual cost" value={formatINR(data.actualCost)} styles={{ content: { fontSize: 18 } }} />
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic
                title="Cost variance"
                value={data.costVariance ? formatINR(data.costVariance) : '-'}
                styles={{ content: { fontSize: 18, color: data.costVariance ? (toNumber(data.costVariance) < 0 ? RED : GREEN) : undefined } }}
              />
              {data.costVariance ? (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {toNumber(data.costVariance) < 0 ? 'Over' : 'Under'} the budget for the work done
                </div>
              ) : null}
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Forecast at completion" value={data.forecastAtCompletion ? formatINR(data.forecastAtCompletion) : '-'} styles={{ content: { fontSize: 18 } }} />
              {data.forecastToComplete ? (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {formatINR(data.forecastToComplete)} still to spend
                </div>
              ) : null}
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic
                title="Forecast margin"
                value={data.forecastMargin ? formatINR(data.forecastMargin) : '-'}
                styles={{ content: { fontSize: 18, color: data.forecastMargin ? (toNumber(data.forecastMargin) < 0 ? RED : GREEN) : undefined } }}
              />
              {data.revisedContractValue ? (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  On a revised contract of {formatINR(data.revisedContractValue)}
                </div>
              ) : null}
            </Col>
          </Row>

          <Card size="small" style={{ marginTop: 16 }} title="By cost head">
            {data.hasHeadBudget ? (
              <Table<BudgetHeadDto>
                rowKey="head"
                size="small"
                pagination={false}
                dataSource={data.heads}
                scroll={{ x: 860 }}
                columns={[
                  { title: 'Head', dataIndex: 'head', render: (h: BudgetHeadDto['head']) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: HEAD_COLORS[h], display: 'inline-block' }} />
                        {COST_HEAD_LABELS[h]}
                      </span>
                    ) },
                  { title: 'Budget', dataIndex: 'budget', width: 140, align: 'right', render: money },
                  { title: 'Actual', dataIndex: 'actual', width: 140, align: 'right', render: money },
                  {
                    title: 'Used',
                    key: 'used',
                    width: 150,
                    render: (_, r) => {
                      const pct = toNumber(r.budget) > 0 ? Math.round((toNumber(r.actual) / toNumber(r.budget)) * 1000) / 10 : 0;
                      return <Progress percent={Math.min(pct, 100)} format={() => `${pct}%`} size="small" status={pct > data.pctComplete + 10 ? 'exception' : 'normal'} aria-label={`${pct}% of budget used`} />;
                    },
                  },
                  { title: 'Earned', dataIndex: 'earned', width: 140, align: 'right', render: money },
                  { title: 'Variance', dataIndex: 'variance', width: 140, align: 'right', render: variance },
                  { title: 'Forecast', dataIndex: 'forecast', width: 140, align: 'right', render: money },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No budget by cost head" />
            )}
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Work done is approved progress at BOQ rates over the BOQ value. Earned is the budget for the work done (budget × work done); variance is
              earned less actual, red when over budget. Forecast is the actual cost so far plus the budget for the work left. Actual cost is the cost view&apos;s,
              from the start of the project.
            </Typography.Paragraph>
          </Card>

          <Card
            size="small"
            style={{ marginTop: 16 }}
            title="BOQ budget"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {data.boqBudget ? `${formatINR(data.boqBudget)}` : 'No budget rates'}
                {data.itemsWithoutBudgetRate ? ` · ${data.itemsWithoutBudgetRate} item${data.itemsWithoutBudgetRate === 1 ? '' : 's'} without a budget rate` : ''}
              </Typography.Text>
            }
          >
            <Table<BudgetBoqItemDto>
              rowKey="boqItemId"
              size="small"
              pagination={false}
              dataSource={data.boqItems}
              scroll={{ x: 1120 }}
              columns={[
                { title: 'Item', dataIndex: 'itemNo', width: 70, className: 'mono' },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Qty', dataIndex: 'qty', width: 130, align: 'right', render: (v, r) => <span className="mono">{`${formatQty(v)} ${r.unit}`}</span> },
                { title: 'Rate', dataIndex: 'rate', width: 140, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
                { title: 'Budget rate', dataIndex: 'budgetRate', width: 140, align: 'right', render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono">{formatINR(v, true)}</span>) },
                {
                  title: 'Planned margin',
                  dataIndex: 'plannedMarginPct',
                  width: 120,
                  align: 'right',
                  render: (v: number | null) => (v === null ? <span className="text-muted">-</span> : <span style={{ color: v < 0 ? RED : undefined }}>{v}%</span>),
                },
                { title: 'Budget', dataIndex: 'budgetAmount', width: 130, align: 'right', render: money },
                { title: 'Done', dataIndex: 'executedQty', width: 120, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
                { title: 'Earned', dataIndex: 'earnedBudget', width: 130, align: 'right', render: money },
              ]}
            />
          </Card>

          {data.notes ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              <strong>Notes:</strong> {data.notes}
            </Typography.Paragraph>
          ) : null}

          <Card size="small" style={{ marginTop: 16 }} title="Cash-flow forecast">
            <CashFlowPanel projectId={projectId} />
          </Card>
          {canEdit && <BudgetFormModal open={editing} onClose={() => setEditing(false)} budget={data} />}
        </>
      )}
    </div>
  );
}
