'use client';

import React from 'react';
import { App, Card, Table, Tag, Typography } from 'antd';
import type { DailyReportDto, ManpowerLine, MachineryLine } from '@erp/shared';
import { WEATHER_LABELS } from '@erp/shared';
import { useDpr } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { openDprPrint } from './dprPrint';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { themeColor } from '@/lib/theme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 2, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: themeColor('colorTextHeading') }}>
        {title}
      </Typography.Text>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children ?? <span className="text-muted">-</span>}</div>
    </div>
  );
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (entry: DailyReportDto) => void;
}

/** A daily report, in a drawer from a list or as its own page at `/dpr/<id>`. */
export function DprRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useDpr(id ?? undefined);
  const { user } = useAuth();
  const { message } = App.useApp();

  const print = () => {
    if (!data) return;
    if (!openDprPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the DPR.');
  };

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={820}
      kind="Daily report"
      list={{ href: '/dpr', label: 'Daily Reports' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/dpr/${data.id}`,
          title: `DPR · ${formatDate(data.date)}`,
          tags: <StatusTag status={data.status} />,
          print,
          facts: [
            { key: 'date', label: 'Date', children: formatDate(data.date) },
            { key: 'weather', label: 'Weather', children: data.weather ? <Tag style={{ margin: 0 }}>{WEATHER_LABELS[data.weather]}</Tag> : '-' },
            { key: 'cond', label: 'Site condition', children: data.siteCondition ?? '-' },
            { key: 'mp', label: 'Total manpower', children: data.totalManpower },
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data),
          sections: [
            { key: 'work', title: 'Work executed', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.workExecuted || <span className="text-muted">-</span>}</div> },
            {
              key: 'resources',
              title: 'Manpower and machinery',
              children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
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
              ),
            },
            {
              key: 'notes',
              title: 'Site notes',
              children: (
                <>
                  <Section title="Material received">{data.materialReceived}</Section>
                  <Section title="Tests conducted">{data.testsConducted}</Section>
                  <Section title="Safety observations">{data.safetyObservations}</Section>
                  <Section title="Issues / hindrances">{data.issues}</Section>
                  <Section title="Next day plan">{data.nextDayPlan}</Section>
                </>
              ),
            },
            { key: 'photos', title: 'Photos', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
          ],
          activity: { type: 'dpr', id: data.id, submission: data },
          actions: (size) => (
            <>
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="dpr" id={data.id} status={data.status} size={size} />
            </>
          ),
        }
      }
    />
  );
}

export function DprDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <DprRecord mode="drawer" {...props} />;
}
