'use client';

import React, { useState } from 'react';
import { Button, DatePicker, Select, Space, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { PrinterOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { EmployeeEventDto, EmployeeEventType } from '@erp/shared';
import { EMPLOYEE_EVENT_LABELS, EMPLOYEE_EVENT_LETTERS, EMPLOYEE_EVENT_TYPES, isExitEvent } from '@erp/shared';
import { useEmployeeEvents } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { eventChange, usePrintLetter } from './EmployeeService';

/**
 * Every service event across the company (v6 item 99): who joined, was confirmed, moved, promoted, got an increment or a
 * warning, or left, with each letter to print again. Rows open the person's record.
 */
export function ServiceRecords({ onOpen }: { onOpen: (employeeId: string) => void }) {
  const [type, setType] = useState<EmployeeEventType | undefined>();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useEmployeeEvents({
    type,
    from: range?.[0].format('YYYY-MM-DD'),
    to: range?.[1].format('YYYY-MM-DD'),
    page,
    pageSize: 25,
  });
  const print = usePrintLetter();

  const columns: TableProps<EmployeeEventDto>['columns'] = [
    { title: 'From', dataIndex: 'effectiveDate', width: 120, render: (v: string) => <span translate="no">{formatDate(v)}</span> },
    {
      title: 'Employee',
      key: 'employee',
      width: 220,
      render: (_, r) => (
        <span translate="no">
          {r.employeeName} <Typography.Text type="secondary">{r.employeeCode}</Typography.Text>
        </span>
      ),
    },
    { title: 'What', dataIndex: 'type', width: 130, render: (v: EmployeeEventType) => <AppTag color={isExitEvent(v) ? 'default' : v === 'WARNING' ? 'warning' : 'processing'}>{EMPLOYEE_EVENT_LABELS[v]}</AppTag> },
    { title: 'Change', key: 'change', ellipsis: true, render: (_, r) => eventChange(r) || '-' },
    { title: 'Letter', dataIndex: 'letterNo', width: 130, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Recorded by', dataIndex: 'createdByName', width: 160, ellipsis: true },
    {
      title: '',
      key: 'print',
      width: 110,
      render: (_, r) => (
        <Button
          size="small"
          icon={<PrinterOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            print(r);
          }}
          aria-label={`Print ${EMPLOYEE_EVENT_LETTERS[r.type].toLowerCase()} ${r.letterNo}`}
        >
          Letter
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="Every kind"
          aria-label="Kind of event"
          style={{ width: 180 }}
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={EMPLOYEE_EVENT_TYPES.map((t) => ({ value: t, label: EMPLOYEE_EVENT_LABELS[t] }))}
        />
        <DatePicker.RangePicker
          format="DD MMM YYYY"
          aria-label="Dates"
          value={range}
          onChange={(v) => {
            setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
            setPage(1);
          }}
        />
      </Space>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<EmployeeEventDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 1000 }}
          locale={{ emptyText: type || range ? 'Nothing recorded for these filters' : 'Nothing recorded yet' }}
          onRow={(r) => ({ onClick: () => onOpen(r.employeeId), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: 25, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        />
      )}
    </div>
  );
}
