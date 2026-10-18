'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Flex, Pagination, Segmented, Space, Spin, Tabs } from 'antd';
import { CheckOutlined, MessageOutlined } from '@ant-design/icons';
import type { NotificationDto, NotificationTab, SubmissionType } from '@erp/shared';
import { canViewMessageLog, NOTIFICATION_TABS, NOTIFICATION_TAB_LABELS, SUBMISSION_TYPES } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { SubmissionRecordDrawer, type OpenSubmission } from '@/components/notifications/SubmissionRecordDrawer';
import { NotificationFeed } from '@/components/notifications/NotificationFeed';
import { submissionOf } from '@/components/notifications/NotificationBell';
import { notificationHref } from '@/components/notifications/notificationTarget';
import { MessagingSettingsModal } from '@/components/notifications/MessagingSettingsModal';
import { MessageLog } from '@/components/notifications/MessageLog';
import { EmptyArt } from '@/components/common/EmptyArt';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';

const PAGE_SIZE = 25;

function NotificationsPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [kind, setKind] = useState<NotificationTab | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<OpenSubmission>(null);
  const [settings, setSettings] = useState(false);
  const { user } = useAuth();
  const showLog = !!user && canViewMessageLog(user.roleKey);
  const tab = showLog && search.get('tab') === 'messages' ? 'messages' : 'notifications';
  const { data, isLoading, error, refetch } = useNotifications({ unreadOnly: filter === 'UNREAD' || undefined, tab: kind === 'ALL' ? undefined : kind, limit: 200 });
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
    const sub = submissionOf(n);
    if (sub) setOpen(sub);
    else router.push(notificationHref(n));
  };

  const unread = (kind === 'ALL' ? data?.unreadCount : data?.unreadByTab?.[kind]) ?? 0;
  const items = data?.items ?? [];

  const list = (
    <>
      <CardToolbar wrap gap={12} align="center">
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v as NotificationTab | 'ALL');
            setPage(1);
          }}
          options={[{ value: 'ALL', label: 'All' }, ...NOTIFICATION_TABS.map((t) => ({ value: t, label: data?.unreadByTab?.[t] ? `${NOTIFICATION_TAB_LABELS[t]} (${data.unreadByTab[t]})` : NOTIFICATION_TAB_LABELS[t] }))]}
        />
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v as 'ALL' | 'UNREAD');
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: 'Read and unread' },
            { value: 'UNREAD', label: `Unread (${unread})` },
          ]}
        />
      </CardToolbar>
      <Spin spinning={isLoading}>
        {items.length ? (
          <NotificationFeed items={items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} onOpen={onClick} />
        ) : isLoading ? null : (
          <Flex justify="center" style={{ padding: 16, color: themeColor('colorTextDescription') }}>
            {filter === 'UNREAD' ? <EmptyArt art="approved" title="You are all caught up." /> : 'No notifications yet. You will be told here when your submissions are reviewed.'}
          </Flex>
        )}
        <Flex justify="flex-end" style={{ padding: items.length > PAGE_SIZE ? 16 : 0 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={items.length} hideOnSinglePage onChange={setPage} />
        </Flex>
      </Spin>
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
              WhatsApp and SMS
            </Button>
            <Button icon={<CheckOutlined />} disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate(kind === 'ALL' ? undefined : kind)}>
              Mark all as read
            </Button>
          </Space>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
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
                label: 'WhatsApp and SMS log',
                children: <MessageLog />,
              },
            ]}
          />
        ) : (
          list
        )}
      </Card>
      <SubmissionRecordDrawer open={open} onClose={closeDrawer} />
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
