'use client';

import React from 'react';
import { Badge, Flex, Listy, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import type { NotificationDto } from '@erp/shared';
import { NOTIFICATION_TYPE_LABELS } from '@erp/shared';
import { dayLabel, formatDateTime, timeAgo } from '@/lib/format';
import { ListRowMeta } from '@/components/common/ListRowMeta';

/** Notifications under day headings (Today, Yesterday, …), newest first; unread ones tinted and marked with a dot. */
export function NotificationFeed({ items, onOpen, compact }: { items: NotificationDto[]; onOpen: (n: NotificationDto) => void; compact?: boolean }) {
  const days: { label: string; items: NotificationDto[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(n);
    else days.push({ label, items: [n] });
  }
  const pad = compact ? `${tk.space[2]} ${tk.space[3]}` : `${tk.space[3]} ${tk.space[4]}`;

  return (
    <div>
      {days.map((d) => (
        <section key={d.label} aria-label={d.label}>
          <Typography.Text type="secondary" strong style={{ display: 'block', fontSize: tk.type.caption.fontSize, padding: `${tk.space[2]} ${compact ? tk.space[3] : tk.space[4]}px`, background: tk.color.surface.sunken }}>
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
                style={{ cursor: 'pointer', padding: pad, background: n.readAt ? undefined : tk.color.accent.soft, borderBottom: `1px solid ${tk.color.line.hairline}` }}
              >
                <ListRowMeta
                  avatar={<Badge dot={!n.readAt} offset={[-2, 8]} />}
                  title={
                    <span style={{ display: 'flex', gap: tk.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: n.readAt ? tk.type.strong.fontWeight : 700 }}>{n.title}</span>
                      {compact ? null : (
                        <AppTag variant="kind" style={{ margin: 0 }}>
                          {NOTIFICATION_TYPE_LABELS[n.type]}
                        </AppTag>
                      )}
                    </span>
                  }
                  description={
                    <>
                      <div style={{ fontSize: compact ? tk.type.caption.fontSize : undefined }}>{n.body}</div>
                      {n.projectName ? <div style={{ fontSize: tk.type.caption.fontSize, color: tk.color.text.faint }}>{n.projectName}</div> : null}
                    </>
                  }
                />
                <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize, whiteSpace: 'nowrap' }} title={formatDateTime(n.createdAt)}>
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
