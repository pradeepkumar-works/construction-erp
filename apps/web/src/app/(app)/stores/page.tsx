'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Empty, Flex, Row, Statistic, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { PlusOutlined } from '@ant-design/icons';
import { canEditProjects, type StoreSummaryDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useStores } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { LinkButton } from '@/components/common/LinkButton';
import { ProjectStatusTag } from '@/components/common/StatusTag';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';

/**
 * Central stores and yards (v6 item 106): each one is a project of type STORE, so it receives on GRNs and purchase
 * orders, sends to sites by transfer (in transit until the site receives it) and is counted like any site's store.
 */
export default function StoresPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useStores();
  const [adding, setAdding] = useState(false);
  const canAdd = !!user && canEditProjects(user.roleKey);
  const newButton = canAdd ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      New store
    </Button>
  ) : null;
  return (
    <div className="page-container">
      <PageHeader title="Central stores" subtitle="Company stores and yards: what each holds and is worth, and what is on the road to and from the sites." extra={newButton} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="home" /> : null}
      {data && !data.length ? (
        <Card>
          <Empty description="No central store yet. Add one to hold stock for the sites and send it out by transfer.">{newButton}</Empty>
        </Card>
      ) : null}
      <Row gutter={[16, 16]}>
        {(data ?? []).map((s) => (
          <Col key={s.id} xs={24} lg={12}>
            <StoreCard store={s} />
          </Col>
        ))}
      </Row>
      <ProjectFormModal open={adding} initialType="STORE" onClose={() => setAdding(false)} onSaved={(id) => router.push(`/stores/${id}`)} />
    </div>
  );
}

function StoreCard({ store: s }: { store: StoreSummaryDto }) {
  const { token } = theme.useToken();
  return (
    <Card style={{ height: '100%' }}>
      <Flex justify="space-between" align="flex-start" gap={8} wrap>
        <div>
          <Typography.Title level={2} style={{ fontSize: token.fontSizeHeading4, margin: 0 }} translate="no">
            {s.name}
          </Typography.Title>
          <Typography.Text type="secondary" translate="no">
            {[s.code, s.location].filter(Boolean).join(' · ')}
          </Typography.Text>
        </div>
        <ProjectStatusTag status={s.status} />
      </Flex>
      <Row gutter={[12, 12]} style={{ marginTop: token.marginMD }}>
        <Col xs={12} sm={8}>
          <Statistic title="Items in stock" value={s.items} />
        </Col>
        {s.value !== null ? (
          <Col xs={12} sm={8}>
            <Statistic title="Stock value" value={0} formatter={() => <span translate="no">{formatINR(s.value)}</span>} />
          </Col>
        ) : null}
        <Col xs={12} sm={8}>
          <Statistic title="Last movement" value={0} formatter={() => formatDate(s.lastMovement)} />
        </Col>
      </Row>
      <Flex gap={8} wrap style={{ marginTop: token.marginSM }}>
        {s.low ? <AppTag tone="danger">{`${s.low} item${s.low === 1 ? '' : 's'} below minimum`}</AppTag> : null}
        {s.outInTransit ? <AppTag tone="info">{`${s.outInTransit} transfer${s.outInTransit === 1 ? '' : 's'} on the road to sites`}</AppTag> : null}
        {s.inInTransit ? <AppTag tone="pending">{`${s.inInTransit} coming in to receive`}</AppTag> : null}
      </Flex>
      <LinkButton href={`/stores/${s.id}`} style={{ marginTop: token.marginMD }} aria-label={`Open store: ${s.name}`}>
        Open store
      </LinkButton>
    </Card>
  );
}
