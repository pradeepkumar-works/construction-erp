'use client';

import React, { useState } from 'react';
import { Alert, Button, Col, Empty, Progress, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { EditOutlined } from '@/components/common/icons';
import type { BudgetBoqItemDto, BudgetHeadDto } from '@erp/shared';
import { COST_HEAD_LABELS, EAC_METHOD_NOTES, canSetBudget, unitLabel } from '@erp/shared';
import { CostBookedNote } from './EarnedValuePanel';
import { useAuth } from '@/lib/auth';
import { useProjectBudget } from '@/lib/queries';
import { formatINR, formatPct, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { HEAD_COLORS } from './CostBar';
import { BudgetFormModal } from './BudgetFormModal';
import { BudgetHistorySection, OpenVersionSection, inForceLine } from './BudgetVersions';
import { CashFlowPanel } from './CashFlowPanel';
import { OpeningSection } from './OpeningSection';
import { AskButton } from '@/components/ai/AskButton';
import { Section, SectionStack } from '@/components/common/Section';
import { Money } from '@/components/common/Money';

const RED = tk.color.tone.danger.fg;
const GREEN = tk.color.tone.success.fg;
const variance = (v: string | null) =>
  v === null ? <span className="text-muted">{NO_VALUE}</span> : <span className="mono" translate="no" style={{ color: toNumber(v) < 0 ? RED : GREEN }}>{formatINR(v)}</span>;

/**
 * A project's budget against actual cost, the forecast to complete, and its cash-flow forecast. The figures are the
 * approved version's; a revision being prepared or decided shows above them, and every version under History.
 */
export function ProjectBudgetPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error, refetch } = useProjectBudget(projectId);
  const canEdit = !!user && canSetBudget(user.roleKey);
  const differs =
    data?.hasHeadBudget && data.boqBudget !== null && data.budgetAtCompletion !== null && Math.abs(toNumber(data.boqBudget) - toNumber(data.budgetAtCompletion)) > 0.01 * toNumber(data.budgetAtCompletion);

  return (
    <SectionStack gap={0}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <div style={{ display: 'flex', gap: tk.space[3], flexWrap: 'wrap', alignItems: 'center', marginBottom: tk.space[3] }}>
            <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
              {inForceLine(data)}
            </Typography.Text>
            {data.canRevise && (
              <Button type={data.inForce ? 'default' : 'primary'} icon={<EditOutlined />} onClick={() => setEditing(true)} style={{ marginLeft: 'auto' }}>
                {data.versions.length ? 'Revise budget' : 'Set budget'}
              </Button>
            )}
          </div>
          <OpenVersionSection budget={data} onEdit={() => setEditing(true)} />
          {!data.budgetAtCompletion && !data.open && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: tk.space[3] }}
              title="This project has no budget yet"
              description={canEdit ? 'Set a budget by cost head, or a budget rate on the BOQ items' : 'Admin, management or the project manager prepares it'}
            />
          )}
          {differs ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: tk.space[3] }}
              title={`The cost-head budget (${formatINR(data.budgetAtCompletion)}) and the BOQ budget (${formatINR(data.boqBudget)}) differ`}
              description="The cost-head budget is used for the forecast. Bring them in line, or remove the cost-head budget to forecast from the BOQ."
            />
          ) : null}
          <CostBookedNote actual={toNumber(data.actualCost)} earned={data.earnedBudget === null ? null : toNumber(data.earnedBudget)} />
          <Row gutter={[16, 16]}>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Budget at completion" value={data.budgetAtCompletion ? formatINR(data.budgetAtCompletion) : NO_VALUE} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
            </Col>
            <Col xs={12} md={8} lg={4}>
              <div className="text-muted" style={{ fontSize: tk.type.body.fontSize, marginBottom: tk.space[1] }}>
                Work done
              </div>
              <Progress percent={data.pctComplete} size="small" aria-label={`Work done ${data.pctComplete}%`} />
              <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                {formatINR(data.executedValue)} of {formatINR(data.boqValue)} BOQ
              </div>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Actual cost" value={formatINR(data.actualCost)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic
                title="Cost variance"
                value={data.costVariance ? formatINR(data.costVariance) : NO_VALUE}
                styles={{ content: { fontSize: tk.type.subhead.fontSize, color: data.costVariance ? (toNumber(data.costVariance) < 0 ? RED : GREEN) : undefined } }}
              />
              {data.costVariance ? (
                <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                  {toNumber(data.costVariance) < 0 ? 'Over' : 'Under'} the budget for the work done
                </div>
              ) : null}
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Forecast at completion" value={data.forecastAtCompletion ? formatINR(data.forecastAtCompletion) : NO_VALUE} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
              {data.forecastToComplete ? (
                <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                  {formatINR(data.forecastToComplete)} still to spend
                </div>
              ) : null}
              {data.forecastAtCompletion ? (
                <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                  {EAC_METHOD_NOTES.BUDGET}
                </div>
              ) : null}
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Statistic
                title="Forecast margin"
                value={data.forecastMargin ? formatINR(data.forecastMargin) : NO_VALUE}
                styles={{ content: { fontSize: tk.type.subhead.fontSize, color: data.forecastMargin ? (toNumber(data.forecastMargin) < 0 ? RED : GREEN) : undefined } }}
              />
              {data.revisedContractValue ? (
                <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                  On a revised contract of {formatINR(data.revisedContractValue)}
                </div>
              ) : null}
            </Col>
          </Row>

          <OpeningSection projectId={projectId} />

          <Section help={<>Work done is approved progress at BOQ rates over the BOQ value. Earned is the budget for the work done (budget × work done); variance is
              earned less actual, red when over budget. Forecast is the actual cost so far plus the budget for the work left. Actual cost is the cost view&apos;s,
              from the start of the project, with its opening cost where it has one.</>} style={{ marginTop: tk.space[4] }} title="By cost head">
            {data.hasHeadBudget ? (
              <Table<BudgetHeadDto>
                rowKey="head"
                size="small"
                pagination={false}
                dataSource={data.heads}
                scroll={{ x: 860 }}
                columns={[
                  { title: 'Head', dataIndex: 'head', render: (h: BudgetHeadDto['head']) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: tk.space[2] }}>
                        <span style={{ width: 10, height: 10, borderRadius: tk.radius.xs, background: HEAD_COLORS[h], display: 'inline-block' }} />
                        {COST_HEAD_LABELS[h]}
                      </span>
                    ) },
                  { title: 'Budget', dataIndex: 'budget', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                  { title: 'Actual', dataIndex: 'actual', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                  {
                    title: 'Used',
                    key: 'used',
                    width: 150,
                    render: (_, r) => {
                      const pct = toNumber(r.budget) > 0 ? Math.round((toNumber(r.actual) / toNumber(r.budget)) * 1000) / 10 : 0;
                      return <Progress percent={Math.min(pct, 100)} format={() => `${pct}%`} size="small" status={pct > data.pctComplete + 10 ? 'exception' : 'normal'} aria-label={`${pct}% of budget used`} />;
                    },
                  },
                  { title: 'Earned', dataIndex: 'earned', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                  {
                    title: 'Variance',
                    dataIndex: 'variance',
                    width: 140,
                    align: 'right',
                    render: (v: string | null, r) => (
                      <>
                        {variance(v)}
                        {v !== null && toNumber(v) < 0 ? (
                          <div>
                            <AskButton
                              size="small"
                              type="link"
                              style={{ paddingInline: 0 }}
                              label="Explain"
                              aria-label={`Explain why ${COST_HEAD_LABELS[r.head]} is over budget`}
                              question={`Why is ${COST_HEAD_LABELS[r.head].toLowerCase()} over budget on this project? Which purchase orders, bills and expenses drove it?`}
                            />
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                  { title: 'Forecast', dataIndex: 'forecast', width: 140, align: 'right', render: (v) => <Money value={v} /> },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No budget by cost head" />
            )}
          </Section>

          <Section
            style={{ marginTop: tk.space[4] }}
            title="BOQ budget"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
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
                { title: 'Qty', dataIndex: 'qty', width: 130, align: 'right', render: (v, r) => <span className="mono" translate="no">{`${formatQty(v)} ${unitLabel(r.unit)}`}</span> },
                { title: 'Rate', dataIndex: 'rate', width: 140, align: 'right', render: (v) => <Money value={v} paise /> },
                { title: 'Budget rate', dataIndex: 'budgetRate', width: 140, align: 'right', render: (v: string | null) => (v === null ? <span className="text-muted">{NO_VALUE}</span> : <Money value={v} paise />) },
                {
                  title: 'Planned margin',
                  dataIndex: 'plannedMarginPct',
                  width: 120,
                  align: 'right',
                  render: (v: number | null) => (v === null ? <span className="text-muted">{NO_VALUE}</span> : <span style={{ color: v < 0 ? RED : undefined }}>{formatPct(v)}</span>),
                },
                { title: 'Budget', dataIndex: 'budgetAmount', width: 130, align: 'right', render: (v) => <Money value={v} /> },
                { title: 'Done', dataIndex: 'executedQty', width: 120, align: 'right', render: (v) => <span className="mono" translate="no">{formatQty(v)}</span> },
                { title: 'Earned', dataIndex: 'earnedBudget', width: 130, align: 'right', render: (v) => <Money value={v} /> },
              ]}
            />
          </Section>

          {data.notes ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: tk.space[3] }}>
              <strong>Notes:</strong> {data.notes}
            </Typography.Paragraph>
          ) : null}

          <BudgetHistorySection versions={data.versions} />

          <Section style={{ marginTop: tk.space[4] }} title="Cash-flow forecast">
            <CashFlowPanel projectId={projectId} />
          </Section>
          {canEdit && <BudgetFormModal open={editing} onClose={() => setEditing(false)} budget={data} />}
        </>
      )}
    </SectionStack>
  );
}
