'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Badge, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  InboxOutlined,
  ToolOutlined,
  WalletOutlined,
  PayCircleOutlined,
  ExportOutlined,
  PercentageOutlined,
  CalculatorOutlined,
  SafetyOutlined,
  FolderOpenOutlined,
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
  SafetyCertificateOutlined,
  BankOutlined,
  FileDoneOutlined,
  AccountBookOutlined,
  ContainerOutlined,
  ReconciliationOutlined,
  ShopOutlined,
  SolutionOutlined,
  ProfileOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { approvalRightsOf, canViewPurchaseOrders, canViewVendorBills, canViewWorkOrders, canViewPayables, canExportTally, canViewGstRegisters, canPrepareSubcontractBill, canEditContract, canEditProjects, canEditVendors, canManageUsers, canSeeVendorBank, canPrepareBill, canViewContract, canViewCost, mayApprove } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePendingApprovals } from '@/lib/queries';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from './BrandMark';

const { Header, Sider, Content } = Layout;

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/';
  return '/' + pathname.split('/')[1];
}

function Brand({ user, collapsed }: { user: AuthUser; collapsed: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '16px 0' : '16px 20px', justifyContent: collapsed ? 'center' : 'flex-start', overflow: 'hidden' }}>
      <BrandMark />
      {!collapsed && (
        <div style={{ lineHeight: 1.15, whiteSpace: 'nowrap' }}>
          <Wordmark color={BRAND.colors.accent} size={19} />
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 }}>{user.organizationName}</div>
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
  const approver = mayApprove(user);
  const { data: pending } = usePendingApprovals(approver);
  const pendingCount = pending?.length ?? 0;

  const items: MenuProps['items'] = useMemo(() => {
    const narrow = collapsed && !isMobile;
    const showBadge = approver && pendingCount > 0 && !narrow;
    const link = (href: string, label: string, Icon: React.ComponentType) => ({ key: href, icon: <Icon />, label: <Link href={href}>{label}</Link> });
    const sections: { title?: string; items: NonNullable<MenuProps['items']> }[] = [
      {
        items: [
          link('/', 'Dashboard', AppstoreOutlined),
          link('/projects', 'Projects', ProjectOutlined),
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
        ],
      },
      {
        title: 'Site',
        items: [
          link('/dpr', 'Daily Reports', FileTextOutlined),
          link('/attendance', 'Attendance', ScheduleOutlined),
          link('/progress', 'Progress Entries', LineChartOutlined),
          link('/measurements', 'Measurement Book', CalculatorOutlined),
          link('/inspections', 'Quality', SafetyOutlined),
          link('/documents', 'Documents', FolderOpenOutlined),
          link('/expenses', 'Site Expenses', WalletOutlined),
          link('/risks', 'Delays & Risks', AlertOutlined),
        ],
      },
      {
        title: 'Materials & plant',
        items: [link('/material-requests', 'Material Requests', ShoppingCartOutlined), link('/stock', 'Stock', InboxOutlined), link('/machinery', 'Machinery', ToolOutlined)],
      },
      {
        title: 'Purchases',
        items: [
          ...(canViewPurchaseOrders(user.roleKey) ? [link('/purchase-orders', 'Purchase Orders', ContainerOutlined)] : []),
          ...(canViewVendorBills(user.roleKey) ? [link('/vendor-bills', 'Vendor Bills', ReconciliationOutlined)] : []),
          ...(canViewWorkOrders(user.roleKey) ? [link('/work-orders', 'Work Orders', SolutionOutlined)] : []),
          ...(canPrepareSubcontractBill(user.roleKey) || approvalRightsOf(user).some((r) => r.type === 'SUBCONTRACT_BILL') ? [link('/subcontract-bills', 'Subcontractor Bills', ProfileOutlined)] : []),
          ...(canViewPayables(user.roleKey) ? [link('/payables', 'Payables', PayCircleOutlined)] : []),
          ...(canEditVendors(user.roleKey) || canSeeVendorBank(user.roleKey) ? [link('/vendors', 'Vendors', ShopOutlined)] : []),
        ],
      },
      {
        title: 'Billing',
        items: [
          ...(canPrepareBill(user.roleKey) || approvalRightsOf(user).some((r) => r.type === 'BILL') ? [link('/bills', 'RA Bills', FileDoneOutlined)] : []),
          ...(canViewContract(user.roleKey) ? [link('/receivables', 'Receivables', AccountBookOutlined)] : []),
          ...(canViewContract(user.roleKey) || canEditContract(user.roleKey) ? [link('/clients', 'Clients', BankOutlined)] : []),
          ...(canViewGstRegisters(user.roleKey) ? [link('/gst', 'GST Registers', PercentageOutlined)] : []),
          ...(canExportTally(user.roleKey) ? [link('/tally', 'Tally Export', ExportOutlined)] : []),
        ],
      },
      {
        title: 'People',
        items: [link('/staff', 'Staff & Leave', IdcardOutlined)],
      },
      {
        title: 'Reports',
        items: [link('/reports', 'Progress Reports', FilePdfOutlined), ...(canViewCost(user.roleKey) ? [link('/cost', 'Project Cost', FundOutlined)] : [])],
      },
      {
        title: 'Admin',
        items: [
          ...(canEditProjects(user.roleKey) ? [link('/templates', 'Activity Templates', PartitionOutlined)] : []),
          ...(canManageUsers(user.roleKey) ? [link('/users', 'Users', TeamOutlined), link('/approval-rules', 'Approval Rules', SafetyCertificateOutlined)] : []),
        ],
      },
    ];
    // Collapsed to icons there is no room for section titles, so sections are separated by a rule instead.
    return sections
      .filter((sec) => sec.items.length > 0)
      .flatMap((sec, i): NonNullable<MenuProps['items']> => {
        if (!sec.title) return sec.items;
        if (narrow) return [{ type: 'divider', key: `d${i}`, style: { borderColor: 'rgba(255,255,255,0.12)', margin: '6px 12px' } }, ...sec.items];
        return [{ type: 'group', key: `g${i}`, label: sec.title, children: sec.items }];
      });
  }, [approver, pendingCount, collapsed, isMobile, user]);

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
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" width={260} closable={false} styles={{ body: { padding: 0, background: BRAND.colors.ink } }}>
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
                <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="Open menu" />
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
            <NotificationBell />
            <Dropdown menu={{ items: userMenu }} trigger={['click']}>
            <Button type="text" style={{ height: 40, padding: '0 8px' }}>
              <Space>
                <Avatar size="small" style={{ background: BRAND.colors.accent, color: BRAND.colors.ink, fontWeight: 700 }}>
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
