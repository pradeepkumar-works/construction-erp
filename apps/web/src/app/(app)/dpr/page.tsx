'use client';

import React, { useState } from 'react';
import { Button, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { DailyReportDto, SubmissionStatus } from '@erp/shared';
import { useDprList } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { DprTable } from '@/components/dpr/DprTable';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { DprFormModal } from '@/components/dpr/DprFormModal';

export default function DprPage() {
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyReportDto | null>(null);
  const { data, isLoading, error, refetch } = useDprList({ projectId, status, limit: 200 });

  return (
    <div className="page-container">
      <PageHeader
        title="Daily Progress Reports"
        subtitle="Site diary: manpower, machinery, work executed, safety and issues"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            New DPR
          </Button>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        <ListToolbar projectId={projectId} onProject={setProjectId} status={status} onStatus={setStatus} />
        <DprTable data={data ?? []} loading={isLoading} showProject onOpen={setOpenId} onEdit={setEditing} />
      </Card>
      <DprDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <DprFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    </div>
  );
}
