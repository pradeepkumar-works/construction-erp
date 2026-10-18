'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Drawer, Flex, Grid, Segmented, Spin, Tabs, Typography, theme } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import type { NotificationDto, NotificationTab, SubmissionType } from '@erp/shared';
import { NOTIFICATION_TABS, NOTIFICATION_TAB_LABELS, SUBMISSION_TYPES } from '@erp/shared';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/queries';
import { EmptyArt } from '@/components/common/EmptyArt';
import { notificationHref } from './notificationTarget';
import { NotificationFeed } from './NotificationFeed';
import type { OpenSubmission } from './SubmissionRecordDrawer';
import { inSentence } from '@/lib/format';

// Every submission's record drawer, loaded the first time a notification opens one.
const SubmissionRecordDrawer = dynamic(() => import('./SubmissionRecordDrawer').then((m) => m.SubmissionRecordDrawer), { ssr: false });

const EMPTY: Record<NotificationTab, string> = {
  FOR_ME: 'Approvals and rejections of your entries, drawings issued, risks, snags and safety reports land here.',
  APPROVALS: 'Entries sent to you for approval, and the morning digest of what waits on you, land here.',
  REMINDERS: 'Missing DPRs, tests due, low stock, payments, machine papers and guarantees falling due land here.',
};

/** A submission notification opens its record in a drawer over the page; any other opens its page. */
export function submissionOf(n: NotificationDto): OpenSubmission {
  return n.entityType && n.entityId && (SUBMISSION_TYPES as readonly string[]).includes(n.entityType) ? { type: n.entityType as SubmissionType, id: n.entityId } : null;
}

/**
 * Notifications centre (UI roadmap item 63): the header bell opens a drawer with For me, Approvals and Reminders tabs,
 * each grouped by day with its own unread count and Mark all read. A submission opens in place, over the current page.
 */
export function NotificationBell() {
  const router = useRouter();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>('FOR_ME');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [record, setRecord] = useState<OpenSubmission>(null);
  // Kept mounted after the first record so closing one animates out.
  const [recordsUsed, setRecordsUsed] = useState(false);
  // The badge needs only the counts; the drawer's list is fetched while it is open.
  const { data: counts } = useNotifications({ limit: 1 });
  const { data, isLoading } = useNotifications({ tab, limit: 60, unreadOnly: unreadOnly || undefined }, open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = counts?.unreadCount ?? 0;
  const byTab = data?.unreadByTab ?? counts?.unreadByTab;

  // Open on the first tab with something unread.
  useEffect(() => {
    if (!open) return;
    const first = NOTIFICATION_TABS.find((t) => (counts?.unreadByTab?.[t] ?? 0) > 0);
    if (first) setTab(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening: counts arriving later must not move the tab under the reader
  }, [open]);

  const openItem = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate(n.id);
    const sub = submissionOf(n);
    if (sub) {
      setRecordsUsed(true);
      setRecord(sub);
      return;
    }
    setOpen(false);
    router.push(notificationHref(n));
  };

  const items = data?.items ?? [];
  const tabUnread = byTab?.[tab] ?? 0;
  const body = (
    <Spin spinning={isLoading && open}>
      <Flex justify="space-between" align="center" style={{ padding: `${token.paddingXS}px ${token.paddingSM}px`, borderBottom: `1px solid ${token.colorSplit}` }}>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {tabUnread ? `${tabUnread} unread` : 'Nothing unread'}
        </Typography.Text>
        <Segmented
          size="small"
          aria-label="Show"
          value={unreadOnly ? 'UNREAD' : 'ALL'}
          onChange={(v) => setUnreadOnly(v === 'UNREAD')}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'UNREAD', label: 'Unread' },
          ]}
        />
      </Flex>
      {items.length ? (
        <NotificationFeed items={items} onOpen={openItem} compact />
      ) : isLoading ? (
        <div style={{ minHeight: 160 }} />
      ) : (
        <div style={{ padding: token.paddingLG }}>
          <EmptyArt art="approved" title={unreadOnly ? 'You are all caught up.' : `No ${inSentence(NOTIFICATION_TAB_LABELS[tab])} notifications yet`}>
            {unreadOnly ? null : EMPTY[tab]}
          </EmptyArt>
        </div>
      )}
    </Spin>
  );

  return (
    <>
      <Badge count={unread} size="small" offset={[-4, 4]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} style={{ height: 40, width: 40 }} onClick={() => setOpen(true)} />
      </Badge>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        size={screens.sm ? 440 : '100%'}
        styles={{ body: { padding: 0 }, footer: { textAlign: 'center' } }}
        extra={
          <Button size="small" type="text" icon={<CheckOutlined />} disabled={tabUnread === 0} loading={markAll.isPending} onClick={() => markAll.mutate(tab)}>
            Mark all read
          </Button>
        }
        footer={
          <Link href="/notifications" className="text-link" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        }
      >
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as NotificationTab)}
          tabBarStyle={{ padding: `0 ${token.paddingSM}px`, marginBottom: 0 }}
          items={NOTIFICATION_TABS.map((t) => ({
            key: t,
            label: (
              <Flex gap={token.marginXXS} align="center">
                {NOTIFICATION_TAB_LABELS[t]}
                {byTab?.[t] ? <Badge count={byTab[t]} size="small" color={token.colorPrimary} /> : null}
              </Flex>
            ),
            children: t === tab ? body : null,
          }))}
        />
      </Drawer>
      {recordsUsed ? <SubmissionRecordDrawer open={record} onClose={() => setRecord(null)} /> : null}
    </>
  );
}
