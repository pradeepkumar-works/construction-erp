'use client';

import React, { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Progress, Space, Tabs, Typography } from 'antd';
import { EditOutlined, FilePdfOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { canEditProjects, canViewContract, canViewVariations, canViewCost, canViewPurchaseOrders, canViewWorkOrders } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProject } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectOverview } from '@/components/projects/ProjectOverview';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { SectorPanel, sectorTabLabel } from '@/components/sector/SectorPanel';
import { BoqTab } from '@/components/boq/BoqTab';
import { ActivitiesTab } from '@/components/activities/ActivitiesTab';
import { GanttPanel } from '@/components/schedule/GanttPanel';
import { ProgressList } from '@/components/progress/ProgressList';
import { DprList } from '@/components/dpr/DprList';
import { MachineryPanel } from '@/components/machinery/MachineryPanel';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { RiskList } from '@/components/risks/RiskList';
import { SafetyPanel } from '@/components/safety/SafetyPanel';
import { MeasurementList } from '@/components/measurements/MeasurementList';
import { ProjectQualityTab } from '@/components/quality/QualityTabs';
import { ProjectDocumentsTab } from '@/components/documents/DocumentTabs';
import { ProjectCostPanel } from '@/components/cost/ProjectCostPanel';
import { ProjectBudgetPanel } from '@/components/cost/ProjectBudgetPanel';
import { ContractPanel } from '@/components/contracts/ContractPanel';
import { VariationsPanel } from '@/components/variations/VariationsPanel';
import { BillList } from '@/components/bills/BillList';
import { StockPanel } from '@/components/stock/StockPanel';
import { AttendanceList } from '@/components/attendance/AttendanceList';
import { MrList } from '@/components/material/MrList';
import { PurchaseOrderList } from '@/components/purchasing/PurchaseOrderList';
import { SubcontractsPanel } from '@/components/subcontracts/SubcontractsPanel';

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
            <Link href={`/reports?projectId=${project.id}`}>
              <Button icon={<FilePdfOutlined />}>Progress report</Button>
            </Link>
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
            ...(user && canViewContract(user.roleKey) ? [{ key: 'contract', label: 'Contract', children: <ContractPanel projectId={project.id} /> }] : []),
            ...(user && canViewContract(user.roleKey) ? [{ key: 'bills', label: 'RA Bills', children: <BillList projectId={project.id} /> }] : []),
            ...(user && canViewVariations(user.roleKey) ? [{ key: 'variations', label: 'Variations', children: <VariationsPanel projectId={project.id} /> }] : []),
            { key: 'boq', label: 'BOQ', children: <BoqTab projectId={project.id} /> },
            { key: 'activities', label: 'Activities', children: <ActivitiesTab projectId={project.id} members={project.members} project={project} /> },
            { key: 'schedule', label: 'Gantt', children: <GanttPanel projectId={project.id} /> },
            { key: 'sector', label: sectorTabLabel(project.type), children: <SectorPanel project={project} editable={editor} /> },
            { key: 'mb', label: 'Measurements', children: <MeasurementList projectId={project.id} /> },
            { key: 'inspections', label: 'Quality', children: <ProjectQualityTab projectId={project.id} /> },
            { key: 'documents', label: 'Documents', children: <ProjectDocumentsTab projectId={project.id} /> },
            { key: 'progress', label: 'Progress', children: <ProgressList projectId={project.id} newLabel="New progress entry" /> },
            { key: 'dpr', label: 'Daily Reports', children: <DprList projectId={project.id} newLabel="New DPR" /> },
            { key: 'attendance', label: 'Attendance', children: <AttendanceList projectId={project.id} /> },
            { key: 'material', label: 'Material Requests', children: <MrList projectId={project.id} newLabel="New material request" /> },
            ...(user && canViewPurchaseOrders(user.roleKey) ? [{ key: 'po', label: 'Purchase Orders', children: <PurchaseOrderList projectId={project.id} /> }] : []),
            ...(user && canViewWorkOrders(user.roleKey) ? [{ key: 'subcontracts', label: 'Subcontracts', children: <SubcontractsPanel projectId={project.id} /> }] : []),
            { key: 'stock', label: 'Stock', children: <StockPanel projectId={project.id} /> },
            { key: 'machinery', label: 'Machinery', children: <MachineryPanel projectId={project.id} /> },
            { key: 'expenses', label: 'Expenses', children: <ExpenseList projectId={project.id} /> },
            { key: 'risks', label: 'Delays & Risks', children: <RiskList projectId={project.id} /> },
            { key: 'safety', label: 'Safety', children: <SafetyPanel projectId={project.id} /> },
            ...(user && canViewCost(user.roleKey) ? [{ key: 'cost', label: 'Cost', children: <ProjectCostPanel projectId={project.id} /> }] : []),
            ...(user && canViewCost(user.roleKey) ? [{ key: 'budget', label: 'Budget & Cash Flow', children: <ProjectBudgetPanel projectId={project.id} /> }] : []),
          ]}
        />
      </Card>
      <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} project={project} />
    </div>
  );
}
