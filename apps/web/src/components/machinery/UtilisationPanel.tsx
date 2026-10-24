'use client';

import React, { useState } from 'react';
import { Button, Col, Empty, Progress, Row, Skeleton, Space, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { FileExcelOutlined } from '@/components/common/icons';
import type { UtilisationGroupDto, UtilisationRowDto } from '@erp/shared';
import { useFleetUtilisation } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatQty, toNumber } from '@/lib/format';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { Section, SectionStack } from '@/components/common/Section';
import { PeriodPicker, periodLabel, periodParams, type PeriodState } from '@/components/cost/PeriodPicker';
import { OwnershipTag } from './hours';

const hours = (v: string) => (
  <span className="mono" translate="no">
    {formatQty(v)} h
  </span>
);

/** A share with a thin bar; under half reads in the warning colour. */
function Share({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-muted">-</span>;
  const low = pct < 50;
  return (
    <div style={{ minWidth: 90 }}>
      <span className="mono" translate="no" style={{ color: low ? themeColor('colorWarningText') : undefined }}>
        {pct}%
      </span>
      <Progress percent={Math.min(pct, 100)} showInfo={false} size="small" status={low ? 'exception' : 'normal'} aria-label={label} style={{ margin: 0 }} />
    </div>
  );
}

/**
 * Utilisation (v5 item 93): each machine's approved logs over a period against the shift on the days it was on site,
 * by machine and by category. Worked ÷ available is utilisation; available less breakdown is availability.
 */
export function UtilisationPanel({ projectId: fixedProject }: { projectId?: string }) {
  const [scope, setScope] = useProjectScope();
  const projectId = fixedProject ?? scope;
  const [period, setPeriod] = useState<PeriodState>({ preset: 'month', range: null });
  const { data, isLoading, error, refetch } = useFleetUtilisation({ ...periodParams(period), projectId });

  const exportExcel = () => {
    if (!data) return;
    void downloadXlsx<UtilisationRowDto>(
      exportFileName('utilisation'),
      'Utilisation',
      [
        { header: 'Code', value: (r) => r.code, width: 12 },
        { header: 'Machine', value: (r) => r.name, width: 32 },
        { header: 'Category', value: (r) => r.category ?? '', width: 16 },
        { header: 'Site', value: (r) => r.projectName ?? '', width: 30 },
        { header: 'Days on site', value: (r) => r.daysOnSite },
        { header: 'Available h', value: (r) => toNumber(r.availableHours) },
        { header: 'Worked h', value: (r) => toNumber(r.workedHours) },
        { header: 'Idle h', value: (r) => toNumber(r.idleHours) },
        { header: 'Breakdown h', value: (r) => toNumber(r.breakdownHours) },
        { header: 'Utilisation %', value: (r) => r.utilisationPct },
        { header: 'Availability %', value: (r) => r.availabilityPct },
        { header: 'Fuel', value: (r) => toNumber(r.fuelLitres) },
        { header: 'Litres an hour', value: (r) => (r.fuelPerHour === null ? null : toNumber(r.fuelPerHour)) },
      ],
      data.rows,
    );
  };

  const machineColumns: TableProps<UtilisationRowDto>['columns'] = [
    {
      title: 'Machine',
      key: 'machine',
      render: (_, r) => (
        <div>
          <span className="mono" translate="no">
            {r.code}
          </span>{' '}
          {r.name}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {[r.category, fixedProject ? null : r.projectName].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
      ),
    },
    { title: 'Owned / hired', dataIndex: 'ownership', width: 110, render: (o: UtilisationRowDto['ownership']) => <OwnershipTag ownership={o} /> },
    { title: 'Days', dataIndex: 'daysOnSite', width: 70, align: 'right' },
    { title: 'Worked', dataIndex: 'workedHours', width: 100, align: 'right', render: hours },
    { title: 'Idle', dataIndex: 'idleHours', width: 90, align: 'right', render: hours },
    { title: 'Breakdown', dataIndex: 'breakdownHours', width: 100, align: 'right', render: (v: string) => (toNumber(v) > 0 ? <span style={{ color: themeColor('colorErrorText') }}>{hours(v)}</span> : <span className="text-muted">-</span>) },
    { title: 'Utilisation', dataIndex: 'utilisationPct', width: 120, render: (v: number | null, r) => <Share pct={v} label={`Utilisation of ${r.code}`} /> },
    { title: 'Availability', dataIndex: 'availabilityPct', width: 120, render: (v: number | null, r) => <Share pct={v} label={`Availability of ${r.code}`} /> },
    {
      title: 'Fuel an hour',
      dataIndex: 'fuelPerHour',
      width: 110,
      align: 'right',
      render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono" translate="no">{formatQty(v)} L</span>),
    },
  ];

  const groupColumns: TableProps<UtilisationGroupDto>['columns'] = [
    { title: 'Category', dataIndex: 'category', render: (v: string | null) => v ?? <span className="text-muted">No category</span> },
    { title: 'Machines', dataIndex: 'machines', width: 90, align: 'right' },
    { title: 'Available', dataIndex: 'availableHours', width: 110, align: 'right', render: hours },
    { title: 'Worked', dataIndex: 'workedHours', width: 100, align: 'right', render: hours },
    { title: 'Utilisation', dataIndex: 'utilisationPct', width: 120, render: (v: number | null, r) => <Share pct={v} label={`Utilisation of ${r.category ?? 'no category'}`} /> },
    { title: 'Availability', dataIndex: 'availabilityPct', width: 120, render: (v: number | null, r) => <Share pct={v} label={`Availability of ${r.category ?? 'no category'}`} /> },
  ];

  const f = data?.fleet;
  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0' }}>
        {fixedProject ? null : <ProjectSelect value={scope} onChange={(v) => setScope(v)} style={{ minWidth: 220, maxWidth: '100%' }} />}
        <PeriodPicker value={period} onChange={setPeriod} />
        <Space wrap style={{ marginLeft: 'auto' }}>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={!data?.rows.length}>
            Export
          </Button>
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && f && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Utilisation" value={f.utilisationPct ?? '-'} suffix={f.utilisationPct === null ? undefined : '%'} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {periodLabel(period)}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Availability" value={f.availabilityPct ?? '-'} suffix={f.availabilityPct === null ? undefined : '%'} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Worked" value={formatQty(f.workedHours)} suffix="h" styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                of {formatQty(f.availableHours)} h available
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Breakdown" value={formatQty(f.breakdownHours)} suffix="h" styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {f.machines} machine{f.machines === 1 ? '' : 's'} logged
              </div>
            </Col>
          </Row>

          <Section style={{ marginTop: 16 }} title="By machine">
            <Table<UtilisationRowDto>
              rowKey="equipmentId"
              size="small"
              pagination={false}
              dataSource={data.rows}
              scroll={{ x: 1100 }}
              columns={machineColumns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No approved machinery logs in the period" /> }}
            />
          </Section>
          {data.categories.length > 1 ? (
            <Section style={{ marginTop: 16 }} title="By category">
              <Table<UtilisationGroupDto>
                rowKey={(r) => r.category ?? 'none'}
                size="small"
                pagination={false}
                dataSource={data.categories}
                scroll={{ x: 680 }}
                columns={groupColumns}
              />
            </Section>
          ) : null}
          <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 12, marginBottom: 0 }}>
            From approved daily logs. A day with a log is a day on site, available for the {data.shiftHours}-hour shift or the hours logged when longer.
            Utilisation is hours worked over hours available; availability is the hours available less breakdowns. Lowest first.
          </Typography.Paragraph>
        </>
      )}
    </SectionStack>
  );
}
