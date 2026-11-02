'use client';

import React from 'react';
import { Tooltip } from 'antd';
import { tk } from '@/ds';
import { COST_HEADS, COST_HEAD_LABELS, type CostHead, type CostHeadsDto } from '@erp/shared';
import { formatINR, toNumber } from '@/lib/format';
import { BRAND } from '@/lib/brand';

export const HEAD_COLORS: Record<CostHead, string> = {
  material: tk.color.accent.solid,
  subcontract: BRAND.colors.costSubcontract,
  labour: BRAND.colors.costLabour,
  machinery: BRAND.colors.costMachinery,
  expenses: BRAND.colors.costExpenses,
};

/** Horizontal stacked bar of the cost heads; `scale` is the value of a full-width bar. */
export function CostBar({ cost, scale, height = 14 }: { cost: CostHeadsDto; scale: number; height?: number }) {
  const max = Math.max(scale, toNumber(cost.total), 1);
  return (
    <div style={{ display: 'flex', height, background: tk.color.tone.neutral.bg, borderRadius: tk.radius.sm, overflow: 'hidden' }}>
      {COST_HEADS.map((h) => {
        const v = toNumber(cost[h]);
        if (v <= 0) return null;
        return (
          <Tooltip key={h} title={`${COST_HEAD_LABELS[h]}: ${formatINR(v)}`}>
            <div style={{ width: `${(v / max) * 100}%`, background: HEAD_COLORS[h] }} />
          </Tooltip>
        );
      })}
    </div>
  );
}

export function CostLegend() {
  return (
    <div style={{ display: 'flex', gap: tk.space[4], flexWrap: 'wrap', fontSize: tk.type.caption.fontSize }}>
      {COST_HEADS.map((h) => (
        <CostHeadTitle key={h} head={h} />
      ))}
    </div>
  );
}

/** A cost head's name in the text colour, after a swatch in its chart colour (the colour alone fails contrast as text). */
export function CostHeadTitle({ head }: { head: CostHead }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: tk.space[2] }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: tk.radius.xs, background: HEAD_COLORS[head], display: 'inline-block', flex: 'none' }} />
      {COST_HEAD_LABELS[head]}
    </span>
  );
}
