'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Alert, Avatar, Button, Drawer, Dropdown, Grid, Layout, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { AuditOutlined, CompassOutlined, CustomerServiceOutlined, LogoutOutlined, MenuOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { BILLING_REMIND_DAYS, PRODUCT_NAME, canManageBilling, canManageCompanyData, isGuest, mayApprove } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useCompanyDeletion, usePendingApprovals } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { endSupportSession } from '@/lib/api';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BRAND } from '@/lib/brand';
import { BrandMark } from './BrandMark';
import { CommandPalette } from './CommandPalette';
import { navFor } from './nav';
import { PREF_RAIL, Sidebar, readPref, writePref } from './Sidebar';
import { ProductTour, shouldAutoStartTour } from './ProductTour';
import s from './Sidebar.module.css';

const { Header, Content } = Layout;

/** Typing in a field, so single-key shortcuts must not fire. */
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  // The rail is remembered; with no choice yet, narrower laptop screens start with it.
  const [rail, setRail] = useState<boolean>(() => readPref<boolean | null>(PREF_RAIL, null) ?? window.innerWidth < 1100);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const approver = mayApprove(user);
  const { data: pending } = usePendingApprovals(approver);
  const pendingCount = approver ? (pending?.length ?? 0) : 0;
  const sections = useMemo(() => navFor(user), [user]);
  const guest = isGuest(user.roleKey);
  const [touring, setTouring] = useState(false);

  // The first time someone signs in on this browser, once the shell has laid out.
  useEffect(() => {
    if (!shouldAutoStartTour(user)) return;
    const t = window.setTimeout(() => setTouring(true), 600);
    return () => window.clearTimeout(t);
  }, [user]);

  const toggleRail = useCallback(() => {
    setRail((r) => {
      writePref(PREF_RAIL, !r);
      return !r;
    });
  }, []);

  // Ctrl K / ⌘K opens quick-jump anywhere; [ folds the sidebar to its rail and back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        if (guest) return;
        e.preventDefault();
        setMobileOpen(false);
        setSearchOpen((o) => !o);
      } else if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey && !isMobile && !isTyping(e.target) && !document.querySelector('.ant-modal-wrap')) {
        toggleRail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guest, isMobile, toggleRail]);

  // Close the drawer when the page changes (links, quick-jump or the browser's back button).
  useEffect(() => setMobileOpen(false), [pathname]);

  const openSearch = guest
    ? undefined
    : () => {
        setMobileOpen(false);
        setSearchOpen(true);
      };

  const userMenu: MenuProps['items'] = [
    { key: 'info', icon: <UserOutlined />, label: `${user.email}`, disabled: true },
    { type: 'divider' },
    {
      key: 'tour',
      icon: <CompassOutlined />,
      label: 'Take the tour',
      onClick: () => {
        setMobileOpen(false);
        setTouring(true);
      },
    },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: logout },
  ];

  const initials = user.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <aside className={`${s.aside} ${rail ? s.asideRail : ''}`} data-tour="sidebar">
          <Sidebar user={user} sections={sections} pendingCount={pendingCount} rail={rail} onToggleRail={toggleRail} onSearch={openSearch} />
        </aside>
      )}
      {isMobile && (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" size={288} closable={false} styles={{ body: { padding: 0, background: BRAND.colors.ink } }}>
          <Sidebar user={user} sections={sections} pendingCount={pendingCount} onNavigate={() => setMobileOpen(false)} onSearch={openSearch} />
        </Drawer>
      )}
      {!guest && <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} sections={sections} withProjects />}
      <ProductTour user={user} mobile={isMobile} open={touring} onClose={() => setTouring(false)} />
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '0 12px' : '0 24px',
            borderBottom: `1px solid ${BRAND.colors.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 56,
            lineHeight: '56px',
            gap: 8,
          }}
        >
          <Space size={12} style={{ minWidth: 0 }}>
            {isMobile ? (
              <>
                <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="Open menu" data-tour="menu" />
                <BrandMark size={28} />
              </>
            ) : (
              <>
                <AuditOutlined style={{ color: BRAND.colors.link }} />
                <Typography.Text strong>{user.organizationName}</Typography.Text>
              </>
            )}
            {approver && pendingCount > 0 && (
              <Link href="/approvals">
                <Tag color="orange" style={{ margin: 0 }}>
                  {pendingCount} pending{isMobile ? '' : ` approval${pendingCount === 1 ? '' : 's'}`}
                </Tag>
              </Link>
            )}
          </Space>
          <Space size={4}>
            {isMobile && openSearch && <Button type="text" icon={<SearchOutlined />} onClick={openSearch} aria-label="Search pages and projects" data-tour="search" />}
            <span data-tour="notifications">
              <NotificationBell />
            </span>
            <Dropdown menu={{ items: userMenu }} trigger={['click']}>
            <Button type="text" style={{ height: 40, padding: '0 8px' }} data-tour="account">
              <Space>
                <Avatar size="small" style={{ background: BRAND.colors.accent, color: BRAND.colors.onAccent, fontWeight: 700 }}>
                  {initials}
                </Avatar>
                {!isMobile && (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{user.fullName}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {user.roleName}
                    </span>
                  </span>
                )}
              </Space>
            </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content>
          <SupportBanner user={user} />
          <BillingBanner user={user} />
          <DeletionBanner user={user} />
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

/** Staff viewing a company for support see, on every page, whose data it is and how to leave. */
function SupportBanner({ user }: { user: AuthUser }) {
  if (!user.support) return null;
  const exit = () => {
    endSupportSession();
    window.location.href = '/platform';
  };
  return (
    <div className="page-container" style={{ paddingBottom: 0 }}>
      <Alert
        type="warning"
        showIcon
        icon={<CustomerServiceOutlined />}
        title={`Viewing ${user.organizationName} as ${PRODUCT_NAME} support, read-only, until ${formatDateTime(user.support.expiresAt)}. The visit is in the company's log.`}
        action={
          <Button size="small" onClick={exit}>
            Exit
          </Button>
        }
      />
    </div>
  );
}

