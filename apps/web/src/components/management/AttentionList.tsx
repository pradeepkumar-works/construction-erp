'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Typography } from 'antd';
import { tk } from '@/ds';
import { HEALTH_LABELS, type AttentionItemDto } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { CheckCircleOutlined } from '@/components/common/icons';

const FIRST = 6;

/** What needs action or watching across the projects, the worst first, each with the project it is on. */
export function AttentionList({
  items,
  empty = 'Every project is on course: nothing needs action.',
  oneProject = false,
}: {
  items: AttentionItemDto[];
  empty?: string;
  oneProject?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (!items.length)
    return (
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        <CheckCircleOutlined
          style={{
            color: tk.color.tone.success.fg,
            marginInlineEnd: tk.space[2],
          }}
        />
        {empty}
      </Typography.Paragraph>
    );
  const shown = all ? items : items.slice(0, FIRST);
  const line = tk.line('hairline');
  return (
    <>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map((a, i) => (
          <li
            key={`${a.projectId}-${a.key}-${i}`}
            style={{
              display: 'flex',
              gap: tk.space[3],
              alignItems: 'flex-start',
              padding: `${tk.space[2]} 0`,
              minHeight: 44,
              borderBlockStart: i ? line : undefined,
            }}
          >
            <AppTag kind="health" status={a.level} style={{ flex: '0 0 auto', marginTop: tk.space.half }}>
              {HEALTH_LABELS[a.level]}
            </AppTag>
            <p style={{ margin: 0, minWidth: 0 }}>
              {oneProject ? (
                <span translate="no">{a.text}</span>
              ) : (
                <>
                  <Link href={`/management/projects/${a.projectId}`} translate="no" style={{ fontWeight: tk.type.title.fontWeight }}>
                    {a.projectCode}
                  </Link>
                  <span style={{ color: tk.color.text.muted }}>: </span>
                  <span translate="no">{a.text}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      {items.length > FIRST ? (
        <Button type="link" size="small" onClick={() => setAll((v) => !v)} style={{ paddingInline: 0 }}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      ) : null}
    </>
  );
}
