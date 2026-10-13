'use client';

import React from 'react';
import { App, Button, Card, Descriptions, Divider, Drawer, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import type { DailyReportDto, ManpowerLine, MachineryLine } from '@erp/shared';
import { WEATHER_LABELS } from '@erp/shared';
import { useDpr } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { openDprPrint } from './dprPrint';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 2, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#0f2a4d' }}>
        {title}
      </Typography.Text>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children ?? <span className="text-muted">-</span>}</div>
    </div>
  );
}

export function DprDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (entry: DailyReportDto) => void }) {
  const { data, isLoading, error, refetch } = useDpr(id ?? undefined);
  const { user } = useAuth();
  const { message } = App.useApp();

  const print = () => {
    if (!data) return;
    if (!openDprPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the DPR.');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={820}
      title={
        data ? (
          <Space>
            <span>DPR · {formatDate(data.date)}</span>
            <StatusTag status={data.status} />
          </Space>
        ) : (
          'Daily Progress Report'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <Button icon={<PrinterOutlined />} onClick={print}>
              Print / PDF
            </Button>
            <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            <ReviewActions type="dpr" id={data.id} status={data.status} size="small" />
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            style={{ marginBottom: 16 }}
            items={[
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'weather', label: 'Weather', children: data.weather ? <Tag style={{ margin: 0 }}>{WEATHER_LABELS[data.weather]}</Tag> : '-' },
              { key: 'cond', label: 'Site condition', children: data.siteCondition ?? '-' },
              { key: 'mp', label: 'Total manpower', children: data.totalManpower },
              ...submissionMetaItems(data).filter((i) => i.key !== 'status').map((i) => ({ ...i, span: 2 })),
            ]}
          />
          <Section title="Work executed">{data.workExecuted}</Section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Card size="small" title="Manpower">
              <Table<ManpowerLine>
                size="small"
                rowKey={(r, i) => `${r.category}-${i}`}
                pagination={false}
                dataSource={data.manpower}
                columns={[
                  { title: 'Category', dataIndex: 'category' },
                  { title: 'Count', dataIndex: 'count', align: 'right', width: 80 },
                ]}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <strong>Total</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <strong>{data.totalManpower}</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </Card>
            <Card size="small" title="Machinery">
              <Table<MachineryLine>
                size="small"
                rowKey={(r, i) => `${r.name}-${i}`}
                pagination={false}
                dataSource={data.machinery}
                columns={[
                  { title: 'Equipment', dataIndex: 'name' },
                  { title: 'Hours', dataIndex: 'hours', align: 'right', width: 80 },
                ]}
              />
            </Card>
          </div>
          <Section title="Material received">{data.materialReceived}</Section>
          <Section title="Tests conducted">{data.testsConducted}</Section>
          <Section title="Safety observations">{data.safetyObservations}</Section>
          <Section title="Issues / hindrances">{data.issues}</Section>
          <Section title="Next day plan">{data.nextDayPlan}</Section>
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="dpr" id={data.id} />
        </>
      )}
    </Drawer>
  );
}
