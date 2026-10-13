'use client';

import React, { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Progress, Space, Tabs, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { canEditProjects } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProject } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectOverview } from '@/components/projects/ProjectOverview';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { BoqTab } from '@/components/boq/BoqTab';
import { ActivitiesTab } from '@/components/activities/ActivitiesTab';
import { ProgressList } from '@/components/progress/ProgressList';
import { DprList } from '@/components/dpr/DprList';
import { MrList } from '@/components/material/MrList';

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
            { key: 'progress', label: 'Progress', children: <ProgressList projectId={project.id} newLabel="New progress entry" /> },
            { key: 'dpr', label: 'Daily Reports', children: <DprList projectId={project.id} newLabel="New DPR" /> },
            { key: 'material', label: 'Material Requests', children: <MrList projectId={project.id} newLabel="New material request" /> },
          ]}
        />
      </Card>
      <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} project={project} />
    </div>
  );
}
