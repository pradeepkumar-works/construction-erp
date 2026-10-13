'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Badge, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  BellOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  InboxOutlined,
  ToolOutlined,
  WalletOutlined,
  CalculatorOutlined,
  FundOutlined,
  FilePdfOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuOutlined,
  ProjectOutlined,
  ScheduleOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
  AlertOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { canApprove, canEditProjects, canManageUsers, canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePendingApprovals } from '@/lib/queries';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const { Header, Sider, Content } = Layout;

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/';
  return '/' + pathname.split('/')[1];
}

function Brand({ user, collapsed }: { user: AuthUser; collapsed: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '16px 0' : '16px 20px', justifyContent: collapsed ? 'center' : 'flex-start', overflow: 'hidden' }}>
      <span className="brand-mark">CE</span>
      {!collapsed && (
        <div style={{ lineHeight: 1.15, whiteSpace: 'nowrap' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Construction ERP</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{user.organizationName}</div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const approver = canApprove(user.roleKey);
  const { data: pending } = usePendingApprovals(approver);
  const pendingCount = pending?.length ?? 0;

  const items: MenuProps['items'] = useMemo(() => {
    const showBadge = approver && pendingCount > 0 && (isMobile || !collapsed);
    const base: MenuProps['items'] = [
      { key: '/', icon: <AppstoreOutlined />, label: <Link href="/">Dashboard</Link> },
      { key: '/projects', icon: <ProjectOutlined />, label: <Link href="/projects">Projects</Link> },
      {
        key: '/approvals',
        icon: <CheckSquareOutlined />,
        label: (
          <Link href="/approvals" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Approvals</span>
            {showBadge && <Badge count={pendingCount} size="small" style={{ boxShadow: 'none' }} />}
          </Link>
        ),
      },
      { key: '/dpr', icon: <FileTextOutlined />, label: <Link href="/dpr">Daily Reports</Link> },
      { key: '/attendance', icon: <ScheduleOutlined />, label: <Link href="/attendance">Attendance</Link> },
      { key: '/progress', icon: <LineChartOutlined />, label: <Link href="/progress">Progress Entries</Link> },
      { key: '/measurements', icon: <CalculatorOutlined />, label: <Link href="/measurements">Measurement Book</Link> },
      { key: '/material-requests', icon: <ShoppingCartOutlined />, label: <Link href="/material-requests">Material Requests</Link> },
      { key: '/stock', icon: <InboxOutlined />, label: <Link href="/stock">Stock</Link> },
      { key: '/machinery', icon: <ToolOutlined />, label: <Link href="/machinery">Machinery</Link> },
      { key: '/expenses', icon: <WalletOutlined />, label: <Link href="/expenses">Site Expenses</Link> },
      { key: '/risks', icon: <AlertOutlined />, label: <Link href="/risks">Delays & Risks</Link> },
      { key: '/reports', icon: <FilePdfOutlined />, label: <Link href="/reports">Progress Reports</Link> },
      ...(canViewCost(user.roleKey) ? [{ key: '/cost', icon: <FundOutlined />, label: <Link href="/cost">Project Cost</Link> }] : []),
      { key: '/notifications', icon: <BellOutlined />, label: <Link href="/notifications">Notifications</Link> },
    ];
    if (canEditProjects(user.roleKey)) {
      base.push({ key: '/templates', icon: <PartitionOutlined />, label: <Link href="/templates">Activity Templates</Link> });
    }
    if (canManageUsers(user.roleKey)) {
      base.push({ key: '/users', icon: <TeamOutlined />, label: <Link href="/users">Users</Link> });
    }
    return base;
  }, [approver, pendingCount, collapsed, isMobile, user.roleKey]);

  const userMenu: MenuProps['items'] = [
    { key: 'info', icon: <UserOutlined />, label: `${user.email}`, disabled: true },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: logout },
  ];

  const menu = <Menu theme="dark" mode="inline" selectedKeys={[selectedKey(pathname)]} items={items} style={{ borderInlineEnd: 0 }} onClick={() => setMobileOpen(false)} />;

  const initials = user.fullName
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg" width={232} collapsedWidth={64} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
          <Brand user={user} collapsed={collapsed} />
          {menu}
        </Sider>
      )}
      {isMobile && (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" width={260} closable={false} styles={{ body: { padding: 0, background: '#0f2a4d' } }}>
          <Brand user={user} collapsed={false} />
          {menu}
        </Drawer>
      )}
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '0 12px' : '0 24px',
            borderBottom: '1px solid #e6e9ef',
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
                <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="Open menu" />
                <span className="brand-mark" style={{ width: 28, height: 28, fontSize: 13 }}>
                  CE
                </span>
              </>
            ) : (
              <>
                <AuditOutlined style={{ color: '#1659a8' }} />
                <Typography.Text strong>{user.organizationName}</Typography.Text>
              </>
            )}
            {approver && pendingCount > 0 && (
              <Link href="/approvals">
                <Tag color="gold" style={{ margin: 0 }}>
                  {pendingCount} pending{isMobile ? '' : ` approval${pendingCount === 1 ? '' : 's'}`}
                </Tag>
              </Link>
            )}
          </Space>
          <Space size={4}>
            <NotificationBell />
            <Dropdown menu={{ items: userMenu }} trigger={['click']}>
            <Button type="text" style={{ height: 40, padding: '0 8px' }}>
              <Space>
                <Avatar size="small" style={{ background: '#1659a8' }}>
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
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
