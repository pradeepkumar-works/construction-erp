'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Dropdown, Progress, Space } from 'antd';
import type { MenuProps } from 'antd';
import { EditOutlined, FilePdfOutlined, MoreOutlined } from '@/components/common/icons';
import type { ProjectDetail } from '@erp/shared';
import { canManageProjects, isGuest, canViewContract, canViewVariations, canViewCost, canViewPurchaseOrders, canViewReconciliation, canViewWorkOrders, canViewEpc, canViewOm, canViewProgramme } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProject } from '@/lib/queries';
import { readPref, writePref } from '@/lib/prefs';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectOverview } from '@/components/projects/ProjectOverview';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { ProjectHealth, useProjectHealth } from '@/components/projects/ProjectHealth';
import { CompactTitle, ProjectWorkspace, workspaceTabs, type WorkspaceTab } from '@/components/projects/ProjectWorkspace';
import { AreaSummary } from '@/components/projects/summaries/AreaSummary';
import { SectorPanel, sectorTabLabel } from '@/components/sector/SectorPanel';
import { StructurePanel } from '@/components/structure/StructurePanel';
import { PipeNetworkPanel } from '@/components/pipes/PipeNetworkPanel';
import { EpcPanel } from '@/components/epc/EpcPanel';
import { OmPanel } from '@/components/om/OmPanel';
import { BoqTab } from '@/components/boq/BoqTab';
import { ActivitiesTab } from '@/components/activities/ActivitiesTab';
import { GanttPanel } from '@/components/schedule/GanttPanel';
import { PhotoTimeline } from '@/components/site-photos/PhotoTimeline';
import { LookaheadPanel } from '@/components/schedule/LookaheadPanel';
import { ProgrammeTab } from '@/components/programme/ProgrammeTab';
import { ProgressList } from '@/components/progress/ProgressList';
import { DprList } from '@/components/dpr/DprList';
import { MachineryPanel } from '@/components/machinery/MachineryPanel';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { RiskList } from '@/components/risks/RiskList';
import { SafetyPanel } from '@/components/safety/SafetyPanel';
import { MeasurementList } from '@/components/measurements/MeasurementList';
import { ProjectQualityTab } from '@/components/quality/QualityTabs';
import { SiteOrdersTab } from '@/components/site-orders/SiteOrdersTab';
import { ProjectDocumentsTab } from '@/components/documents/DocumentTabs';
import { ProjectCostPanel } from '@/components/cost/ProjectCostPanel';
import { ProjectBudgetPanel } from '@/components/cost/ProjectBudgetPanel';
import { EarnedValuePanel } from '@/components/cost/EarnedValuePanel';
import { ContractPanel } from '@/components/contracts/ContractPanel';
import { VariationsPanel } from '@/components/variations/VariationsPanel';
import { ExcessSavingPanel } from '@/components/excess-saving/ExcessSavingPanel';
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
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import { tk } from '@/ds';
import { useAsk } from '@/lib/ask';
import { formatPct } from '@/lib/format';
import { useIsPhone } from '@/lib/screen';

const tabPref = (projectId: string) => `nirmaan.project.tab.${projectId}`;

const summariseQuestion = (p: ProjectDetail) => `Summarise this week on ${p.code} ${p.name}.`;
const SUMMARISE_TITLE = 'Ask Nirmaan for this week on this project: work against plan, labour, machines, materials, bills, risks and decisions';
const reportHref = (p: ProjectDetail) => `/reports?projectId=${p.id}`;

/** The project's code, client, place and manager, under its name. */
function ProjectFacts({ project }: { project: ProjectDetail }) {
  return (
    <Space size={16} wrap>
      <span translate="no">{project.code}</span>
      {project.clientName && <span>Client: {project.clientName}</span>}
      {project.location && <span>{project.location}</span>}
      {project.projectManagerName && <span>PM: {project.projectManagerName}</span>}
    </Space>
  );
}

function PhysicalProgress({ pct }: { pct: number }) {
  return (
    <div style={{ width: 160 }}>
      <span style={{ ...tk.type.caption, color: tk.color.text.muted }}>Physical progress</span>
      <Progress percent={pct} size="small" format={() => formatPct(pct)} aria-label={`Physical progress ${formatPct(pct)}`} />
    </div>
  );
}

/**
 * On a phone the header keeps the name and the health chips; the project's facts, its progress and the actions fold into
 * one ⋯ menu, so the tabs start near the top of the screen.
 */
