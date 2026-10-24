'use client';

import React from 'react';
import { Button } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CloseOutlined } from '@ant-design/icons';
import { formatDate } from '@/lib/format';
import type { ListFilters } from '@/lib/listPage';

/** How each filter reads on its chip; filters without one (sort) get no chip. */
export type ChipLabels = Record<string, (value: string) => string>;

/**
 * The filters in force as removable chips ("Status: Submitted ×", "1 Oct to 16 Oct ×"), with Clear all. A date range is
 * one chip.
 */
export function FilterChips({ filters, labels, onClear, onClearAll }: { filters: ListFilters; labels: ChipLabels; onClear: (keys: string[]) => void; onClearAll: () => void }) {
  const chips: { keys: string[]; text: string }[] = [];
  if (filters.from || filters.to) {
    const text = filters.from && filters.to ? `${formatDate(filters.from)} to ${formatDate(filters.to)}` : filters.from ? `From ${formatDate(filters.from)}` : `Up to ${formatDate(filters.to)}`;
    chips.push({ keys: ['from', 'to'], text });
  }
  for (const [k, v] of Object.entries(filters)) {
    if (!v || k === 'from' || k === 'to' || !labels[k]) continue;
    chips.push({ keys: [k], text: labels[k](v) });
  }
  if (!chips.length) return null;
  return (
    <>
      {chips.map((c) => (
        <AppTag key={c.keys.join()} closable onClose={() => onClear(c.keys)} closeIcon={<CloseOutlined aria-label={`Remove ${c.text}`} />} style={{ margin: 0 }}>
          {c.text}
        </AppTag>
      ))}
      {chips.length > 1 && (
        <Button type="link" size="small" onClick={onClearAll}>
          Clear all
        </Button>
      )}
    </>
  );
}
