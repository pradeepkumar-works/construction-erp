'use client';

import React from 'react';
import type { MarkupColor, MarkupKind, MarkupPoint } from '@erp/shared';
import { BRAND } from '@/lib/brand';

export const MARKUP_INK: Record<MarkupColor, string> = {
  RED: BRAND.colors.markupRed,
  BLUE: BRAND.colors.markupBlue,
  GREEN: BRAND.colors.markupGreen,
  ORANGE: BRAND.colors.markupOrange,
};

/** Width of the overlay's coordinate space; its height follows the page's shape. */
export const VB_W = 1000;

export interface ShownMark {
  id: string;
  label: string;
  kind: MarkupKind;
  points: MarkupPoint[];
  color: MarkupColor;
  note: string | null;
  /** Resolved marks are drawn faint, carried ones dashed */
  faint?: boolean;
  carried?: boolean;
}

/** A revision cloud round the box between two corners: small arcs bulging outwards, about `step` long. */
function cloudPath(x1: number, y1: number, x2: number, y2: number, step: number) {
  const [l, r] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [t, b] = [Math.min(y1, y2), Math.max(y1, y2)];
  const corners: [number, number][] = [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
  ];
  let d = `M${l},${t}`;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      const rad = len / n / 2;
      d += ` A${rad},${rad} 0 0 1 ${x},${y}`;
    }
  }
  return d;
}

/**
 * One mark in the overlay's units (`VB_W` wide, `vbH` high). `px` is how many units a screen pixel is at this zoom,
 * so pins, labels and line widths stay the same size on screen while the drawing zooms.
 */
export function MarkShape({ mark, vbH, px, selected }: { mark: ShownMark; vbH: number; px: number; selected?: boolean }) {
  const ink = MARKUP_INK[mark.color];
  const pts = mark.points.map(([x, y]) => [x * VB_W, y * vbH] as const);
  const sw = (selected ? 4 : 2.5) * px;
  const dash = mark.carried ? `${6 * px} ${4 * px}` : undefined;
  const common = { stroke: ink, strokeWidth: sw, fill: 'none', strokeDasharray: dash, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const tag = (x: number, y: number) => (
    <text x={x + 6 * px} y={y - 6 * px} fontSize={12 * px} fontWeight={600} fill={ink} stroke="#fff" strokeWidth={3 * px} paintOrder="stroke" style={{ userSelect: 'none' }}>
      {mark.label}
    </text>
  );
  let shape: React.ReactNode = null;
  const [a, b] = pts;
  switch (mark.kind) {
    case 'PIN': {
      const r = (selected ? 14 : 12) * px;
      shape = (
        <>
          <circle cx={a[0]} cy={a[1]} r={r} fill={ink} stroke="#fff" strokeWidth={2 * px} strokeDasharray={dash} />
          <text x={a[0]} y={a[1]} fontSize={11 * px} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ userSelect: 'none' }}>
            {mark.label.replace(/^M/, '')}
          </text>
        </>
      );
      return (
        <g data-mark={mark.id} opacity={mark.faint ? 0.45 : 1} style={{ cursor: 'pointer' }}>
          {shape}
        </g>
      );
    }
    case 'RECT':
      if (!b) return null;
      shape = <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} {...common} />;
      break;
    case 'CLOUD':
      if (!b) return null;
      shape = <path d={cloudPath(a[0], a[1], b[0], b[1], 16 * px)} {...common} />;
      break;
    case 'ARROW': {
      if (!b) return null;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = 14 * px;
      const h1 = [b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45)];
      const h2 = [b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45)];
      shape = (
        <>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} />
          <polygon points={`${b[0]},${b[1]} ${h1[0]},${h1[1]} ${h2[0]},${h2[1]}`} fill={ink} stroke={ink} strokeWidth={sw / 2} />
        </>
      );
      break;
    }
    case 'PEN':
      shape = <polyline points={pts.map((p) => p.join(',')).join(' ')} {...common} />;
      break;
    case 'TEXT': {
      // Text keeps its size on the sheet, like writing on the paper.
      const size = VB_W * 0.016;
      shape = (
        <text x={a[0]} y={a[1]} fontSize={size} fontWeight={600} fill={ink} stroke="#fff" strokeWidth={size * 0.25} paintOrder="stroke" dominantBaseline="hanging" style={{ userSelect: 'none', whiteSpace: 'pre' }}>
          {(mark.note ?? '').split('\n').map((line, i) => (
            <tspan key={i} x={a[0]} dy={i ? size * 1.25 : 0}>
              {line}
            </tspan>
          ))}
        </text>
      );
      break;
    }
  }
  // A wide clear stroke under thin marks, so they are easy to pick with a finger.
  const hit =
    mark.kind === 'TEXT' ? null : mark.kind === 'RECT' || mark.kind === 'CLOUD' ? (
      b ? <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill="none" stroke="transparent" strokeWidth={16 * px} /> : null
    ) : (
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="transparent" strokeWidth={16 * px} />
    );
  return (
    <g data-mark={mark.id} opacity={mark.faint ? 0.45 : 1} style={{ cursor: 'pointer' }}>
      {hit}
      {shape}
      {mark.kind !== 'TEXT' && tag(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])))}
    </g>
  );
}
