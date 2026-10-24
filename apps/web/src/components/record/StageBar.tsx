'use client';

import React from 'react';
import { theme } from 'antd';

/** One stage: its name, and when or by whom (or what it waits for) under it. */
export interface Stage {
  title: React.ReactNode;
  content?: React.ReactNode;
}

export interface StageBarProps {
  /** The stage the entry is at (0-based). Stages before it are done. */
  current: number;
  /** How the current stage stands: in hand, finished (every stage done), or stopped there (rejected, sent back). */
  status?: 'process' | 'finish' | 'error';
  items: Stage[];
  /** What the list is, for a screen reader. */
  label?: string;
  style?: React.CSSProperties;
}

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/**
 * Where an entry stands (a record's lifecycle, an import's steps), drawn on the brand's datum line: each stage is a 3 px
 * line with its name and detail under it. Done stages and the current one are blue, a stage the entry stopped at
 * (rejected, sent back) is red, and what is still to come is a hairline with quiet text. The stages wrap onto a second row
 * on a narrow screen rather than squeezing.
 */
export function StageBar({ current, status = 'process', items, label = 'Stages', style }: StageBarProps) {
  const { token } = theme.useToken();
  return (
    <ol
      aria-label={label}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
        gap: `${token.marginSM}px ${token.marginXS}px`,
        ...style,
      }}
    >
      {items.map((item, i) => {
        const done = i < current || (i === current && status === 'finish');
        const here = i === current && status !== 'finish';
        const stopped = here && status === 'error';
        const line = stopped ? token.colorError : done || here ? token.colorPrimary : token.colorBorderSecondary;
        const state = stopped ? 'stopped here' : here ? 'current stage' : done ? 'done' : 'to come';
        return (
          <li key={i} aria-current={here ? 'step' : undefined} style={{ display: 'grid', alignContent: 'start', gap: token.marginXXS, minWidth: 0 }}>
            <span aria-hidden style={{ display: 'block', height: 3, borderRadius: 2, background: line, marginBottom: token.marginXXS }} />
            <span
              style={{
                fontWeight: done || here ? 600 : 400,
                color: stopped ? token.colorErrorText : done || here ? token.colorText : token.colorTextSecondary,
                lineHeight: token.lineHeight,
              }}
            >
              {item.title}
              <span style={srOnly}>, {state}</span>
            </span>
            {item.content ? (
              <span style={{ fontSize: token.fontSizeSM, lineHeight: token.lineHeightSM, color: here && !stopped ? token.colorWarningText : token.colorTextSecondary }}>
                {item.content}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
