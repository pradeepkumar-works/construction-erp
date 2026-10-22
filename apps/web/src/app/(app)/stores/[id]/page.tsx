'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Col, Row, Statistic, theme } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { canEditProjects } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProject, useStores } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag } from '@/components/common/StatusTag';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { StockPanel } from '@/components/stock/StockPanel';

/** One central store (v6 item 106): its stock, register, value and ageing, and the transfers coming in to receive. */
export default function StorePage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: project, isLoading, error, refetch } = useProject(id);
  const { data: stores } = useStores();
  const [editing, setEditing] = useState(false);
  const summary = stores?.find((s) => s.id === id);
  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="list" />
      </div>
    );
  if (error || !project)
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Store not found')} onRetry={() => refetch()} />
      </div>
    );
  const stat = (title: string, value: React.ReactNode) => (
    <Col xs={12} md={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4 } }} />
      </Card>
    </Col>
  );
  return (
    <div className="page-container">
      <PageHeader
        title={<span translate="no">{project.name}</span>}
        docTitle={project.name}
        crumbs={[{ title: 'Central stores', href: '/stores' }, { title: project.code }]}
        subtitle={
          <span>
            <ProjectStatusTag status={project.status} /> <span translate="no">{project.location ?? ''}</span>
          </span>
        }
        extra={
          user && canEditProjects(user.roleKey) ? (
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit store
            </Button>
          ) : null
        }
      />
      {summary ? (
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
          {stat('Items in stock', summary.items)}
          {summary.value !== null ? stat('Stock value', <span translate="no">{formatINR(summary.value)}</span>) : null}
          {stat('On the road to sites', summary.outInTransit)}
          {stat('Coming in to receive', summary.inInTransit)}
        </Row>
      ) : null}
      <Card size="small">
        <StockPanel projectId={project.id} />
      </Card>
      <ProjectFormModal open={editing} project={project} onClose={() => setEditing(false)} />
    </div>
  );
}
