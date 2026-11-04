'use client';

import React, { useState } from 'react';
import { Button, Empty, Skeleton, Space, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import { FileExcelOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { FuelByKind, FuelIssueDto, FuelPositionRowDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS, fuelByKind } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { useFuelPosition } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { Section, SectionStack } from '@/components/common/Section';
import { FuelIssueModal } from './FuelIssueModal';
import { FuelTanks } from './FuelTanks';

const RED = tk.color.tone.danger.fg;
const q = (v: string, unit: string, muted = true) =>
  toNumber(v) === 0 && muted ? (
    <span className="text-muted">{NO_VALUE}</span>
  ) : (
    <span className="mono" translate="no">
      {formatQty(v)} {unit}
    </span>
  );

/**
 * Fuel: each site's fuel on a day (opening, received, into machines, other issues, closing against its
 * minimum level) and the day's fuel issues into machines, with Fuel issue for the store; where trackers read the tanks,
 * each machine's tank against its slips and the dispenser's fills waiting.
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
        { header: 'Fuel issue', value: (r) => r.entryNo, width: 16 },
        { header: 'Machine', value: (r) => [r.equipmentCode, r.equipmentName].filter(Boolean).join(' '), width: 32 },
        { header: 'Fuel', value: (r) => r.itemName },
        { header: 'Quantity', value: (r) => toNumber(r.litres) },
        { header: 'Unit', value: (r) => r.unit },
        { header: 'Kind', value: (r) => r.equipmentCategory ?? '', width: 18 },
        { header: 'Owner', value: (r) => (r.ownership ? EQUIPMENT_OWNERSHIP_LABELS[r.ownership] : '') },
        { header: 'Meter', value: (r) => (r.meterReading === null ? null : toNumber(r.meterReading)) },
        { header: 'Pump start', value: (r) => (r.pumpStart ? toNumber(r.pumpStart) : null) },
        { header: 'Pump end', value: (r) => (r.pumpEnd ? toNumber(r.pumpEnd) : null) },
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
                <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
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
            <span className="mono" translate="no" style={{ fontWeight: tk.type.title.fontWeight, color: low ? RED : undefined }}>
              {formatQty(v)} {r.unit}
            </span>
            {low ? <div style={{ fontSize: tk.type.caption.fontSize, color: RED }}>below {formatQty(r.minLevel!)} minimum</div> : null}
          </div>
        );
      },
    },
  ];

  const issueColumns: TableProps<FuelIssueDto>['columns'] = [
    { title: 'Fuel issue', dataIndex: 'entryNo', width: 130, className: 'mono' },
    {
      title: 'Machine',
      key: 'machine',
      render: (_, r) => (
        <div>
          <span className="mono" translate="no">
            {r.equipmentCode}
          </span>{' '}
          {r.equipmentName}
          {r.ownership === 'HIRED' ? (
            <AppTag variant="kind" style={{ marginInlineStart: tk.space[2] }}>
              {EQUIPMENT_OWNERSHIP_LABELS.HIRED}
            </AppTag>
          ) : null}
          {r.issuedTo ? (
            <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
              to {r.issuedTo}
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Kind', dataIndex: 'equipmentCategory', width: 140, ellipsis: true, render: (v: string | null) => v ?? <span className="text-muted">{NO_VALUE}</span> },
    { title: 'Quantity', dataIndex: 'litres', width: 110, align: 'right', render: (v: string, r) => q(v, r.unit, false) },
    {
      title: 'Pump',
      key: 'pump',
      width: 170,
      align: 'right',
      render: (_, r) =>
        r.pumpStart && r.pumpEnd ? (
          <span className="mono" translate="no">
            {formatQty(r.pumpStart)} to {formatQty(r.pumpEnd)}
          </span>
        ) : (
          <span className="text-muted">{NO_VALUE}</span>
        ),
    },
    { title: 'Meter', dataIndex: 'meterReading', width: 100, align: 'right', render: (v: string | null) => (v === null ? <span className="text-muted">{NO_VALUE}</span> : <span className="mono">{formatQty(v)}</span>) },
    { title: 'By', dataIndex: 'createdByName', width: 150, ellipsis: true },
  ];

  const kindColumns: TableProps<FuelByKind>['columns'] = [
    { title: 'Kind', dataIndex: 'kind' },
    { title: 'Machines', dataIndex: 'machines', width: 110, align: 'right' },
    { title: 'Litres', dataIndex: 'litres', width: 120, align: 'right', render: (v: number) => <span className="mono" translate="no">{formatQty(v)}</span> },
    { title: 'Into hired machines', dataIndex: 'hiredLitres', width: 170, align: 'right', render: (v: number) => (v ? <span className="mono" translate="no">{formatQty(v)}</span> : <span className="text-muted">{NO_VALUE}</span>) },
  ];
  const byKind = data ? fuelByKind(data.issues) : [];

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: tk.space[3], flexWrap: 'wrap', alignItems: 'center', padding: `${tk.space[3]} 0` }}>
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
              Record fuel issue
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
          <Section style={{ marginTop: tk.space[4] }} title="Into machines">
            <Table<FuelIssueDto>
              rowKey="entryId"
              size="small"
              pagination={false}
              dataSource={data.issues}
              scroll={{ x: 1070 }}
              columns={issueColumns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fuel went into machines on this day" /> }}
            />
          </Section>
          {byKind.length ? (
            <Section style={{ marginTop: tk.space[4] }} title="By kind of machine">
              <Table<FuelByKind> rowKey="kind" size="small" pagination={false} dataSource={byKind} scroll={{ x: 520 }} columns={kindColumns} />
            </Section>
          ) : null}
          <FuelTanks date={data.date} projectId={projectId} canIssue={data.canIssue} />
          <Typography.Paragraph type="secondary" style={{ fontSize: tk.type.caption.fontSize, marginTop: tk.space[3], marginBottom: 0 }}>
            A fuel issue names the machine and its meter, so each machine&apos;s litres an hour can be checked against its norm (set on the machine in
            Equipment). The watch list flags a machine whose recent logs are off the norm by more than its tolerance.
          </Typography.Paragraph>
        </>
      )}
      <FuelIssueModal open={issuing} onClose={() => setIssuing(false)} projectId={fixedProject ?? scope} />
    </SectionStack>
  );
}
