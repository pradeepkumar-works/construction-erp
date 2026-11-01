'use client';

import React from 'react';
import { tk } from '@/ds';
import { NO_VALUE, formatINR } from '@/lib/format';

/** Rupees on screen: the shared `.mono` figures on one line, kept out of page translation, and the no-value dash when empty. */
export function Money({ value, paise = false, strong = false, tone }: { value: string | number | null | undefined; paise?: boolean; strong?: boolean; tone?: 'danger' | 'success' }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted">{NO_VALUE}</span>;
  const color = tone ? tk.color.tone[tone].fg : undefined;
  const Tag = strong ? 'strong' : 'span';
  return (
    <Tag className="mono" translate="no" style={{ whiteSpace: 'nowrap', color }}>
      {formatINR(value, paise)}
    </Tag>
  );
}
