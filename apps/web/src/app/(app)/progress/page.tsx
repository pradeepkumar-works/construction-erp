'use client';

import React, { useState } from 'react';
import { Button, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SubmissionStatus } from '@erp/shared';
import { useProgressList } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ProgressTable } from '@/components/progress/ProgressTable';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { ProgressFormModal } from '@/components/progress/ProgressFormModal';

export default function ProgressPage() {
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, error, refetch } = useProgressList({ projectId, status, limit: 200 });

  return (
    <div className="page-container">
      <PageHeader
        title="Progress Entries"
        subtitle="Quantity-wise daily progress reported from site against activities"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            New progress entry
          </Button>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        <ListToolbar projectId={projectId} onProject={setProjectId} status={status} onStatus={setStatus} />
        <ProgressTable data={data ?? []} loading={isLoading} showProject onOpen={setOpenId} />
      </Card>
      <ProgressDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <ProgressFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
