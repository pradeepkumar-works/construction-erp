'use client';

import React from 'react';
import Link from 'next/link';
import { Badge, Card, Col, Empty, Progress, Row, Skeleton, Space, Tag, Typography } from 'antd';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@erp/shared';
import { usePortalProjects } from '@/lib/queries';
import { formatDate, formatINRCompact, PROJECT_STATUS_COLORS } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';

/** The client portal home: the projects the client's engineer or consultant is on. */
export default function PortalPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = usePortalProjects();
  return (
    <div className="page-container">
      <PageHeader title="My projects" subtitle={`Approved progress, daily reports, RA bills and inspections from ${user?.organizationName ?? 'the contractor'}.`} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <Skeleton active /> : null}
      {data && !data.length ? <Empty description="You have not been added to a project yet. Ask the contractor's project manager to add you." /> : null}
      <Row gutter={[16, 16]}>
        {(data ?? []).map((p) => (
          <Col key={p.id} xs={24} md={12} xl={8}>
            <Link href={`/portal/${p.id}`} style={{ display: 'block', height: '100%' }}>
              <Card hoverable style={{ height: '100%' }}>
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  <Space wrap size={6}>
                    <Typography.Text type="secondary">{p.code}</Typography.Text>
                    <Tag color={PROJECT_STATUS_COLORS[p.status]} style={{ margin: 0 }}>
                      {PROJECT_STATUS_LABELS[p.status]}
                    </Tag>
                    <Tag style={{ margin: 0 }}>{PROJECT_TYPE_LABELS[p.type]}</Tag>
                  </Space>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {p.name}
                  </Typography.Title>
                  <Typography.Text type="secondary">{[p.location, p.contractValue ? `Contract ${formatINRCompact(p.contractValue)}` : null].filter(Boolean).join(' · ')}</Typography.Text>
                  <div>
                    <Typography.Text style={{ fontSize: 12 }}>Physical progress</Typography.Text>
                    <Progress percent={p.physicalProgressPct} size="small" aria-label={`Physical progress ${p.physicalProgressPct}%`} />
                    {p.timeElapsedPct != null ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {p.timeElapsedPct}% of the contract period gone · ends {formatDate(p.endDate)}
                      </Typography.Text>
                    ) : null}
                  </div>
                  <Space wrap size={12}>
                    <Badge count={p.billsToCertify} showZero={false} offset={[8, 0]}>
                      <Typography.Text style={{ fontSize: 13 }}>Bills to certify</Typography.Text>
                    </Badge>
                    <Badge count={p.openInspections} showZero={false} offset={[8, 0]} color="purple">
                      <Typography.Text style={{ fontSize: 13 }}>Inspections requested</Typography.Text>
                    </Badge>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Last daily report: {p.lastDprDate ? formatDate(p.lastDprDate) : 'none yet'}
                  </Typography.Text>
                </Space>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
}
