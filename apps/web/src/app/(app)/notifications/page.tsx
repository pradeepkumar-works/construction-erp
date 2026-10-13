'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card, List, Segmented, Tag, Typography } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import type { NotificationDto, SubmissionType } from '@erp/shared';
import { NOTIFICATION_TYPE_LABELS, SUBMISSION_TYPES } from '@erp/shared';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/queries';
import { formatDateTime, NOTIFICATION_COLORS, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MachineryDrawer } from '@/components/machinery/MachineryDrawer';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { notificationHref } from '@/components/notifications/notificationTarget';

type Open = { type: SubmissionType; id: string } | null;

function NotificationsPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [open, setOpen] = useState<Open>(null);
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

  return (
    <div className="page-container">
      <PageHeader
        title="Notifications"
        subtitle="Approvals, rejections, change requests, DPR reminders, low-stock alerts and your daily approvals digest"
        extra={
          <Button icon={<CheckOutlined />} disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <Segmented value={filter} onChange={(v) => setFilter(v as 'ALL' | 'UNREAD')} options={[{ value: 'ALL', label: 'All' }, { value: 'UNREAD', label: `Unread (${unread})` }]} />
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
      </Card>
      <ProgressDrawer id={open?.type === 'PROGRESS' ? open.id : null} open={open?.type === 'PROGRESS'} onClose={closeDrawer} />
      <DprDrawer id={open?.type === 'DPR' ? open.id : null} open={open?.type === 'DPR'} onClose={closeDrawer} />
      <MrDrawer id={open?.type === 'MATERIAL_REQUEST' ? open.id : null} open={open?.type === 'MATERIAL_REQUEST'} onClose={closeDrawer} />
      <MachineryDrawer id={open?.type === 'MACHINERY' ? open.id : null} open={open?.type === 'MACHINERY'} onClose={closeDrawer} />
      <ExpenseDrawer id={open?.type === 'EXPENSE' ? open.id : null} open={open?.type === 'EXPENSE'} onClose={closeDrawer} />
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
