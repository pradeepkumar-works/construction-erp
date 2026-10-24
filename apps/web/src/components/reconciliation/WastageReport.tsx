'use client';

import React, { useState } from 'react';
import { Button, Col, Empty, Row, Skeleton, Space, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { FileExcelOutlined } from '@/components/common/icons';
import type { StockAdjustmentReason, WastageRowDto } from '@erp/shared';
import { STOCK_ADJUSTMENT_REASON_LABELS } from '@erp/shared';
import { useWastageReport } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { Section, SectionStack } from '@/components/common/Section';
import { PeriodPicker, periodLabel, periodParams, type PeriodState } from '@/components/cost/PeriodPicker';
import { qty } from './ReconciliationPanel';

const RED = themeColor('colorErrorText');
const reasonLabel = (r: StockAdjustmentReason | null) => (r ? STOCK_ADJUSTMENT_REASON_LABELS[r] : 'Not given');

/**
 * Stock written off or found in a period (v5 item 92): the store's adjustments by the reason given and by item, valued
 * at item rates. Opening stock is left out; counts post as a count difference.
 */
export function WastageReport({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodState>({ preset: 'fy', range: null });
  const { data, isLoading, error, refetch } = useWastageReport(projectId, periodParams(period));
  const values = !!data?.canSeeValues;

  const exportExcel = () => {
    if (!data) return;
    const n = (v: string | null) => (v === null ? null : toNumber(v));
    void downloadXlsx<WastageRowDto>(
      exportFileName('wastage'),
      'Wastage',
      [
        { header: 'Reason', value: (r) => reasonLabel(r.reason), width: 18 },
        { header: 'Item', value: (r) => r.itemName, width: 28 },
        { header: 'Unit', value: (r) => r.unit },
        { header: 'Written off', value: (r) => toNumber(r.lostQty) },
        { header: 'Found', value: (r) => toNumber(r.gainedQty) },
        { header: 'Entries', value: (r) => r.entries },
        ...(values ? [{ header: 'Rate', value: (r: WastageRowDto) => n(r.rate) }, { header: 'Value written off', value: (r: WastageRowDto) => n(r.lostValue) }] : []),
      ],
      data.rows,
    );
  };

  const columns: TableProps<WastageRowDto>['columns'] = [
    { title: 'Reason', dataIndex: 'reason', width: 150, render: (r: StockAdjustmentReason | null) => (r ? reasonLabel(r) : <span className="text-muted">Not given</span>) },
    { title: 'Item', dataIndex: 'itemName' },
    { title: 'Written off', dataIndex: 'lostQty', width: 140, align: 'right', render: (v: string, r) => (toNumber(v) > 0 ? qty(v, r.unit) : <span className="text-muted">-</span>) },
    { title: 'Found', dataIndex: 'gainedQty', width: 120, align: 'right', render: (v: string, r) => (toNumber(v) > 0 ? qty(v, r.unit) : <span className="text-muted">-</span>) },
    { title: 'Entries', dataIndex: 'entries', width: 80, align: 'right' },
    ...(values
      ? [
          {
            title: 'Value',
            dataIndex: 'lostValue',
            width: 130,
            align: 'right' as const,
            render: (v: string | null) =>
              v === null ? (
                <span className="text-muted">no rate</span>
              ) : toNumber(v) > 0 ? (
                <span className="mono" translate="no" style={{ color: RED }}>
                  {formatINR(v)}
                </span>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Space wrap style={{ marginLeft: 'auto' }}>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={!data?.rows.length}>
            Export
          </Button>
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <Row gutter={[16, 16]}>
            {values ? (
              <Col xs={24} md={6}>
                <Statistic
                  title="Written off"
                  value={formatINR(data.lostValue)}
                  styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: toNumber(data.lostValue) > 0 ? RED : undefined } }}
                />
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {periodLabel(period)}
                </div>
              </Col>
            ) : null}
            {data.byReason.map((b) => (
              <Col key={b.reason ?? 'none'} xs={12} md={values ? 6 : 8} lg={values ? 3 : 4}>
                <Statistic
                  title={reasonLabel(b.reason)}
                  value={values && b.lostValue !== null ? formatINR(b.lostValue) : b.entries}
                  styles={{ content: { fontSize: themeFontSize('fontSizeLG') } }}
                />
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {b.entries} entr{b.entries === 1 ? 'y' : 'ies'}
                </div>
              </Col>
            ))}
          </Row>

          <Section style={{ marginTop: 16 }} title="By reason and item">
            <Table<WastageRowDto>
              rowKey={(r) => `${r.reason ?? 'none'}:${r.itemId}`}
              size="small"
              pagination={false}
              dataSource={data.rows}
              scroll={{ x: values ? 820 : 690 }}
              columns={columns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No stock was written off or found in the period" /> }}
            />
          </Section>

          <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 12, marginBottom: 0 }}>
            Every stock adjustment in the period by the reason the storekeeper gave, valued at the item&apos;s rate. A stock count posts its differences as Count
            difference; opening stock is left out. Adjustments made before reasons were asked show as Not given.
          </Typography.Paragraph>
        </>
      )}
    </SectionStack>
  );
}
