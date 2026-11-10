'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { AccountBookOutlined, AlertOutlined, AuditOutlined, BankOutlined, CarOutlined, CheckSquareOutlined, ColumnWidthOutlined, CommentOutlined, ContainerOutlined, CopyOutlined, ExperimentOutlined, FileAddOutlined, FileDoneOutlined, FileProtectOutlined, FileSearchOutlined, FileTextOutlined, IssuesCloseOutlined, LineChartOutlined, MailOutlined, PlusOutlined, ProjectOutlined, QuestionCircleOutlined, SafetyCertificateOutlined, SafetyOutlined, ShoppingCartOutlined, TeamOutlined, TrophyOutlined, WalletOutlined, WarningOutlined } from '@/components/common/icons';
import type { AuthUser } from '@erp/shared';
import { canKeepBooks, canManageFixedAssets, canManageMachineLoans, canManageProjects, canManageVariations, canMeasure, canRaiseNcr, canRaiseRfi, canRecordAttendance, canRecordTest, canReportSafety, canRequestInspection, canSellRmc, canPrepareBill, canPurchase, canRaiseRisk, canRequestFunds, canRequestPayment, canSubmitExpense, canManageTenders, canRunSubcontractEnquiries, canRecordMeetings, canRaiseMaterialApprovals, canManageDocuments, canViewLetters, canViewPayables, isGuest, pathIsOff } from '@erp/shared';
import { requestNew, type NewKind } from '@/lib/new-intent';

export interface NewEntry {
  kind: NewKind;
  label: string;
  /** How Search (Ctrl K) offers it, in the words of the list's own button: "New daily report", "Record letter". */
  action: string;
  /** Other words Search finds it by (an old name, the paper form's) */
  keywords?: string;
  href: string;
  icon: React.ReactNode;
}

