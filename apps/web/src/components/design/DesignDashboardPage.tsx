'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, Col, Flex, Row, Skeleton, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { DOCUMENT_DISCIPLINE_LABELS, DRAWING_BAND_LABELS, DRAWING_BANDS, figure, type DesignDashboardDto, type DrawingCountRow, type RecentRevisionDto } from '@erp/shared';
import { useDesignDashboard } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { NO_VALUE, formatDate } from '@/lib/format';
import { Figures } from '@/components/figures';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { AppTag } from '@/components/common/AppTag';
import { RevisionStatusTag } from '@/components/documents/docUi';
import { ChartCard } from '@/components/home/ChartCard';
import { ImpactList } from './RevisionImpact';

const chartLoading = () => <Skeleton.Node active style={{ width: '100%', height: 280 }} />;
const DrawingStatusChart = dynamic(() => import('@/components/home/charts').then((m) => m.DrawingStatusChart), { ssr: false, loading: chartLoading });
const DrawingDisciplineChart = dynamic(() => import('@/components/home/charts').then((m) => m.DrawingDisciplineChart), { ssr: false, loading: chartLoading });

type ProjectRow = DesignDashboardDto['projects'][number];

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography.Title level={2} style={{ fontSize: tk.type.body.fontSize, margin: 0 }}>
      {children}
    </Typography.Title>
  );
}

/** The drawing counts as a table: each discipline's drawings by where they stand, with the total. */
function DrawingCountTable({ rows }: { rows: DrawingCountRow[] }) {
  const bands = DRAWING_BANDS.filter((b) => rows.some((x) => x.counts[b] > 0));
  return (
    <Table<DrawingCountRow>
      size="small"
      pagination={false}
      rowKey="discipline"
      dataSource={rows}
      scroll={{ x: 'max-content' }}
      columns={[
        { title: 'Discipline', key: 'discipline', render: (_, r) => DOCUMENT_DISCIPLINE_LABELS[r.discipline] },
        ...bands.map((b) => ({ title: DRAWING_BAND_LABELS[b], key: b, align: 'right' as const, className: 'mono', render: (_: unknown, r: DrawingCountRow) => r.counts[b] })),
        { title: 'Drawings', key: 'total', align: 'right', className: 'mono', render: (_, r) => r.total },
      ]}
    />
  );
}

/** What the drawing charts say in words: the AFC share, then what waits and what came back. */
function drawingSummary(rows: DrawingCountRow[]) {
  const sum = (k: keyof DrawingCountRow['counts']) => rows.reduce((t, x) => t + x.counts[k], 0);
  const total = rows.reduce((t, x) => t + x.total, 0);
  const parts = [`${sum('AFC')} of ${total} drawings are AFC`];
  if (sum('FOR_APPROVAL')) parts.push(`${sum('FOR_APPROVAL')} for approval`);
  if (sum('REJECTED')) parts.push(`${sum('REJECTED')} rejected`);
  return `${parts.join(', ')}.`;
}

