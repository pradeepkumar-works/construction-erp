'use client';

import React from 'react';
import { theme } from 'antd';
import { NO_VALUE, formatINR } from '@/lib/format';

/** Rupees on screen: the shared `.mono` figures on one line, kept out of page translation, and the no-value dash when empty. */
export function Money({ value, paise = false, strong = false, tone }: { value: string | number | null | undefined; paise?: boolean; strong?: boolean; tone?: 'danger' | 'success' }) {
  const { token } = theme.useToken();
  if (value === null || value === undefined || value === '') return <span className="text-muted">{NO_VALUE}</span>;
  const color = tone === 'danger' ? token.colorErrorText : tone === 'success' ? token.colorSuccessText : undefined;
  const Tag = strong ? 'strong' : 'span';
  return (
    <Tag className="mono" translate="no" style={{ whiteSpace: 'nowrap', color }}>
      {formatINR(value, paise)}
    </Tag>
  );
}
