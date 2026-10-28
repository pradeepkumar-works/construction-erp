'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Progress, Space, Typography } from 'antd';
import { EditOutlined, FilePdfOutlined } from '@/components/common/icons';
import type { ProjectDetail } from '@erp/shared';
import { canEditProjects, isGuest, canViewContract, canViewVariations, canViewCost, canViewPurchaseOrders, canViewReconciliation, canViewWorkOrders, canViewEpc, canViewOm } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProject } from '@/lib/queries';
import { readPref, writePref } from '@/lib/prefs';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectOverview } from '@/components/projects/ProjectOverview';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { ProjectHealth, useProjectHealth } from '@/components/projects/ProjectHealth';
import { CompactTitle, ProjectWorkspace, type WorkspaceTab } from '@/components/projects/ProjectWorkspace';
import { SectorPanel, sectorTabLabel } from '@/components/sector/SectorPanel';
import { StructurePanel } from '@/components/structure/StructurePanel';
import { PipeNetworkPanel } from '@/components/pipes/PipeNetworkPanel';
import { EpcPanel } from '@/components/epc/EpcPanel';
import { OmPanel } from '@/components/om/OmPanel';
import { BoqTab } from '@/components/boq/BoqTab';
import { ActivitiesTab } from '@/components/activities/ActivitiesTab';
import { GanttPanel } from '@/components/schedule/GanttPanel';
import { LookaheadPanel } from '@/components/schedule/LookaheadPanel';
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
import { EarnedValuePanel } from '@/components/cost/EarnedValuePanel';
import { ContractPanel } from '@/components/contracts/ContractPanel';
import { VariationsPanel } from '@/components/variations/VariationsPanel';
import { BillList } from '@/components/bills/BillList';
import { StockPanel } from '@/components/stock/StockPanel';
import { ReconciliationPanel } from '@/components/reconciliation/ReconciliationPanel';
import { AttendancePanel } from '@/components/workers/AttendancePanel';
import { MrList } from '@/components/material/MrList';
import { PurchaseOrderList } from '@/components/purchasing/PurchaseOrderList';
import { SubcontractsPanel } from '@/components/subcontracts/SubcontractsPanel';
import { HandoverPanel } from '@/components/handover/HandoverPanel';
import { AskButton } from '@/components/ai/AskButton';
import { LinkButton } from '@/components/common/LinkButton';
import { themeFontSize } from '@/lib/theme';

const tabPref = (projectId: string) => `nirmaan.project.tab.${projectId}`;

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: project, isLoading, error, refetch } = useProject(id);
  const router = useRouter();
  // A central store has no works; its page is the store's (v6 item 106).
  const store = project?.type === 'STORE';
  useEffect(() => {
    if (store && id) router.replace(`/stores/${id}`);
  }, [store, id, router]);

  if (isLoading || store)
    return (
      <div className="page-container">
        <PageSkeleton shape="workspace" />
      </div>
    );
  if (error || !project) {
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Project not found')} onRetry={() => refetch()} />
      </div>
    );
  }
  return <ProjectPage project={project} />;
}

