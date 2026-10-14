'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card, List, Segmented, Space, Tabs, Tag, Typography } from 'antd';
import { CheckOutlined, MessageOutlined } from '@ant-design/icons';
import type { NotificationDto, SubmissionType } from '@erp/shared';
import { canViewMessageLog, NOTIFICATION_TYPE_LABELS, SUBMISSION_TYPES } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/queries';
import { formatDateTime, NOTIFICATION_COLORS, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MachineryDrawer } from '@/components/machinery/MachineryDrawer';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { MeasurementDrawer } from '@/components/measurements/MeasurementDrawer';
import { BillDrawer } from '@/components/bills/BillDrawer';
import { PurchaseOrderDrawer } from '@/components/purchasing/PurchaseOrderDrawer';
import { VendorBillDrawer } from '@/components/purchasing/VendorBillDrawer';
import { WorkOrderDrawer } from '@/components/subcontracts/WorkOrderDrawer';
import { SubBillDrawer } from '@/components/subcontracts/SubBillDrawer';
import { InspectionDrawer } from '@/components/inspections/InspectionDrawer';
import { notificationHref } from '@/components/notifications/notificationTarget';
import { MessagingSettingsModal } from '@/components/notifications/MessagingSettingsModal';
import { MessageLog } from '@/components/notifications/MessageLog';

type Open = { type: SubmissionType; id: string } | null;

function NotificationsPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [open, setOpen] = useState<Open>(null);
  const [settings, setSettings] = useState(false);
  const { user } = useAuth();
  const showLog = !!user && canViewMessageLog(user.roleKey);
  const tab = showLog && search.get('tab') === 'messages' ? 'messages' : 'notifications';
  const { data, isLoading, error, refetch } = useNotifications({ unreadOnly: filter === 'UNREAD' || undefined, limit: 200 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  // /notifications?type=PROGRESS&id=... (from the bell or a push) opens the submission directly.
  useEffect(() => {
    const type = search.get('type') as SubmissionType | null;
    const id = search.get('id');
    if (type && id && SUBMISSION_TYPES.includes(type)) setOpen({ type, id });
  }, [search]);

  const closeDrawer = () => {
    setOpen(null);
    if (search.get('id')) router.replace('/notifications');
  };

  const onClick = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.entityType && n.entityId) setOpen({ type: n.entityType, id: n.entityId });
    else router.push(notificationHref(n));
  };

  const unread = data?.unreadCount ?? 0;

  const list = (
    <>
      <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as 'ALL' | 'UNREAD')}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'UNREAD', label: `Unread (${unread})` },
          ]}
        />
      </div>
      <List<NotificationDto>
        loading={isLoading}
        dataSource={data?.items ?? []}
        locale={{ emptyText: filter === 'UNREAD' ? 'You are all caught up.' : 'No notifications yet. You will be told here when your submissions are reviewed.' }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        renderItem={(n) => (
          <List.Item
            onClick={() => onClick(n)}
            style={{ cursor: 'pointer', padding: '12px 16px', background: n.readAt ? undefined : 'rgba(22, 89, 168, 0.05)' }}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} title={formatDateTime(n.createdAt)}>
                {timeAgo(n.createdAt)}
              </Typography.Text>
            }
          >
            <List.Item.Meta
              avatar={<Badge dot={!n.readAt} offset={[-2, 8]} />}
              title={
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: n.readAt ? 500 : 700 }}>{n.title}</span>
                  <Tag color={NOTIFICATION_COLORS[n.type]} style={{ margin: 0 }}>
                    {NOTIFICATION_TYPE_LABELS[n.type]}
                  </Tag>
                </span>
              }
              description={
                <>
                  <div>{n.body}</div>
                  {n.projectName && n.projectId && (
                    <Link href={`/projects/${n.projectId}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12 }}>
                      {n.projectName}
                    </Link>
                  )}
                </>
              }
            />
          </List.Item>
        )}
      />
    </>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Notifications"
        subtitle="Approvals, rejections, change requests, DPR reminders, low-stock alerts and your daily approvals digest"
        extra={
          <Space wrap>
            <Button icon={<MessageOutlined />} onClick={() => setSettings(true)}>
              WhatsApp & SMS
            </Button>
            <Button icon={<CheckOutlined />} disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all as read
            </Button>
          </Space>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        {showLog ? (
          <Tabs
            activeKey={tab}
            onChange={(k) => router.replace(k === 'messages' ? '/notifications?tab=messages' : '/notifications', { scroll: false })}
            tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
            items={[
              {
                key: 'notifications',
                label: 'My notifications',
                children: list,
              },
              {
                key: 'messages',
                label: 'WhatsApp & SMS log',
                children: <MessageLog />,
              },
            ]}
          />
        ) : (
          list
        )}
      </Card>
      <ProgressDrawer id={open?.type === 'PROGRESS' ? open.id : null} open={open?.type === 'PROGRESS'} onClose={closeDrawer} />
      <DprDrawer id={open?.type === 'DPR' ? open.id : null} open={open?.type === 'DPR'} onClose={closeDrawer} />
      <MrDrawer id={open?.type === 'MATERIAL_REQUEST' ? open.id : null} open={open?.type === 'MATERIAL_REQUEST'} onClose={closeDrawer} />
      <MachineryDrawer id={open?.type === 'MACHINERY' ? open.id : null} open={open?.type === 'MACHINERY'} onClose={closeDrawer} />
      <ExpenseDrawer id={open?.type === 'EXPENSE' ? open.id : null} open={open?.type === 'EXPENSE'} onClose={closeDrawer} />
      <MeasurementDrawer id={open?.type === 'MEASUREMENT' ? open.id : null} open={open?.type === 'MEASUREMENT'} onClose={closeDrawer} />
      <BillDrawer id={open?.type === 'BILL' ? open.id : null} open={open?.type === 'BILL'} onClose={closeDrawer} />
      <PurchaseOrderDrawer id={open?.type === 'PURCHASE_ORDER' ? open.id : null} open={open?.type === 'PURCHASE_ORDER'} onClose={closeDrawer} />
      <VendorBillDrawer id={open?.type === 'VENDOR_BILL' ? open.id : null} open={open?.type === 'VENDOR_BILL'} onClose={closeDrawer} />
      <WorkOrderDrawer id={open?.type === 'WORK_ORDER' ? open.id : null} open={open?.type === 'WORK_ORDER'} onClose={closeDrawer} />
      <SubBillDrawer id={open?.type === 'SUBCONTRACT_BILL' ? open.id : null} open={open?.type === 'SUBCONTRACT_BILL'} onClose={closeDrawer} />
      <InspectionDrawer id={open?.type === 'INSPECTION' ? open.id : null} open={open?.type === 'INSPECTION'} onClose={closeDrawer} />
      <MessagingSettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsPageInner />
    </Suspense>
  );
}
