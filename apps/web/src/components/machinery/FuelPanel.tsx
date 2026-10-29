'use client';

import React, { useState } from 'react';
import { Button, Empty, Skeleton, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import { FileExcelOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { FuelIssueDto, FuelPositionRowDto } from '@erp/shared';
import { useFuelPosition } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { Section, SectionStack } from '@/components/common/Section';
import { FuelIssueModal } from './FuelIssueModal';
import { FuelTanks } from './FuelTanks';

const RED = themeColor('colorErrorText');
const q = (v: string, unit: string, muted = true) =>
  toNumber(v) === 0 && muted ? (
    <span className="text-muted">-</span>
  ) : (
    <span className="mono" translate="no">
      {formatQty(v)} {unit}
    </span>
  );

/**
 * Fuel (v5 item 93): each site's fuel on a day (opening, received, into machines, other issues, closing against its
 * minimum level) and the day's fuel issues into machines, with Fuel issue for the store; where trackers read the tanks,
 * each machine's tank against its slips and the dispenser's fills waiting (item 147).
 */
export function FuelPanel({ projectId: fixedProject }: { projectId?: string }) {
  const [scope, setScope] = useProjectScope();
  const projectId = fixedProject ?? scope;
  const [date, setDate] = useState(() => dayjs());
  const [issuing, setIssuing] = useState(false);
  const { data, isLoading, error, refetch } = useFuelPosition({ date: date.format('YYYY-MM-DD'), projectId });

  const exportExcel = () => {
    if (!data) return;
    void downloadXlsx<FuelIssueDto>(
      exportFileName(`fuel-${data.date}`),
      'Fuel issues',
      [
        { header: 'Slip', value: (r) => r.entryNo, width: 16 },
        { header: 'Machine', value: (r) => [r.equipmentCode, r.equipmentName].filter(Boolean).join(' '), width: 32 },
        { header: 'Fuel', value: (r) => r.itemName },
        { header: 'Quantity', value: (r) => toNumber(r.litres) },
        { header: 'Unit', value: (r) => r.unit },
        { header: 'Meter', value: (r) => (r.meterReading === null ? null : toNumber(r.meterReading)) },
        { header: 'Handed to', value: (r) => r.issuedTo ?? '', width: 24 },
        { header: 'By', value: (r) => r.createdByName, width: 20 },
      ],
      data.issues,
    );
  };

  const positionColumns: TableProps<FuelPositionRowDto>['columns'] = [
    ...(fixedProject
      ? []
      : [
          {
            title: 'Site',
            key: 'site',
            width: 230,
            render: (_: unknown, r: FuelPositionRowDto) => (
              <div>
                <span className="mono" translate="no">
                  {r.projectCode}
                </span>
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {r.projectName}
                </div>
              </div>
            ),
          },
        ]),
    { title: 'Fuel', dataIndex: 'itemName', width: 110 },
    { title: 'Opening', dataIndex: 'opening', width: 110, align: 'right', render: (v: string, r) => q(v, r.unit, false) },
    { title: 'Received', dataIndex: 'received', width: 110, align: 'right', render: (v: string, r) => q(v, r.unit) },
    { title: 'Into machines', dataIndex: 'issuedToMachines', width: 130, align: 'right', render: (v: string, r) => q(v, r.unit) },
    { title: 'Other issues', dataIndex: 'otherOut', width: 120, align: 'right', render: (v: string, r) => q(v, r.unit) },
    {
      title: 'Closing',
      dataIndex: 'closing',
      width: 150,
      align: 'right',
      render: (v: string, r) => {
        const low = r.minLevel !== null && toNumber(v) < toNumber(r.minLevel);
        return (
          <div>
            <span className="mono" translate="no" style={{ fontWeight: 600, color: low ? RED : undefined }}>
              {formatQty(v)} {r.unit}
            </span>
            {low ? <div style={{ fontSize: themeFontSize('fontSizeSM'), color: RED }}>below {formatQty(r.minLevel!)} minimum</div> : null}
          </div>
        );
      },
    },
  ];

  const issueColumns: TableProps<FuelIssueDto>['columns'] = [
    { title: 'Slip', dataIndex: 'entryNo', width: 130, className: 'mono' },
    {
      title: 'Machine',
      key: 'machine',
      render: (_, r) => (
        <div>
          <span className="mono" translate="no">
            {r.equipmentCode}
          </span>{' '}
          {r.equipmentName}
          {r.issuedTo ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              to {r.issuedTo}
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Quantity', dataIndex: 'litres', width: 110, align: 'right', render: (v: string, r) => q(v, r.unit, false) },
    { title: 'Meter', dataIndex: 'meterReading', width: 100, align: 'right', render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono">{formatQty(v)}</span>) },
    { title: 'By', dataIndex: 'createdByName', width: 150, ellipsis: true },
  ];

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0' }}>
        {fixedProject ? null : <ProjectSelect value={scope} onChange={(v) => setScope(v)} style={{ minWidth: 220, maxWidth: '100%' }} />}
        <DatePicker
          value={date}
          onChange={(d) => setDate(d ?? dayjs())}
          allowClear={false}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          aria-label="Day"
        />
        <Space wrap style={{ marginLeft: 'auto' }}>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={!data?.issues.length}>
            Export
          </Button>
          {data?.canIssue ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIssuing(true)}>
              Fuel issue
            </Button>
          ) : null}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <Section title={`Fuel position on ${formatDate(data.date)}`}>
            <Table<FuelPositionRowDto>
              rowKey={(r) => `${r.projectId}:${r.itemId}`}
              size="small"
              pagination={false}
              dataSource={data.rows}
              scroll={{ x: fixedProject ? 760 : 990 }}
              columns={positionColumns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fuel held at these sites. Mark diesel as fuel in Items to see it here." /> }}
            />
          </Section>
          <Section style={{ marginTop: 16 }} title="Into machines">
            <Table<FuelIssueDto>
              rowKey="entryId"
              size="small"
              pagination={false}
              dataSource={data.issues}
              scroll={{ x: 760 }}
              columns={issueColumns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fuel went into machines on this day" /> }}
            />
          </Section>
          <FuelTanks date={data.date} projectId={projectId} canIssue={data.canIssue} />
          <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 12, marginBottom: 0 }}>
            A fuel issue names the machine and its meter, so each machine&apos;s litres an hour can be checked against its norm (set on the machine in
            Equipment). The watch list flags a machine whose recent logs are off the norm by more than its tolerance.
          </Typography.Paragraph>
        </>
      )}
      <FuelIssueModal open={issuing} onClose={() => setIssuing(false)} projectId={fixedProject ?? scope} />
    </SectionStack>
  );
}
