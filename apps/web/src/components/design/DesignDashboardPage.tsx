'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Flex, Row, Statistic, Table, Typography, theme } from 'antd';
import type { DesignDashboardDto, ImpactTone, RecentRevisionDto } from '@erp/shared';
import { useDesignDashboard } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { DISPLAY_FONT } from '@/lib/theme';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import { RevisionStatusTag } from '@/components/documents/docUi';
import { ImpactList } from './RevisionImpact';

const TONE: Record<ImpactTone, TagTone> = { danger: 'danger', warning: 'pending', info: 'info' };
type ProjectRow = DesignDashboardDto['projects'][number];

function CardTitle({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>
      {children}
    </Typography.Title>
  );
}

function Body({ data }: { data: DesignDashboardDto }) {
  const { token } = theme.useToken();
  const t = data.totals;
  const scope = (pid?: string) => (pid ? `&projectId=${pid}` : '');
  const stat = (title: string, value: number, note: string, href: string, tone?: 'danger' | 'warning') => (
    <Col xs={12} lg={8} xl={4}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic
          title={<Link href={href}>{title}</Link>}
          value={value}
          styles={{ content: { fontFamily: DISPLAY_FONT, fontSize: token.fontSizeHeading4, color: value && tone === 'danger' ? token.colorErrorText : value && tone === 'warning' ? token.colorWarningText : undefined } }}
        />
        <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div>
      </Card>
    </Col>
  );
  const n = (v: number, href: string) => (v ? <Link href={href}>{v}</Link> : <Typography.Text type="secondary">-</Typography.Text>);
  const withWork = data.recent.filter((r) => r.items.length);
  return (
    <Flex vertical gap={token.marginMD}>
      <Row gutter={[12, 12]}>
        {stat('Drawings late', t.drawingsLate, `${t.drawingsAwaited} awaited in all`, '/drawing-schedule?state=LATE', 'danger')}
        {stat('Reviews past the reply date', t.reviewsLate, `${t.underReview} with the reviewer`, '/design-submissions?status=LATE', 'warning')}
        {stat('Comments to answer', t.commentsToAnswer, `${t.withUs} submission${t.withUs === 1 ? '' : 's'} to revise`, '/design-submissions?status=WITH_US', 'warning')}
        {stat('Copies to recall', t.copiesToRecall, t.recallsLate ? `${t.recallsLate} out longer than a week` : 'Superseded prints on site', '/controlled-copies?state=TO_RECALL', t.recallsLate ? 'danger' : 'warning')}
        {stat('As-built due', t.asBuiltDue, 'Built from, no as-built revision', '/drawing-schedule?tab=as-built')}
        {stat('Open RFIs', t.rfisOpen, `${t.revisionsRecent} revisions in 30 days`, '/documents?tab=rfis')}
      </Row>
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
                    <Flex gap={4} wrap style={{ marginTop: 4 }}>
                      {r.notes.slice(0, 3).map((x) => (
                        <AppTag key={x.text} tone={TONE[x.tone]}>
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
            { title: 'Comments', key: 'comments', align: 'right', width: 100, render: (_, r) => n(r.commentsToAnswer, `/design-submissions?status=WITH_US${scope(r.projectId)}`) },
            { title: 'To recall', key: 'recall', align: 'right', width: 90, render: (_, r) => n(r.copiesToRecall, `/controlled-copies?state=TO_RECALL${scope(r.projectId)}`) },
            { title: 'As-built due', key: 'asbuilt', align: 'right', width: 100, render: (_, r) => n(r.asBuiltDue, `/drawing-schedule?tab=as-built${scope(r.projectId)}`) },
            { title: 'Open RFIs', key: 'rfis', align: 'right', width: 90, render: (_, r) => n(r.rfisOpen, '/documents?tab=rfis') },
          ]}
        />
      </Card>
      <Card size="small" title={<CardTitle>What new revisions change</CardTitle>}>
        {withWork.length ? (
          <Flex vertical gap={token.marginMD}>
            {withWork.map((r: RecentRevisionDto) => (
              <div key={r.documentId}>
                <Flex gap={token.marginXS} wrap align="center" style={{ marginBottom: token.marginXXS }}>
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
 * The design dashboard: late drawings, approvals and comments, superseded copies on site, as-builts and
 * RFIs by project, and what each revision of the last 30 days changes.
 */
export function DesignDashboardPage() {
  const { token } = theme.useToken();
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useDesignDashboard(projectId);
  return (
    <div className="page-container">
      <PageHeader title="Design dashboard" subtitle="Drawings late, approvals and comments, superseded copies on site and what new revisions change, by project." />
      <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" placeholder="All projects" style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      {isLoading ? <PageSkeleton shape="home" header={false} /> : error || !data ? <QueryError error={error} onRetry={() => refetch()} /> : <Body data={data} />}
    </div>
  );
}
