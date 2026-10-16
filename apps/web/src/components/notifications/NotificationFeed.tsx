'use client';

import React from 'react';
import { Badge, Flex, Listy, Tag, Typography, theme } from 'antd';
import type { NotificationDto } from '@erp/shared';
import { NOTIFICATION_TYPE_LABELS } from '@erp/shared';
import { NOTIFICATION_COLORS, dayLabel, formatDateTime, timeAgo } from '@/lib/format';
import { ListRowMeta } from '@/components/common/ListRowMeta';

/** Notifications under day headings (Today, Yesterday, …), newest first; unread ones tinted and marked with a dot. */
export function NotificationFeed({ items, onOpen, compact }: { items: NotificationDto[]; onOpen: (n: NotificationDto) => void; compact?: boolean }) {
  const { token } = theme.useToken();
  const days: { label: string; items: NotificationDto[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(n);
    else days.push({ label, items: [n] });
  }
  const pad = compact ? `${token.paddingXS}px ${token.paddingSM}px` : `${token.paddingSM}px ${token.padding}px`;

  return (
    <div>
      {days.map((d) => (
        <section key={d.label} aria-label={d.label}>
          <Typography.Text type="secondary" strong style={{ display: 'block', fontSize: token.fontSizeSM, padding: `${token.paddingXS}px ${compact ? token.paddingSM : token.padding}px`, background: token.colorFillQuaternary }}>
            {d.label}
          </Typography.Text>
          <Listy<NotificationDto>
            items={d.items}
            rowKey="id"
            styles={{ item: { padding: 0 } }}
            itemRender={(n) => (
              <Flex
                gap="middle"
                align="flex-start"
                role="button"
                tabIndex={0}
                data-unread={n.readAt ? undefined : 'true'}
                onClick={() => onOpen(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(n);
                  }
                }}
                style={{ cursor: 'pointer', padding: pad, background: n.readAt ? undefined : token.colorPrimaryBg, borderBottom: `1px solid ${token.colorSplit}` }}
              >
                <ListRowMeta
                  avatar={<Badge dot={!n.readAt} offset={[-2, 8]} />}
                  title={
                    <span style={{ display: 'flex', gap: token.marginXS, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: n.readAt ? 500 : 700 }}>{n.title}</span>
                      {compact ? null : (
                        <Tag color={NOTIFICATION_COLORS[n.type]} style={{ margin: 0 }}>
                          {NOTIFICATION_TYPE_LABELS[n.type]}
                        </Tag>
                      )}
                    </span>
                  }
                  description={
                    <>
                      <div style={{ fontSize: compact ? token.fontSizeSM : undefined }}>{n.body}</div>
                      {n.projectName ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>{n.projectName}</div> : null}
                    </>
                  }
                />
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM, whiteSpace: 'nowrap' }} title={formatDateTime(n.createdAt)}>
                  {timeAgo(n.createdAt)}
                </Typography.Text>
              </Flex>
            )}
          />
        </section>
      ))}
    </div>
  );
}