function Body({ data, projectId }: { data: DesignDashboardDto; projectId?: string }) {
  const t = data.totals;
  const scope = (pid?: string) => (pid ? `&projectId=${pid}` : '');
  const n = (v: number, href: string) => (v ? <Link href={href}>{v}</Link> : <Typography.Text type="secondary">{NO_VALUE}</Typography.Text>);
  const withWork = data.recent.filter((r) => r.items.length);
  return (
    <Flex vertical gap={tk.space[5]}>
      <Figures
        label="Drawing figures"
        scope={{ projectId }}
        figures={[
          figure('drawingsLate', t.drawingsLate, { versus: { of: figure('drawingsAwaited', t.drawingsAwaited) } }),
          figure('reviewsLate', t.reviewsLate, { versus: { of: figure('underReview', t.underReview) } }),
          figure('commentsToAnswer', t.commentsToAnswer, { count: t.withUs || undefined }),
          figure('copiesToRecall', t.copiesToRecall, { versus: { part: figure('recallsLate', t.recallsLate) } }),
          figure('asBuiltDue', t.asBuiltDue),
          figure('rfisOpen', t.rfisOpen),
        ]}
      />
      {data.drawings.length ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <ChartCard title="Drawings by status" summary={drawingSummary(data.drawings)} chart={<DrawingStatusChart rows={data.drawings} />} table={<DrawingCountTable rows={data.drawings} />} />
          </Col>
          <Col xs={24} lg={14}>
            <ChartCard
              title="Drawings by discipline"
              summary={`${data.drawings.length} discipline${data.drawings.length === 1 ? '' : 's'}; ${data.drawings
                .map((r) => `${DOCUMENT_DISCIPLINE_LABELS[r.discipline]} ${r.counts.AFC} of ${r.total} AFC`)
                .join(', ')}.`}
              chart={<DrawingDisciplineChart rows={data.drawings} />}
              table={<DrawingCountTable rows={data.drawings} />}
            />
          </Col>
        </Row>
      ) : null}
      <Card size="small" title={<CardTitle>By project</CardTitle>}>
        <Table<ProjectRow>
          rowKey="projectId"
          size="small"
          pagination={false}
          dataSource={data.projects}
          scroll={{ x: 1000 }}
          locale={{ emptyText: 'Nothing open on any project' }}
          columns={[
            {
              title: 'Project',
              key: 'project',
              fixed: 'left',
              width: 260,
              render: (_, r) => (
                <div>
                  <span translate="no">{`${r.projectCode} ${r.projectName}`}</span>
                  {r.notes.length ? (
                    <Flex gap={4} wrap style={{ marginTop: tk.space[1] }}>
                      {r.notes.slice(0, 3).map((x) => (
                        <AppTag key={x.text} kind="impact" status={x.tone}>
                          {x.text}
                        </AppTag>
                      ))}
                    </Flex>
                  ) : null}
                </div>
              ),
            },
            { title: 'Drawings late', key: 'late', align: 'right', width: 110, render: (_, r) => n(r.drawingsLate, `/drawing-schedule?state=LATE${scope(r.projectId)}`) },
            { title: 'Awaited', key: 'awaited', align: 'right', width: 90, render: (_, r) => n(r.drawingsAwaited, `/drawing-schedule?projectId=${r.projectId}`) },
            { title: 'With reviewer', key: 'review', align: 'right', width: 110, render: (_, r) => n(r.underReview, `/design-submissions?status=UNDER_REVIEW${scope(r.projectId)}`) },
            { title: 'Reply late', key: 'rlate', align: 'right', width: 100, render: (_, r) => n(r.reviewsLate, `/design-submissions?status=LATE${scope(r.projectId)}`) },
            { title: 'Comments', key: 'comments', align: 'right', width: 100, render: (_, r) => n(r.commentsToAnswer, `/design-submissions?toAnswer=true${scope(r.projectId)}`) },
            { title: 'To withdraw', key: 'recall', align: 'right', width: 100, render: (_, r) => n(r.copiesToRecall, `/controlled-copies?state=TO_RECALL${scope(r.projectId)}`) },
            { title: 'As-built due', key: 'asbuilt', align: 'right', width: 100, render: (_, r) => n(r.asBuiltDue, `/as-built?projectId=${r.projectId}`) },
            { title: 'Open RFIs', key: 'rfis', align: 'right', width: 90, render: (_, r) => n(r.rfisOpen, '/documents?tab=rfis') },
          ]}
        />
      </Card>
      <Card size="small" title={<CardTitle>What new revisions change</CardTitle>}>
        {withWork.length ? (
          <Flex vertical gap={tk.space[5]}>
            {withWork.map((r: RecentRevisionDto) => (
              <div key={r.documentId}>
                <Flex gap={tk.space[2]} wrap align="center" style={{ marginBottom: tk.space[1] }}>
                  <Link href={`/documents?id=${r.documentId}`}>
                    <Typography.Text strong translate="no">{`${r.docNo} ${r.revision}`}</Typography.Text>
                  </Link>
                  <RevisionStatusTag status={r.status} />
                  <Typography.Text type="secondary" translate="no">{`${r.title} · ${r.projectName} · ${formatDate(r.issuedOn)}${r.previous ? `, after ${r.previous}` : ''}`}</Typography.Text>
                </Flex>
                <ImpactList items={r.items} />
              </div>
            ))}
          </Flex>
        ) : (
          <Typography.Text type="secondary">{data.recent.length ? `${data.recent.length} revisions in the last 30 days; nothing hangs on them.` : 'No revision in the last 30 days.'}</Typography.Text>
        )}
      </Card>
    </Flex>
  );
}

/**
 * The drawings dashboard: late drawings, approvals and comments, superseded copies on site, as-builts and
 * RFIs by project, the drawings by status and by discipline, and what each revision of the last 30 days changes.
 */
export function DesignDashboardPage() {
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useDesignDashboard(projectId);
  return (
    <div className="page-container">
      <PageHeader title="Dashboard" help="What is late or open on each project, and what new revisions change." />
      <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" placeholder="All projects" style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      {isLoading ? <PageSkeleton shape="home" header={false} /> : error || !data ? <QueryError error={error} onRetry={() => refetch()} /> : <Body data={data} projectId={projectId} />}
    </div>
  );
}
