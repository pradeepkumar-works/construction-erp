'use client';

import React from 'react';
import { tk } from '@/ds';
import { CompassOutlined, ExclamationCircleOutlined, LockOutlined } from './icons';

/** What a full-page result is about. */
export type ResultKind = 'no-access' | 'not-found' | 'error';

const MARKS: Record<ResultKind, React.ReactNode> = { 'no-access': <LockOutlined />, 'not-found': <CompassOutlined />, error: <ExclamationCircleOutlined /> };

/**
 * A full-page result's picture in place of antd's 403, 404 and 500 drawings: the icon in Nirmaan blue (red for an error)
 * on its soft disc, standing on the datum line. Pass it as `Result`'s `icon`, with no `status`; `icon` takes any icon for
 * a result of another kind (offline, a module turned off).
 */
export function ResultMark({ kind, icon }: { kind?: ResultKind; icon?: React.ReactNode }) {
  const error = kind === 'error';
  const fg = error ? tk.color.tone.danger.fg : tk.color.accent.text;
  return (
    <span aria-hidden style={{ display: 'inline-grid', justifyItems: 'center', gap: tk.space[3] }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 88, height: 88, borderRadius: '50%', background: error ? tk.color.tone.danger.bg : tk.color.accent.soft, color: fg, fontSize: tk.space[8] }}>
        {icon ?? (kind ? MARKS[kind] : null)}
      </span>
      <span style={{ width: 48, height: 3, borderRadius: tk.radius.xs, background: error ? tk.color.tone.danger.solid : tk.color.accent.solid }} />
    </span>
  );
}
