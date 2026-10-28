'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Dropdown, theme } from 'antd';
import type { MenuProps } from 'antd';
import { COMPANY_KIND_LABELS, canSeeGroupCompanies, type AuthUser } from '@erp/shared';
import { BuildOutlined, CheckOutlined, DownOutlined, SwapOutlined } from '@/components/common/icons';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';

/**
 * The companies of the group the person has a place in (group companies, phase 1), as menu items: the one they are in is
 * ticked, picking another moves them there. Null when they have only the one company.
 */
export function useCompanyMenu(user: AuthUser): { items: MenuProps['items']; busy: boolean } | null {
  const { switchCompany } = useAuth();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  if (!user.companies || user.companies.length < 2) return null;
  const go = async (id: string, name: string) => {
    setBusy(true);
    const hide = message.loading(`Opening ${name}…`, 0);
    try {
      await switchCompany(id);
    } catch (e) {
      hide();
      setBusy(false);
      message.error(errorMessage(e));
    }
  };
  const items: MenuProps['items'] = [
    ...user.companies.map((c) => ({
      key: `company-${c.id}`,
      icon: c.current ? <CheckOutlined /> : <span className="menu-check-gap" />,
      disabled: busy,
      label: (
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3, paddingBlock: 4 }}>
          <span translate="no">{c.name}</span>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {COMPANY_KIND_LABELS[c.kind]} · {c.roleName}
          </span>
        </span>
      ),
      onClick: c.current ? undefined : () => void go(c.id, c.name),
    })),
    ...(canSeeGroupCompanies(user) ? [{ type: 'divider' as const }, { key: 'group', icon: <SwapOutlined />, label: <Link href="/group">Group companies</Link> }] : []),
  ];
  return { items, busy };
}

/** The header's company: the one this session is in, and the others of the group to move to. */
export function CompanySwitcher({ user, compact, maxWidth }: { user: AuthUser; compact: boolean; maxWidth: number }) {
  const { token } = theme.useToken();
  const menu = useCompanyMenu(user);
  if (!menu) return null;
  return (
    <Dropdown menu={{ items: menu.items }} trigger={['click']}>
      <Button
        color="default"
        variant="filled"
        icon={<BuildOutlined />}
        loading={menu.busy}
        aria-label={compact ? `Company: ${user.organizationName}. Switch company` : undefined}
        title={user.organizationName}
        data-tour="company"
        style={{ maxWidth: compact ? undefined : maxWidth, flexShrink: 0 }}
      >
        {compact ? null : (
          <>
            {/* The button's own content does not shrink, so a long name is cut to the room left beside the icon and arrow. */}
            <span translate="no" style={{ display: 'inline-block', maxWidth: maxWidth - 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
              {user.organizationName}
            </span>
            <DownOutlined style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }} />
          </>
        )}
      </Button>
    </Dropdown>
  );
}

/**
 * The top bar's company name (Menu and names, navy and frame looks), which opens the company menu when the person works
 * in more than one company of the group, and stays plain text otherwise.
 */
export function CompanyName({ user, className }: { user: AuthUser; className: string }) {
  const menu = useCompanyMenu(user);
  if (!menu)
    return (
      <span className={className} title={user.organizationName} translate="no">
        {user.organizationName}
      </span>
    );
  return (
    <Dropdown menu={{ items: menu.items }} trigger={['click']}>
      <button
        type="button"
        className={className}
        title={user.organizationName}
        aria-haspopup="menu"
        aria-label={`Company: ${user.organizationName}. Switch company`}
        data-tour="company"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 24, background: 'none', borderTop: 0, borderRight: 0, borderBottom: 0, font: 'inherit', fontSize: 'inherit', cursor: 'pointer' }}
      >
        <span translate="no" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.organizationName}
        </span>
        <DownOutlined aria-hidden style={{ fontSize: 10, flexShrink: 0 }} />
      </button>
    </Dropdown>
  );
}