function ProjectPage({ project }: { project: ProjectDetail }) {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const health = useProjectHealth(project);
  const editor = !!user && canEditProjects(user.roleKey) && user.roleKey !== 'QUANTITY_SURVEYOR';
  const can = (allowed: boolean) => !!user && allowed;

  const all: (WorkspaceTab | false)[] = [
    { key: 'overview', group: 'overview', label: 'Overview', children: <ProjectOverview project={project} /> },
    { key: 'structure', group: 'plan', label: 'Structure', children: <StructurePanel project={project} /> },
    can(project.pipeNetwork) && { key: 'pipes', group: 'plan', label: 'Pipe network', children: <PipeNetworkPanel project={project} /> },
    can(project.contractModel === 'EPC' && !!user && canViewEpc(user.roleKey)) && { key: 'epc', group: 'plan', label: 'Engineering and packages', children: <EpcPanel project={project} /> },
    { key: 'boq', group: 'plan', label: 'BOQ', children: <BoqTab projectId={project.id} /> },
    { key: 'activities', group: 'plan', label: 'Activities', children: <ActivitiesTab projectId={project.id} members={project.members} project={project} /> },
    { key: 'schedule', group: 'plan', label: 'Gantt', children: <GanttPanel projectId={project.id} /> },
    { key: 'lookahead', group: 'plan', label: 'Look-ahead', children: <LookaheadPanel projectId={project.id} /> },
    project.locations.length > 0 && { key: 'sector', group: 'plan', label: sectorTabLabel(project), children: <SectorPanel project={project} editable={editor} /> },
    { key: 'progress', group: 'site', label: 'Progress', children: <ProgressList projectId={project.id} newLabel="New progress entry" /> },
    { key: 'dpr', group: 'site', label: 'Daily reports', children: <DprList projectId={project.id} newLabel="New daily report" /> },
    { key: 'attendance', group: 'site', label: 'Attendance', children: <AttendancePanel projectId={project.id} /> },
    { key: 'mb', group: 'site', label: 'Measurements', children: <MeasurementList projectId={project.id} /> },
    { key: 'inspections', group: 'site', label: 'Quality', children: <ProjectQualityTab projectId={project.id} /> },
    can(!user?.modulesOff?.includes('safety')) && { key: 'safety', group: 'site', label: 'Safety', children: <SafetyPanel projectId={project.id} /> },
    { key: 'risks', group: 'site', label: 'Delays and risks', children: <RiskList projectId={project.id} /> },
    { key: 'documents', group: 'site', label: 'Documents', children: <ProjectDocumentsTab projectId={project.id} /> },
    { key: 'material', group: 'materials', label: 'Material requests', children: <MrList projectId={project.id} newLabel="New material request" /> },
    can(!!user && canViewPurchaseOrders(user.roleKey)) && { key: 'po', group: 'materials', label: 'Purchase orders', children: <PurchaseOrderList projectId={project.id} /> },
    { key: 'stock', group: 'materials', label: 'Stock', children: <StockPanel projectId={project.id} /> },
    can(!!user && canViewReconciliation(user.roleKey)) && { key: 'reconciliation', group: 'materials', label: 'Reconciliation', children: <ReconciliationPanel projectId={project.id} network={project.pipeNetwork} /> },
    { key: 'machinery', group: 'materials', label: 'Machinery', children: <MachineryPanel projectId={project.id} /> },
    can(!!user && canViewContract(user.roleKey)) && { key: 'contract', group: 'money', label: 'Contract', children: <ContractPanel projectId={project.id} /> },
    can(!!user && canViewContract(user.roleKey)) && { key: 'bills', group: 'money', label: 'RA bills', children: <BillList projectId={project.id} /> },
    can(!!user && canViewVariations(user.roleKey)) && { key: 'variations', group: 'money', label: 'Variations', children: <VariationsPanel projectId={project.id} /> },
    can(!!user && canViewWorkOrders(user.roleKey)) && { key: 'subcontracts', group: 'money', label: 'Subcontracts', children: <SubcontractsPanel projectId={project.id} /> },
    { key: 'expenses', group: 'money', label: 'Expenses', children: <ExpenseList projectId={project.id} /> },
    can(!!user && canViewCost(user.roleKey)) && { key: 'cost', group: 'money', label: 'Cost', children: <ProjectCostPanel projectId={project.id} /> },
    can(!!user && canViewCost(user.roleKey)) && { key: 'budget', group: 'money', label: 'Budget and cash flow', children: <ProjectBudgetPanel projectId={project.id} /> },
    can(!!user && canViewCost(user.roleKey)) && { key: 'earned-value', group: 'money', label: 'Earned value', children: <EarnedValuePanel projectId={project.id} /> },
    can(!!user && !isGuest(user.roleKey)) && { key: 'handover', group: 'handover', label: 'Handover', children: <HandoverPanel projectId={project.id} members={project.members} initialDefectId={search.get('defect') ?? undefined} /> },
    can(!!project.handedOverOn && !!user && canViewOm(user.roleKey)) && { key: 'om', group: 'handover', label: 'O&M', children: <OmPanel project={project} /> },
  ];
  const tabs = all.filter((t): t is WorkspaceTab => !!t);

  // ?tab= wins (links from elsewhere); without it, the tab last open on this project in this browser. The remembered
  // tab only places the page as it opens: once a tab is picked the URL alone says which, so Overview (no ?tab=) opens.
  const fromUrl = search.get('tab');
  const [remembered, setRemembered] = useState(() => readPref<string | null>(tabPref(project.id), null));
  const active = tabs.find((t) => t.key === (fromUrl ?? remembered))?.key ?? 'overview';
  useEffect(() => writePref(tabPref(project.id), active), [project.id, active]);

  const open = (key: string) => {
    setRemembered(null);
    const sp = new URLSearchParams(search.toString());
    sp.delete('defect');
    // A tab's own tabs (`?sub=`, UX item 84) start again on the first in the next tab.
    sp.delete('sub');
    if (key === 'overview') sp.delete('tab');
    else sp.set('tab', key);
    const qs = sp.toString();
    router.replace(`/projects/${project.id}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  return (
    <div className="page-container">
      <div ref={headerRef}>
      <PageHeader
        crumbs={[{ title: 'Projects', href: '/projects' }, { title: project.code }]}
        docTitle={project.name}
        title={
          <Space wrap size={8}>
            <span>{project.name}</span>
            <ProjectStatusTag status={project.status} />
            <ProjectTypeTag type={project.type} name={project.typeName} />
          </Space>
        }
        subtitle={
          <Space orientation="vertical" size={8}>
            <Space size={16} wrap>
              <span>{project.code}</span>
              {project.clientName && <span>Client: {project.clientName}</span>}
              {project.location && <span>{project.location}</span>}
              {project.projectManagerName && <span>PM: {project.projectManagerName}</span>}
            </Space>
            <ProjectHealth signals={health} />
          </Space>
        }
        extra={
          <Space wrap>
            <div style={{ width: 160 }}>
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                Physical progress
              </Typography.Text>
              <Progress percent={project.physicalProgressPct} size="small" aria-label={`Physical progress ${project.physicalProgressPct}%`} />
            </div>
            <AskButton question={`Summarise this week on ${project.code} ${project.name}.`} label="Summarise this week" title="Ask Nirmaan for this week on this project: work against plan, labour, machines, materials, bills, risks and decisions" />
            <LinkButton href={`/reports?projectId=${project.id}`} icon={<FilePdfOutlined />}>
              Progress report
            </LinkButton>
            {editor && (
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
          </Space>
        }
      />
      </div>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <ProjectWorkspace
          tabs={tabs}
          active={active}
          onChange={open}
          headerRef={headerRef}
          compactTitle={
            <CompactTitle code={project.code} name={project.name}>
              <ProjectHealth signals={health} compact />
            </CompactTitle>
          }
        />
      </Card>
      <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} project={project} />
    </div>
  );
}
