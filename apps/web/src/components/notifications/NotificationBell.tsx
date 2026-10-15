'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Empty, Flex, Listy, Popover, Typography } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import type { NotificationDto } from '@erp/shared';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/queries';
import { timeAgo } from '@/lib/format';
import { notificationHref } from './notificationTarget';
import { themeColor } from '@/lib/theme';
import { ListRowMeta } from '@/components/common/ListRowMeta';

/** Header bell: unread badge, the latest notifications in a popover, and a link to the full page. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useNotifications({ limit: 8 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = data?.unreadCount ?? 0;

  const openItem = (n: NotificationDto) => {
    setOpen(false);
    if (!n.readAt) markRead.mutate(n.id);
    router.push(notificationHref(n));
  };

  const content = (
    <div style={{ width: 360, maxWidth: '85vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Typography.Text strong>Notifications</Typography.Text>
        <Button type="link" size="small" icon={<CheckOutlined />} disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
          Mark all read
        </Button>
      </div>
      {data?.items.length ? (
        <Listy<NotificationDto>
          items={data.items}
          rowKey="id"
          styles={{ root: { maxHeight: 380, overflow: 'auto' }, item: { padding: 0, border: 0 } }}
          itemRender={(n) => (
            <Flex onClick={() => openItem(n)} style={{ cursor: 'pointer', padding: '8px 4px', background: n.readAt ? undefined : themeColor('colorPrimaryBg'), borderRadius: 4, borderBottom: `1px solid ${themeColor('colorSplit')}` }}>
              <ListRowMeta
                avatar={<Badge dot={!n.readAt} offset={[-2, 6]} />}
                title={<span style={{ fontWeight: n.readAt ? 500 : 700, fontSize: 13 }}>{n.title}</span>}
                description={
                  <>
                    <div style={{ fontSize: 12, color: themeColor('colorTextSecondary') }}>{n.body}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </>
                }
              />
            </Flex>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications yet" />
      )}
      <div style={{ textAlign: 'center', borderTop: `1px solid ${themeColor('colorBorderSecondary')}`, paddingTop: 8, marginTop: 4 }}>
        <Link href="/notifications" onClick={() => setOpen(false)}>
          View all notifications
        </Link>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" arrow={false}>
      <Badge count={unread} size="small" offset={[-4, 4]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Notifications" style={{ height: 40, width: 40 }} />
      </Badge>
    </Popover>
  );
}
