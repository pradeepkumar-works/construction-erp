'use client';

import React from 'react';
import type { MarkupPoint, TakeoffKind } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { VB_W } from './MarkupLayer';

export const TAKEOFF_INK = BRAND.colors.takeoff;
export const SCALE_INK = BRAND.colors.takeoffScale;

export interface ShownTakeoff {
  id: string;
  /** "T3 12.45 m", or the figure so far while measuring */
  label: string;
  kind: TakeoffKind | 'SCALE';
  points: MarkupPoint[];
}

/** Where a label sits: the middle of the line's longest stretch, the middle of an outline, or above the first thing counted. */
function labelAt(kind: ShownTakeoff['kind'], pts: (readonly [number, number])[]): readonly [number, number] {
  if (kind === 'AREA') return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  if (kind === 'COUNT' || pts.length < 2) return pts[0];
  let best = 0;
  let at: readonly [number, number] = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d > best) {
      best = d;
      at = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2];
    }
  }
  return at;
}

/**
 * A measure in the overlay's units, like `MarkShape`: a line through its points, a shaded outline, or a dot on each thing
 * counted, with its label; the scale is a dashed line with end ticks. `hover` is where the pointer is while measuring, for
 * the stretch still to be clicked.
 */
export function TakeoffShape({ t, vbH, px, selected, hover, drafting }: { t: ShownTakeoff; vbH: number; px: number; selected?: boolean; hover?: MarkupPoint | null; drafting?: boolean }) {
  const ink = t.kind === 'SCALE' ? SCALE_INK : TAKEOFF_INK;
  const pts = t.points.map(([x, y]) => [x * VB_W, y * vbH] as const);
  if (!pts.length) return null;
  const h = hover ? ([hover[0] * VB_W, hover[1] * vbH] as const) : null;
  const sw = (selected ? 3.5 : 2.5) * px;
  const line = {
    stroke: ink,
    strokeWidth: sw,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const dot = (p: readonly [number, number], i: number) => <circle key={i} cx={p[0]} cy={p[1]} r={(drafting ? 3.5 : 2.5) * px} fill="#fff" stroke={ink} strokeWidth={1.5 * px} />;
  const [lx, ly] = labelAt(t.kind, pts);
  const label = t.label ? (
    <text x={lx} y={ly - 8 * px} fontSize={12 * px} fontWeight={600} fill={ink} stroke="#fff" strokeWidth={3 * px} paintOrder="stroke" textAnchor="middle" style={{ userSelect: 'none' }}>
      {t.label}
    </text>
  ) : null;
  const path = pts.map((p) => p.join(',')).join(' ');
  let shape: React.ReactNode;
  if (t.kind === 'COUNT') {
    shape = pts.map((p, i) => (
      <g key={i}>
        <circle cx={p[0]} cy={p[1]} r={(selected ? 9 : 8) * px} fill={ink} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5 * px} />
        <text x={p[0]} y={p[1]} fontSize={9 * px} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ userSelect: 'none' }}>
          {i + 1}
        </text>
      </g>
    ));
  } else if (t.kind === 'AREA') {
    shape = (
      <>
        <polygon points={h && drafting ? `${path} ${h.join(',')}` : path} {...line} fill={ink} fillOpacity={selected ? 0.22 : 0.12} strokeDasharray={drafting ? `${5 * px} ${3 * px}` : undefined} />
        {drafting ? pts.map(dot) : null}
      </>
    );
  } else {
    const tick = (p: readonly [number, number], q: readonly [number, number]) => {
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
      const r = 7 * px;
      return <line x1={p[0] - r * Math.cos(ang)} y1={p[1] - r * Math.sin(ang)} x2={p[0] + r * Math.cos(ang)} y2={p[1] + r * Math.sin(ang)} stroke={ink} strokeWidth={sw} />;
    };
    const last = pts[pts.length - 1];
    shape = (
      <>
        <polyline points={path} {...line} strokeDasharray={t.kind === 'SCALE' ? `${8 * px} ${4 * px}` : undefined} />
        {h && drafting ? <line x1={last[0]} y1={last[1]} x2={h[0]} y2={h[1]} {...line} strokeDasharray={`${5 * px} ${3 * px}`} /> : null}
        {pts.length > 1 ? tick(pts[0], pts[1]) : null}
        {pts.length > 1 ? tick(last, pts[pts.length - 2]) : null}
        {drafting ? pts.map(dot) : null}
      </>
    );
  }
  return (
    <g data-takeoff={drafting ? undefined : t.id} style={{ cursor: drafting ? undefined : 'pointer' }}>
      {/* A wide clear stroke, so a thin line is easy to pick with a finger. */}
      {!drafting && t.kind !== 'COUNT' ? <polyline points={t.kind === 'AREA' ? `${path} ${pts[0].join(',')}` : path} fill="none" stroke="transparent" strokeWidth={16 * px} /> : null}
      {shape}
      {label}
    </g>
  );
}
