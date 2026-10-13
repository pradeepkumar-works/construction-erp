'use client';

import React, { useState } from 'react';
import { Button, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SubmissionStatus } from '@erp/shared';
import { useMaterialRequests } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { MrTable } from '@/components/material/MrTable';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MrFormModal } from '@/components/material/MrFormModal';

export default function MaterialRequestsPage() {
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, error, refetch } = useMaterialRequests({ projectId, status, limit: 200 });

  return (
    <div className="page-container">
      <PageHeader
        title="Material Requests"
        subtitle="Material indents raised from site for procurement"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            New material request
          </Button>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        <ListToolbar projectId={projectId} onProject={setProjectId} status={status} onStatus={setStatus} />
        <MrTable data={data ?? []} loading={isLoading} showProject onOpen={setOpenId} />
      </Card>
      <MrDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <MrFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
