'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Typography, theme } from 'antd';
import { HEALTH_LABELS, type AttentionItemDto } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { CheckCircleOutlined } from '@/components/common/icons';
import { HEALTH_TONES } from './report-format';

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
  const { token } = theme.useToken();
  const [all, setAll] = useState(false);
  if (!items.length)
    return (
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        <CheckCircleOutlined
          style={{
            color: token.colorSuccessText,
            marginInlineEnd: token.marginXS,
          }}
        />
        {empty}
      </Typography.Paragraph>
    );
  const shown = all ? items : items.slice(0, FIRST);
  const line = `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`;
  return (
    <>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map((a, i) => (
          <li
            key={`${a.projectId}-${a.key}-${i}`}
            style={{
              display: 'flex',
              gap: token.marginSM,
              alignItems: 'flex-start',
              padding: `${token.paddingXS}px 0`,
              minHeight: 44,
              borderBlockStart: i ? line : undefined,
            }}
          >
            <AppTag tone={HEALTH_TONES[a.level]} style={{ flex: '0 0 auto', marginTop: 1 }}>
              {HEALTH_LABELS[a.level]}
            </AppTag>
            <p style={{ margin: 0, minWidth: 0 }}>
              {oneProject ? (
                <span translate="no">{a.text}</span>
              ) : (
                <>
                  <Link href={`/management/projects/${a.projectId}`} translate="no" style={{ fontWeight: token.fontWeightStrong }}>
                    {a.projectCode}
                  </Link>
                  <span style={{ color: token.colorTextSecondary }}>: </span>
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