function ProjectMenu({ project, editor, onEdit }: { project: ProjectDetail; editor: boolean; onEdit: () => void }) {
  const router = useRouter();
  const ask = useAsk();
  const items: MenuProps['items'] = [
    ...(ask.available ? [{ key: 'ask', icon: <SparkleIcon />, label: 'Summarise this week' }] : []),
    { key: 'report', icon: <FilePdfOutlined />, label: 'Progress report' },
    ...(editor ? [{ key: 'edit', icon: <EditOutlined />, label: 'Edit project' }] : []),
  ];
  const run: Record<string, () => void> = { ask: () => ask.ask(summariseQuestion(project)), report: () => router.push(reportHref(project)), edit: onEdit };
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{ items, onClick: ({ key }) => run[key]?.() }}
      popupRender={(menu) => (
        <div style={{ background: tk.color.surface.raised, borderRadius: tk.radius.lg, boxShadow: tk.shadow.float, maxWidth: `calc(100vw - 2 * ${tk.space[4]})` }}>
          <div style={{ ...tk.type.caption, color: tk.color.text.muted, padding: `${tk.space[3]} ${tk.space[3]} ${tk.space[2]}`, display: 'flex', flexDirection: 'column', gap: tk.space[1] }}>
            <ProjectFacts project={project} />
            <span>Physical progress {formatPct(project.physicalProgressPct)}</span>
          </div>
          {React.isValidElement<{ style?: React.CSSProperties }>(menu) ? React.cloneElement(menu, { style: { boxShadow: 'none' } }) : menu}
        </div>
      )}
    >
      <Button icon={<MoreOutlined />} aria-label="Project details and actions" />
    </Dropdown>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: project, isLoading, error, refetch } = useProject(id);
  const router = useRouter();
  // A central store has no works; its page is the store's.
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
  const phone = useIsPhone();
  const editor = !!user && canManageProjects(user.roleKey);
  const can = (allowed: boolean) => !!user && allowed;

  const all: (WorkspaceTab | false)[] = [
    { key: 'overview', group: 'overview', label: 'Overview', children: <ProjectOverview project={project} /> },
    { key: 'plan-summary', group: 'plan', label: 'Summary', children: <AreaSummary project={project} area="plan" /> },
    { key: 'structure', group: 'plan', label: 'Components', children: <StructurePanel project={project} /> },
    can(project.pipeNetwork) && { key: 'pipes', group: 'plan', label: 'Pipe network', children: <PipeNetworkPanel project={project} /> },
    can(project.contractModel === 'EPC' && !!user && canViewEpc(user.roleKey)) && { key: 'epc', group: 'plan', label: 'Engineering and packages', children: <EpcPanel project={project} /> },
    { key: 'boq', group: 'plan', label: 'BOQ', children: <BoqTab projectId={project.id} /> },
    { key: 'activities', group: 'plan', label: 'Activities', children: <ActivitiesTab projectId={project.id} members={project.members} project={project} /> },
    { key: 'schedule', group: 'plan', label: 'Schedule', children: <GanttPanel projectId={project.id} /> },
    { key: 'lookahead', group: 'plan', label: 'Look-ahead', children: <LookaheadPanel projectId={project.id} /> },
    can(!!user && canViewProgramme(user.roleKey)) && { key: 'programme', group: 'plan', label: 'Programme and EOT', children: <ProgrammeTab projectId={project.id} initialOpenId={search.get('eot') ?? search.get('revision') ?? undefined} /> },
    project.locations.length > 0 && { key: 'sector', group: 'plan', label: sectorTabLabel(project), children: <SectorPanel project={project} editable={editor} /> },
    { key: 'site-summary', group: 'site', label: 'Summary', children: <AreaSummary project={project} area="site" /> },
    { key: 'progress', group: 'site', label: 'Progress entries', children: <ProgressList projectId={project.id} newLabel="New progress entry" /> },
    { key: 'dpr', group: 'site', label: 'Daily reports', children: <DprList projectId={project.id} newLabel="New daily report" /> },
    { key: 'photos', group: 'site', label: 'Photos', children: <PhotoTimeline projectId={project.id} /> },
    { key: 'attendance', group: 'site', label: 'Attendance', children: <AttendancePanel projectId={project.id} /> },
    { key: 'mb', group: 'site', label: 'Measurement book', children: <MeasurementList projectId={project.id} /> },
    { key: 'inspections', group: 'site', label: 'Quality', children: <ProjectQualityTab projectId={project.id} /> },
    { key: 'site-orders', group: 'site', label: 'Site orders', children: <SiteOrdersTab projectId={project.id} initialOrderId={search.get('order') ?? undefined} /> },
    can(!user?.modulesOff?.includes('safety')) && { key: 'safety', group: 'site', label: 'Safety', children: <SafetyPanel projectId={project.id} /> },
    { key: 'risks', group: 'site', label: 'Delays and risks', children: <RiskList projectId={project.id} /> },
    { key: 'documents', group: 'site', label: 'Documents', children: <ProjectDocumentsTab projectId={project.id} /> },
    { key: 'materials-summary', group: 'materials', label: 'Summary', children: <AreaSummary project={project} area="materials" /> },
    { key: 'material', group: 'materials', label: 'Indents', children: <MrList projectId={project.id} newLabel="New indent" /> },
    can(!!user && canViewPurchaseOrders(user.roleKey)) && { key: 'po', group: 'materials', label: 'Purchase orders', children: <PurchaseOrderList projectId={project.id} /> },
    { key: 'stock', group: 'materials', label: 'Stock', children: <StockPanel projectId={project.id} /> },
    can(!!user && canViewReconciliation(user.roleKey)) && { key: 'reconciliation', group: 'materials', label: 'Material reconciliation', children: <ReconciliationPanel projectId={project.id} network={project.pipeNetwork} /> },
    { key: 'machinery', group: 'materials', label: 'Machinery', children: <MachineryPanel projectId={project.id} /> },
    { key: 'money-summary', group: 'money', label: 'Summary', children: <AreaSummary project={project} area="money" /> },
    can(!!user && canViewContract(user.roleKey)) && { key: 'contract', group: 'money', label: 'Contract', children: <ContractPanel projectId={project.id} /> },
    can(!!user && canViewContract(user.roleKey)) && { key: 'bills', group: 'money', label: 'RA bills', children: <BillList projectId={project.id} /> },
    can(!!user && canViewVariations(user.roleKey)) && { key: 'variations', group: 'money', label: 'Variations', children: <VariationsPanel projectId={project.id} /> },
    can(!!user && canViewVariations(user.roleKey)) && { key: 'excess-saving', group: 'money', label: 'Excess and saving', children: <ExcessSavingPanel projectId={project.id} /> },
    can(!!user && canViewWorkOrders(user.roleKey)) && { key: 'subcontracts', group: 'money', label: 'Subcontracts', children: <SubcontractsPanel projectId={project.id} /> },
    { key: 'expenses', group: 'money', label: 'Site expenses', children: <ExpenseList projectId={project.id} /> },
    can(!!user && canViewCost(user.roleKey)) && { key: 'cost', group: 'money', label: 'Cost', children: <ProjectCostPanel projectId={project.id} /> },
    can(!!user && canViewCost(user.roleKey)) && { key: 'budget', group: 'money', label: 'Budget and cash flow', children: <ProjectBudgetPanel projectId={project.id} /> },
    can(!!user && canViewCost(user.roleKey)) && { key: 'earned-value', group: 'money', label: 'Earned value', children: <EarnedValuePanel projectId={project.id} /> },
    can(!!user && !isGuest(user.roleKey)) && { key: 'handover', group: 'handover', label: 'Handover and closure', children: <HandoverPanel projectId={project.id} members={project.members} initialDefectId={search.get('defect') ?? undefined} /> },
    can(!!project.handedOverOn && !!user && canViewOm(user.roleKey)) && { key: 'om', group: 'handover', label: 'O&M', children: <OmPanel project={project} /> },
  ];
  const tabs = workspaceTabs(all);

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
    // A tab's own tabs (`?sub=`) start again on the first in the next tab.
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
          phone ? (
            <ProjectHealth signals={health} />
          ) : (
            <Space orientation="vertical" size={8}>
              <ProjectFacts project={project} />
              <ProjectHealth signals={health} />
            </Space>
          )
        }
        extra={
          phone ? (
            <ProjectMenu project={project} editor={editor} onEdit={() => setEditOpen(true)} />
          ) : (
            <Space wrap>
              {/* The Overview leads with progress against its plan, so the bar is for the other tabs. */}
              {active !== 'overview' && <PhysicalProgress pct={project.physicalProgressPct} />}
              <AskButton question={summariseQuestion(project)} label="Summarise this week" title={SUMMARISE_TITLE} />
              <LinkButton href={reportHref(project)} icon={<FilePdfOutlined />}>
                Progress report
              </LinkButton>
              {editor && (
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              )}
            </Space>
          )
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
