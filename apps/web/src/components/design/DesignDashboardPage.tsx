'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Flex, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { figure, type DesignDashboardDto, type RecentRevisionDto } from '@erp/shared';
import { useDesignDashboard } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { NO_VALUE, formatDate } from '@/lib/format';
import { Figures } from '@/components/figures';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { AppTag } from '@/components/common/AppTag';
import { RevisionStatusTag } from '@/components/documents/docUi';
import { ImpactList } from './RevisionImpact';

type ProjectRow = DesignDashboardDto['projects'][number];

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography.Title level={2} style={{ fontSize: tk.type.body.fontSize, margin: 0 }}>
      {children}
    </Typography.Title>
  );
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
 * RFIs by project, and what each revision of the last 30 days changes.
 */
export function DesignDashboardPage() {
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useDesignDashboard(projectId);
  return (
    <div className="page-container">
      <PageHeader title="Dashboard" subtitle="What is late or open on each project, and what new revisions change." />
      <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" placeholder="All projects" style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      {isLoading ? <PageSkeleton shape="home" header={false} /> : error || !data ? <QueryError error={error} onRetry={() => refetch()} /> : <Body data={data} projectId={projectId} />}
    </div>
  );
}
