'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { AccountBookOutlined, AlertOutlined, BankOutlined, CarOutlined, CommentOutlined, ContainerOutlined, FileDoneOutlined, FileSearchOutlined, FileTextOutlined, LineChartOutlined, MailOutlined, PlusOutlined, ShoppingCartOutlined, TrophyOutlined, WalletOutlined } from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { canKeepBooks, canManageMachineLoans, canSellRmc, canPrepareBill, canPurchase, canRaiseRisk, canRequestFunds, canRequestPayment, canSubmitExpense, canManageTenders, canRunSubcontractEnquiries, canRecordMeetings, canViewLetters, canViewPayables, isGuest } from '@erp/shared';
import { requestNew, type NewKind } from '@/lib/new-intent';

export interface NewEntry {
  kind: NewKind;
  label: string;
  /** How Search (Ctrl K) offers it, in the words of the list's own button: "New daily report", "Record letter". */
  action: string;
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
    { kind: 'material-request', label: 'Material request', action: 'New material request (MR)', href: '/material-requests', icon: <ShoppingCartOutlined /> },
    ...(canSubmitExpense(role) ? [{ kind: 'expense' as const, label: 'Site expense', action: 'New site expense', href: '/expenses', icon: <WalletOutlined /> }] : []),
    ...(canRaiseRisk(role) ? [{ kind: 'risk' as const, label: 'Delay or risk', action: 'Record delay or risk', href: '/risks', icon: <AlertOutlined /> }] : []),
    ...(canRecordMeetings(role) ? [{ kind: 'meeting' as const, label: 'Meeting', action: 'Record meeting', href: '/meetings', icon: <CommentOutlined /> }] : []),
    ...(canRequestFunds(role) ? [{ kind: 'fund-request' as const, label: 'Fund request', action: 'Request funds', href: '/imprest?tab=funds', icon: <BankOutlined /> }] : []),
  ];
  const office: NewEntry[] = [
    ...(canPurchase(role) ? [{ kind: 'purchase-order' as const, label: 'Purchase order', action: 'New purchase order (PO)', href: '/purchase-orders', icon: <ContainerOutlined /> }] : []),
    ...(canManageTenders(role) ? [{ kind: 'tender' as const, label: 'Tender', action: 'Record tender', href: '/tenders', icon: <TrophyOutlined /> }] : []),
    ...(canRunSubcontractEnquiries(role) ? [{ kind: 'subcontract-enquiry' as const, label: 'Subcontract enquiry', action: 'New subcontract enquiry', href: '/subcontract-enquiries', icon: <FileSearchOutlined /> }] : []),
    ...(canPrepareBill(role) ? [{ kind: 'ra-bill' as const, label: 'RA bill', action: 'New RA bill', href: '/bills', icon: <FileDoneOutlined /> }] : []),
    ...(canRequestPayment(role) && canViewPayables(role) ? [{ kind: 'payment-request' as const, label: 'Payment request', action: 'Request payment', href: '/payables?tab=requests', icon: <BankOutlined /> }] : []),
    ...(canSellRmc(role) ? [{ kind: 'rmc-order' as const, label: 'RMC quote', action: 'New RMC quote', href: '/rmc?tab=orders', icon: <FileDoneOutlined /> }] : []),
    ...(canKeepBooks(role) ? [{ kind: 'voucher' as const, label: 'Voucher', action: 'New voucher', href: '/books?tab=vouchers', icon: <AccountBookOutlined /> }] : []),
    ...(canManageMachineLoans(role) ? [{ kind: 'machine-loan' as const, label: 'Machine loan', action: 'Record machine loan', href: '/machine-loans', icon: <CarOutlined /> }] : []),
    ...(canViewLetters(role) ? [{ kind: 'letter' as const, label: 'Letter', action: 'Record letter', href: '/documents?tab=letters', icon: <MailOutlined /> }] : []),
  ];
  return [site, office].filter((g) => g.length > 0);
}

/**
 * The header's "+ New": start any entry from any page. The list already on screen opens its form; otherwise its page does.
 * It is a secondary button: the page's own New is the one primary action (UX item 87).
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