/** Everyone sees when the company is read-only for want of payment; admins also see the trial or period running out. */
function BillingBanner({ user }: { user: AuthUser }) {
  const b = user.billing;
  if (!b || user.support) return null;
  const admin = canManageBilling(user.roleKey);
  const renew = admin && (
    <Link href="/billing">
      <Button size="small" type="primary">
        {b.status === 'READ_ONLY' ? 'Renew' : 'Subscribe'}
      </Button>
    </Link>
  );
  if (b.status === 'READ_ONLY') {
    return (
      <div className="page-container" style={{ paddingBottom: 0 }}>
        <Alert
          type="error"
          showIcon
          title={`${user.organizationName} is read-only: the ${PRODUCT_NAME} ${b.paidUntil ? 'subscription' : 'free trial'} has ended. You can still see and export everything.${admin ? '' : ' Ask your admin to renew.'}`}
          action={renew}
        />
      </div>
    );
  }
  const ends = b.status === 'TRIAL' ? b.trialEndsAt : b.status === 'ACTIVE' ? b.paidUntil : null;
  if (!admin || !ends || b.status === 'EXEMPT') return null;
  const daysLeft = Math.round((Date.parse(`${ends}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (daysLeft > BILLING_REMIND_DAYS) return null;
  return (
    <div className="page-container" style={{ paddingBottom: 0 }}>
      <Alert
        type="info"
        showIcon
        title={`Your ${b.status === 'TRIAL' ? 'free trial' : 'subscription'} ends on ${formatDate(ends)}. After that the company becomes read-only until it is paid.`}
        action={renew}
      />
    </div>
  );
}

/** Admins are reminded on every page while the company is set to be deleted. */
function DeletionBanner({ user }: { user: AuthUser }) {
  const admin = canManageCompanyData(user.roleKey);
  const { data } = useCompanyDeletion(admin);
  if (!admin || !data?.scheduledFor) return null;
  return (
    <div className="page-container" style={{ paddingBottom: 0 }}>
      <Alert
        type="error"
        showIcon
        title={`This company and all its data will be deleted on ${formatDate(data.scheduledFor)}.`}
        action={
          <Link href="/company-data">
            <Button size="small" danger>
              Review or cancel
            </Button>
          </Link>
        }
      />
    </div>
  );
}
