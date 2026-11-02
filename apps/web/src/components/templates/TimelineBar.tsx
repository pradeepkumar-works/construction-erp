'use client';

import React from 'react';
import { tk } from '@/ds';

/** A thin bar showing where an activity sits in the template span (or project period). */
export function TimelineBar({ start, length, span, color = tk.color.accent.solid }: { start: number; length: number; span: number; color?: string }) {
  const s = span > 0 ? Math.min(100, (start / span) * 100) : 0;
  const w = span > 0 ? Math.max(1.5, Math.min(100 - s, (length / span) * 100)) : 0;
  return (
    <div style={{ position: 'relative', height: 10, background: tk.color.tone.neutral.bg, borderRadius: tk.radius.pill, minWidth: 120 }}>
      <div style={{ position: 'absolute', left: `${s}%`, width: `${w}%`, top: 0, bottom: 0, background: color, borderRadius: tk.radius.pill }} />
    </div>
  );
}
