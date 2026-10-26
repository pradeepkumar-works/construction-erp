'use client';

import React from 'react';
import { Card, theme } from 'antd';
import { DISPLAY_FONT } from '@/lib/theme';

export interface StripFigure {
  key: string;
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Bad news (a loss, money overdue) in the danger colour, good news in the success colour. */
  tone?: 'danger' | 'success';
}

/**
 * The headline figures of a management page as type, not tiles (tasteskill, app screens): one card split by hairlines, the
 * first figure larger as the lead. On a phone the figures wrap two to a row and the hairlines follow.
 */
export function FigureStrip({ figures, label }: { figures: StripFigure[]; label: string }) {
  const { token } = theme.useToken();
  const line = `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`;
  return (
    <Card size="small" styles={{ body: { padding: 0, overflow: 'hidden' } }}>
      <section aria-label={label}>
        {/* Each figure draws its hairline on its left and top; the strip pulls in by one, so only the inner lines show. */}
        <dl
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            margin: `-${token.lineWidth}px 0 0 -${token.lineWidth}px`,
          }}
        >
          {figures.map((f, i) => (
            <div
              key={f.key}
              style={{
                flex: i === 0 ? '1.4 1 220px' : '1 1 150px',
                padding: `${token.paddingSM}px ${token.padding}px`,
                borderInlineStart: line,
                borderBlockStart: line,
                minWidth: 0,
              }}
            >
              <dt
                style={{
                  color: token.colorTextSecondary,
                  fontSize: token.fontSizeSM,
                }}
              >
                {f.label}
              </dt>
              <dd
                className="mono"
                translate="no"
                style={{
                  margin: `${token.marginXXS}px 0 0`,
                  fontFamily: DISPLAY_FONT,
                  fontWeight: 700,
                  fontSize: i === 0 ? token.fontSizeHeading2 : token.fontSizeHeading4,
                  lineHeight: 1.15,
                  color: f.tone === 'danger' ? token.colorErrorText : f.tone === 'success' ? token.colorSuccessText : token.colorText,
                  whiteSpace: 'nowrap',
                }}
              >
                {f.value}
              </dd>
              {f.note ? (
                <dd
                  style={{
                    margin: `${token.marginXXS}px 0 0`,
                    color: token.colorTextSecondary,
                    fontSize: token.fontSizeSM,
                  }}
                >
                  {f.note}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </section>
    </Card>
  );
}
