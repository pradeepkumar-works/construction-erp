'use client';

import React, { useState } from 'react';
import { Card, Descriptions, Divider, Drawer, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { PortalDprDto } from '@erp/shared';
import { WEATHER_LABELS } from '@erp/shared';
import { usePortalDprs } from '@/lib/queries';
import { formatDate, formatDateTime, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) =>
  children ? (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text strong>{title}</Typography.Text>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  ) : null;

/** Approved daily progress reports, newest first. */
export function PortalDprs({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState<PortalDprDto | null>(null);
  const { data, isFetching, error, refetch } = usePortalDprs(projectId, page, pageSize);
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<PortalDprDto>
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data?.items ?? []}
        onRow={(r) => ({ onClick: () => setOpen(r), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'No approved daily reports yet' }}
        scroll={{ x: 800 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          hideOnSinglePage: true,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
        columns={[
          { title: 'Date', dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Work done', dataIndex: 'workExecuted', ellipsis: true },
          { title: 'Labour', dataIndex: 'totalManpower', width: 100, align: 'right' },
          { title: 'Weather', dataIndex: 'weather', width: 100, render: (w: PortalDprDto['weather']) => (w ? WEATHER_LABELS[w] : NO_VALUE) },
          { title: 'Photos', key: 'photos', width: 80, align: 'right', render: (_, r) => r.attachments.length || NO_VALUE },
        ]}
      />
      <Drawer open={!!open} onClose={() => setOpen(null)} size={820} title={open ? `Daily report, ${formatDate(open.date)}` : ''} destroyOnHidden>
        {open ? (
          <>
            <Descriptions
              size="small"
              column={2}
              bordered
              style={{ marginBottom: 16 }}
              items={[
                { key: 'w', label: 'Weather', children: open.weather ? <AppTag style={{ margin: 0 }}>{WEATHER_LABELS[open.weather]}</AppTag> : NO_VALUE },
                { key: 'c', label: 'Site condition', children: open.siteCondition ?? NO_VALUE },
                { key: 'm', label: 'Total labour', children: open.totalManpower },
                { key: 'by', label: 'Reported by', children: open.submittedByName },
                { key: 'ap', label: 'Approved', children: `${open.reviewedByName ?? NO_VALUE}, ${formatDateTime(open.reviewedAt)}`, span: 2 },
              ]}
            />
            <Section title="Work done">{open.workExecuted}</Section>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Card size="small" title="Labour">
                {open.manpower.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.category}</span>
                    <span>{m.count}</span>
                  </div>
                ))}
              </Card>
              <Card size="small" title="Machinery">
                {open.machinery.length
                  ? open.machinery.map((m, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{m.name}</span>
                        <span>{m.hours} h</span>
                      </div>
                    ))
                  : NO_VALUE}
              </Card>
            </div>
            <Section title="Material received">{open.materialReceived}</Section>
            <Section title="Tests conducted">{open.testsConducted}</Section>
            <Section title="Safety observations">{open.safetyObservations}</Section>
            <Section title="Issues and hindrances">{open.issues}</Section>
            <Section title="Next day plan">{open.nextDayPlan}</Section>
            <Divider titlePlacement="start" plain>
              Photos ({open.attachments.length})
            </Divider>
            <AttachmentGallery attachments={open.attachments} />
          </>
        ) : null}
      </Drawer>
    </>
  );
}
