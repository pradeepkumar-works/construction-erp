'use client';

import React from 'react';
import { theme } from 'antd';
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
  const { token } = theme.useToken();
  const error = kind === 'error';
  const fg = error ? token.colorErrorText : token.colorPrimaryText;
  return (
    <span aria-hidden style={{ display: 'inline-grid', justifyItems: 'center', gap: token.marginSM }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 88, height: 88, borderRadius: '50%', background: error ? token.colorErrorBg : token.colorPrimaryBg, color: fg, fontSize: 40 }}>
        {icon ?? (kind ? MARKS[kind] : null)}
      </span>
      <span style={{ width: 48, height: 3, borderRadius: 2, background: error ? token.colorError : token.colorPrimary }} />
    </span>
  );
}