/** What this role can start, gated by the same helpers as each list's own New button. */
export function newEntriesFor(user: AuthUser): NewEntry[][] {
  if (isGuest(user.roleKey) || user.support) return [];
  const role = user.roleKey;
  const site: NewEntry[] = [
    { kind: 'dpr', label: 'Daily report', action: 'New daily report (DPR)', href: '/dpr', icon: <FileTextOutlined /> },
    { kind: 'progress', label: 'Progress entry', action: 'New progress entry', href: '/progress', icon: <LineChartOutlined /> },
    { kind: 'material-request', label: 'Indent', action: 'New indent', keywords: 'material request mr', href: '/material-requests', icon: <ShoppingCartOutlined /> },
    ...(canRecordAttendance(role) ? [{ kind: 'head-count' as const, label: 'Attendance', action: 'Record attendance', keywords: 'head count labour manpower', href: '/attendance', icon: <TeamOutlined /> }] : []),
    ...(canMeasure(role) ? [{ kind: 'measurement' as const, label: 'Measurement', action: 'New measurement', keywords: 'measurement book', href: '/measurements', icon: <ColumnWidthOutlined /> }] : []),
    ...(canSubmitExpense(role) ? [{ kind: 'expense' as const, label: 'Site expense', action: 'New site expense', href: '/expenses', icon: <WalletOutlined /> }] : []),
    ...(canRaiseRisk(role) ? [{ kind: 'risk' as const, label: 'Delay or risk', action: 'Record delay or risk', href: '/risks', icon: <AlertOutlined /> }] : []),
    ...(canRecordMeetings(role) ? [{ kind: 'meeting' as const, label: 'Meeting', action: 'Record meeting', href: '/meetings', icon: <CommentOutlined /> }] : []),
    ...(canRaiseMaterialApprovals(role) ? [{ kind: 'material-approval' as const, label: 'Material approval', action: 'Request material approval', href: '/material-approvals', icon: <SafetyCertificateOutlined /> }] : []),
    ...(canRequestFunds(role) ? [{ kind: 'fund-request' as const, label: 'Fund request', action: 'Request funds', href: '/imprest?tab=funds', icon: <BankOutlined /> }] : []),
  ];
  // Quality, safety and drawings: the same helpers as the lists' own New buttons.
  const checks: NewEntry[] = [
    ...(canRequestInspection(role) ? [{ kind: 'inspection' as const, label: 'Inspection', action: 'Request inspection', keywords: 'qa qc hold point', href: '/inspections?tab=inspections', icon: <CheckSquareOutlined /> }] : []),
    ...(canRecordTest(role) ? [{ kind: 'test' as const, label: 'Material test', action: 'Record test', keywords: 'cube slump qa qc', href: '/inspections?tab=tests', icon: <ExperimentOutlined /> }] : []),
    ...(canRaiseNcr(role) ? [{ kind: 'ncr' as const, label: 'NCR', action: 'New NCR', keywords: 'non conformance', href: '/inspections?tab=ncrs', icon: <IssuesCloseOutlined /> }] : []),
    ...(canReportSafety(role)
      ? [
          { kind: 'incident' as const, label: 'Incident', action: 'Report incident', keywords: 'near miss accident safety', href: '/safety?tab=incidents', icon: <WarningOutlined /> },
          { kind: 'permit' as const, label: 'Permit to work', action: 'Request permit', keywords: 'ptw height hot work confined', href: '/safety?tab=permits', icon: <SafetyOutlined /> },
        ]
      : []),
    ...(canManageDocuments(role) ? [{ kind: 'document' as const, label: 'Drawing or document', action: 'New drawing or document', keywords: 'drawing register revision', href: '/documents?tab=register', icon: <FileAddOutlined /> }] : []),
    ...(canRaiseRfi(role) ? [{ kind: 'rfi' as const, label: 'RFI', action: 'New RFI', keywords: 'request for information question designer', href: '/documents?tab=rfis', icon: <QuestionCircleOutlined /> }] : []),
  ];
  const office: NewEntry[] = [
    ...(canManageProjects(role) ? [{ kind: 'project' as const, label: 'Project', action: 'New project', keywords: 'site contract', href: '/projects', icon: <ProjectOutlined /> }] : []),
    ...(canPurchase(role) ? [{ kind: 'purchase-order' as const, label: 'Purchase order', action: 'New purchase order (PO)', href: '/purchase-orders', icon: <ContainerOutlined /> }] : []),
    ...(canManageTenders(role) ? [{ kind: 'tender' as const, label: 'Tender', action: 'Record tender', href: '/tenders', icon: <TrophyOutlined /> }] : []),
    ...(canManageDocuments(role) ? [{ kind: 'design-submission' as const, label: 'Submittal', action: 'New submittal', href: '/design-submissions', icon: <FileProtectOutlined /> }] : []),
    ...(canManageDocuments(role) ? [{ kind: 'controlled-copy' as const, label: 'Controlled copy', action: 'Issue controlled copies', href: '/controlled-copies', icon: <CopyOutlined /> }] : []),
    ...(canRunSubcontractEnquiries(role) ? [{ kind: 'subcontract-enquiry' as const, label: 'Subcontract enquiry', action: 'New subcontract enquiry', href: '/subcontract-enquiries', icon: <FileSearchOutlined /> }] : []),
    ...(canPrepareBill(role) ? [{ kind: 'ra-bill' as const, label: 'RA bill', action: 'New RA bill', href: '/bills', icon: <FileDoneOutlined /> }] : []),
    ...(canManageVariations(role) ? [{ kind: 'variation' as const, label: 'Variation', action: 'New variation', keywords: 'extra item deviation claim', href: '/variations', icon: <AuditOutlined /> }] : []),
    ...(canRequestPayment(role) && canViewPayables(role) ? [{ kind: 'payment-request' as const, label: 'Payment request', action: 'Request payment', href: '/payables?tab=requests', icon: <BankOutlined /> }] : []),
    ...(canSellRmc(role) ? [{ kind: 'rmc-order' as const, label: 'RMC quote', action: 'New RMC quote', href: '/rmc?tab=orders', icon: <FileDoneOutlined /> }] : []),
    ...(canKeepBooks(role) ? [{ kind: 'voucher' as const, label: 'Voucher', action: 'New voucher', href: '/books?tab=vouchers', icon: <AccountBookOutlined /> }] : []),
    ...(canManageMachineLoans(role) ? [{ kind: 'machine-loan' as const, label: 'Machine loan', action: 'Record machine loan', href: '/machine-loans', icon: <CarOutlined /> }] : []),
    ...(canManageFixedAssets(role) ? [{ kind: 'fixed-asset' as const, label: 'Fixed asset', action: 'New fixed asset', keywords: 'asset register capitalise', href: '/fixed-assets', icon: <ContainerOutlined /> }] : []),
    ...(canViewLetters(role)
      ? [
          { kind: 'letter' as const, label: 'Letter to send', action: 'New letter', href: '/correspondence/outward', icon: <MailOutlined /> },
          { kind: 'letter-in' as const, label: 'Letter received', action: 'Record letter', href: '/correspondence', icon: <MailOutlined /> },
        ]
      : []),
  ];
  // Nothing from a module the company has turned off.
  return [site, checks, office].map((g) => g.filter((e) => !pathIsOff(e.href, user.modulesOff))).filter((g) => g.length > 0);
}

/**
 * The header's "+ New": start any entry from any page. The list already on screen opens its form; otherwise its page does.
 * It is a secondary button: the page's own New is the one primary action.
 */
export function NewMenu({ user, compact }: { user: AuthUser; compact?: boolean }) {
  const router = useRouter();
  const groups = newEntriesFor(user);
  if (!groups.length) return null;
  const items: MenuProps['items'] = groups.flatMap((g, i) => [
    ...(i > 0 ? [{ type: 'divider' as const }] : []),
    ...g.map((e) => ({ key: e.kind, icon: e.icon, label: e.label, onClick: () => requestNew(e.kind, () => router.push(e.href)) })),
  ]);
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button icon={<PlusOutlined />} aria-label={compact ? 'New' : undefined} data-tour="new">
        {compact ? null : 'New'}
      </Button>
    </Dropdown>
  );
}
