'use client';

import React, { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Progress, Space, Tabs, Typography } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { canEditProjects } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDprList, useMaterialRequests, useProgressList, useProject } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectOverview } from '@/components/projects/ProjectOverview';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { BoqTab } from '@/components/boq/BoqTab';
import { ActivitiesTab } from '@/components/activities/ActivitiesTab';
import { ProgressTable } from '@/components/progress/ProgressTable';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { ProgressFormModal } from '@/components/progress/ProgressFormModal';
import { DprTable } from '@/components/dpr/DprTable';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { DprFormModal } from '@/components/dpr/DprFormModal';
import { MrTable } from '@/components/material/MrTable';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MrFormModal } from '@/components/material/MrFormModal';

function ProgressTab({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useProgressList({ projectId, limit: 200 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
          New progress entry
        </Button>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ProgressTable data={data ?? []} loading={isLoading} onOpen={setOpenId} />
      <ProgressDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <ProgressFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} />
    </div>
  );
}

function DprTab({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useDprList({ projectId, limit: 200 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
          New DPR
        </Button>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <DprTable data={data ?? []} loading={isLoading} onOpen={setOpenId} />
      <DprDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <DprFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} />
    </div>
  );
}

function MrTab({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useMaterialRequests({ projectId, limit: 200 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
          New material request
        </Button>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <MrTable data={data ?? []} loading={isLoading} onOpen={setOpenId} />
      <MrDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <MrFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} />
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get('tab') ?? 'overview';
  const { user } = useAuth();
  const { data: project, isLoading, error, refetch } = useProject(id);
  const [editOpen, setEditOpen] = useState(false);
  const editor = !!user && canEditProjects(user.roleKey) && user.roleKey !== 'QUANTITY_SURVEYOR';

  if (isLoading) return <Loading />;
  if (error || !project) {
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Project not found')} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        crumbs={[{ title: 'Projects', href: '/projects' }, { title: project.code }]}
        title={
          <Space wrap size={8}>
            <span>{project.name}</span>
            <ProjectStatusTag status={project.status} />
            <ProjectTypeTag type={project.type} />
          </Space>
        }
        subtitle={
          <Space size={16} wrap>
            <span>{project.code}</span>
            {project.clientName && <span>Client: {project.clientName}</span>}
            {project.location && <span>{project.location}</span>}
            {project.projectManagerName && <span>PM: {project.projectManagerName}</span>}
          </Space>
        }
        extra={
          <Space>
            <div style={{ width: 160 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Physical progress
              </Typography.Text>
              <Progress percent={project.physicalProgressPct} size="small" />
            </div>
            {editor && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
          </Space>
        }
      />
      <Card size="small" styles={{ body: { paddingTop: 4 } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => router.replace(`/projects/${project.id}${k === 'overview' ? '' : `?tab=${k}`}`)}
          items={[
            { key: 'overview', label: 'Overview', children: <ProjectOverview project={project} /> },
            { key: 'boq', label: 'BOQ', children: <BoqTab projectId={project.id} /> },
            { key: 'activities', label: 'Activities', children: <ActivitiesTab projectId={project.id} members={project.members} /> },
            { key: 'progress', label: 'Progress', children: <ProgressTab projectId={project.id} /> },
            { key: 'dpr', label: 'Daily Reports', children: <DprTab projectId={project.id} /> },
            { key: 'material', label: 'Material Requests', children: <MrTab projectId={project.id} /> },
          ]}
        />
      </Card>
      <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} project={project} />
    </div>
  );
}
