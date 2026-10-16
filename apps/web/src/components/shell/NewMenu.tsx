'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { AlertOutlined, ContainerOutlined, FileDoneOutlined, FileTextOutlined, LineChartOutlined, PlusOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { canPrepareBill, canPurchase, canRaiseRisk, canSubmitExpense, isGuest } from '@erp/shared';
import { requestNew, type NewKind } from '@/lib/new-intent';

interface Entry {
  kind: NewKind;
  label: string;
  href: string;
  icon: React.ReactNode;
}

/** What this role can start, gated by the same helpers as each list's own New button. */
function entriesFor(user: AuthUser): Entry[][] {
  const role = user.roleKey;
  const site: Entry[] = [
    { kind: 'dpr', label: 'Daily report', href: '/dpr', icon: <FileTextOutlined /> },
    { kind: 'progress', label: 'Progress entry', href: '/progress', icon: <LineChartOutlined /> },
    { kind: 'material-request', label: 'Material request', href: '/material-requests', icon: <ShoppingCartOutlined /> },
    ...(canSubmitExpense(role) ? [{ kind: 'expense' as const, label: 'Site expense', href: '/expenses', icon: <WalletOutlined /> }] : []),
    ...(canRaiseRisk(role) ? [{ kind: 'risk' as const, label: 'Delay or risk', href: '/risks', icon: <AlertOutlined /> }] : []),
  ];
  const office: Entry[] = [
    ...(canPurchase(role) ? [{ kind: 'purchase-order' as const, label: 'Purchase order', href: '/purchase-orders', icon: <ContainerOutlined /> }] : []),
    ...(canPrepareBill(role) ? [{ kind: 'ra-bill' as const, label: 'RA bill', href: '/bills', icon: <FileDoneOutlined /> }] : []),
  ];
  return [site, office].filter((g) => g.length > 0);
}

/** The header's "+ New": start any entry from any page. The list already on screen opens its form; otherwise its page does. */
export function NewMenu({ user, compact }: { user: AuthUser; compact?: boolean }) {
  const router = useRouter();
  if (isGuest(user.roleKey) || user.support) return null;
  const groups = entriesFor(user);
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
