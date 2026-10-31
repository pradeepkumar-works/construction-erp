'use client';

import React, { useState } from 'react';
import { Button, Card, Col, Row, Space, Statistic, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { CarOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { RmcBatchDto, RmcOrderDto } from '@erp/shared';
import { useRmcDay } from '@/lib/queries';
import { formatDate, formatQty, NO_VALUE, formatTime } from '@/lib/format';
import { QueryError, PageSkeleton } from '@/components/common/QueryState';
import { BatchStatusTag, M3, PlantFilter, m3, usePlantScope } from './rmcUi';
import { DispatchForm } from './BatchForms';
import { useRmcDrawers } from './Drawers';

/** The plant's day: the orders to pour and what each has had, the trucks sent, by grade, and the store against what is left to pour. */
export function DayView() {
  const [plantId] = usePlantScope();
  const [date, setDate] = useState(() => dayjs());
  const { data, isLoading, error, refetch } = useRmcDay({ date: date.format('YYYY-MM-DD'), plantId });
  const [sending, setSending] = useState<RmcOrderDto | null>(null);
  const { openOrder, openBatch, drawers } = useRmcDrawers();
  const today = date.isSame(dayjs(), 'day');
  const sent = (data?.byGrade ?? []).reduce((s, g) => s + Number(g.m3), 0);
  const trucks = (data?.byGrade ?? []).reduce((s, g) => s + g.trucks, 0);
  const onTheWay = (data?.batches ?? []).filter((b) => b.status === 'DISPATCHED').length;
  const short = (data?.materials ?? []).filter((m) => m.short).length;
  return (
    <div style={{ padding: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker aria-label="Day" allowClear={false} value={date} onChange={(d) => d && setDate(d)} disabledDate={(d) => d.isAfter(dayjs().add(7, 'day'))} />
        <PlantFilter />
      </Space>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <PageSkeleton shape="list" header={false} />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title={today ? 'Sent today' : `Sent on ${formatDate(data.date)}`} value={m3(sent)} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Trucks" value={trucks} suffix={onTheWay ? <Typography.Text type="secondary" style={{ fontSize: 14 }}>{`${onTheWay} in transit`}</Typography.Text> : null} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Orders to pour" value={data.orders.filter((o) => o.status === 'CONFIRMED').length} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Materials short" value={short} styles={{ content: short ? { color: 'var(--ant-color-error-text)' } : undefined }} />
              </Card>
            </Col>
          </Row>
          {data.byGrade.length > 0 && (
            <Space wrap style={{ marginBottom: 16 }}>
              {data.byGrade.map((g) => (
                <AppTag key={g.grade} translate="no">{`${g.grade}: ${m3(g.m3)} in ${g.trucks} ${g.trucks === 1 ? 'truck' : 'trucks'}`}</AppTag>
              ))}
            </Space>
          )}
          <Typography.Title level={2} style={{ fontSize: 16 }}>
            Orders to pour
          </Typography.Title>
          <Table<RmcOrderDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.orders}
            scroll={{ x: 900 }}
            locale={{ emptyText: 'No confirmed orders due to pour' }}
            onRow={(o) => ({ onClick: () => openOrder(o.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Order', dataIndex: 'orderNo', width: 140, render: (n: string) => <span translate="no">{n}</span> },
              { title: 'Customer', key: 'c', ellipsis: true, render: (_, o) => <span translate="no">{`${o.customer}${o.site ? `, ${o.site}` : ''}`}</span> },
              { title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
              { title: 'Pour on', dataIndex: 'pourDate', width: 110, render: (d: string | null) => formatDate(d) },
              { title: 'Sent', key: 's', align: 'right', width: 150, render: (_, o) => <span translate="no">{`${formatQty(Number(o.delivered) + Number(o.onTheWay))} of ${m3(o.quantity)}`}</span> },
              {
                title: '',
                key: 'a',
                width: 150,
                render: (_, o) =>
                  o.canDispatch ? (
                    <Button
                      size="small"
                      icon={<CarOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSending(o);
                      }}
                    >
                      New challan
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 20 }}>
            Trucks
          </Typography.Title>
          <Table<RmcBatchDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.batches}
            scroll={{ x: 760 }}
            locale={{ emptyText: today ? 'No trucks have left the plant today' : 'No trucks that day' }}
            onRow={(b) => ({ onClick: () => openBatch(b.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Challan', dataIndex: 'batchNo', width: 140, render: (n: string) => <span translate="no">{n}</span> },
              { title: 'Left', dataIndex: 'dispatchedAt', width: 80, render: (d: string) => formatTime(d) },
              { title: 'Customer', dataIndex: 'customer', ellipsis: true, render: (c: string) => <span translate="no">{c}</span> },
              { title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
              { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
              { title: 'Truck', dataIndex: 'truck', width: 140, render: (t: string | null) => <span translate="no">{t ?? NO_VALUE}</span> },
              { title: 'Status', dataIndex: 'status', width: 120, render: (s: RmcBatchDto['status']) => <BatchStatusTag status={s} /> },
            ]}
          />
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 20 }}>
            Store against what is left to pour
          </Typography.Title>
          <Table
            rowKey="itemId"
            size="small"
            pagination={false}
            dataSource={data.materials}
            scroll={{ x: 560 }}
            locale={{ emptyText: 'Nothing left to pour' }}
            columns={[
              { title: 'Material', dataIndex: 'itemName' },
              { title: 'Needed', key: 'n', align: 'right', render: (_, m) => <span translate="no">{`${formatQty(m.needed)} ${m.unit}`}</span> },
              { title: 'In the store', key: 'i', align: 'right', render: (_, m) => <span translate="no">{`${formatQty(m.inStock)} ${m.unit}`}</span> },
              { title: '', dataIndex: 'short', width: 110, render: (s: boolean) => (s ? <AppTag tone="danger">Short</AppTag> : <AppTag tone="success">Enough</AppTag>) },
            ]}
          />
        </>
      )}
      {drawers}
      <DispatchForm order={sending} onClose={() => setSending(null)} />
    </div>
  );
}
