'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { AlertOutlined, ContainerOutlined, FileDoneOutlined, FileTextOutlined, LineChartOutlined, MailOutlined, PlusOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { canPrepareBill, canPurchase, canRaiseRisk, canSubmitExpense, canViewLetters, isGuest } from '@erp/shared';
import { requestNew, type NewKind } from '@/lib/new-intent';

export interface NewEntry {
  kind: NewKind;
  label: string;
  /** How Search (Ctrl K) offers it: "New daily report", "Prepare RA bill". */
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
    ...(canRaiseRisk(role) ? [{ kind: 'risk' as const, label: 'Delay or risk', action: 'Record a delay or risk', href: '/risks', icon: <AlertOutlined /> }] : []),
  ];
  const office: NewEntry[] = [
    ...(canPurchase(role) ? [{ kind: 'purchase-order' as const, label: 'Purchase order', action: 'New purchase order (PO)', href: '/purchase-orders', icon: <ContainerOutlined /> }] : []),
    ...(canPrepareBill(role) ? [{ kind: 'ra-bill' as const, label: 'RA bill', action: 'Prepare RA bill', href: '/bills', icon: <FileDoneOutlined /> }] : []),
    ...(canViewLetters(role) ? [{ kind: 'letter' as const, label: 'Letter', action: 'Record a letter', href: '/documents?tab=letters', icon: <MailOutlined /> }] : []),
  ];
  return [site, office].filter((g) => g.length > 0);
}

/** The header's "+ New": start any entry from any page. The list already on screen opens its form; otherwise its page does. */
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
      <Button type="primary" icon={<PlusOutlined />} aria-label={compact ? 'New' : undefined} data-tour="new">
        {compact ? null : 'New'}
      </Button>
    </Dropdown>
  );
}
