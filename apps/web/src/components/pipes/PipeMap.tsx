'use client';

import React, { useMemo } from 'react';
import { Flex, theme } from 'antd';
import { SOURCE_NODE_KINDS, VALVE_NODE_KINDS, type PipeNodeDto, type PipeSegmentDto } from '@erp/shared';
import { formatQty } from '@/lib/format';

/** How far along a segment is, as the map draws it. */
export type SegmentState = 'existing' | 'notStarted' | 'inProgress' | 'laid' | 'tested';

export const SEGMENT_STATE_LABELS: Record<SegmentState, string> = {
  existing: 'Existing line',
  notStarted: 'Not started',
  inProgress: 'Work started',
  laid: 'Laid end to end',
  tested: 'Tested',
};

export function segmentState(s: PipeSegmentDto): SegmentState {
  if (s.scope === 'EXISTING') return 'existing';
  const len = Number(s.lengthM);
  if (len > 0 && s.status.done.TEST >= len - 0.001) return 'tested';
  if (len > 0 && s.status.done.LAY_JOINT >= len - 0.001) return 'laid';
  return s.status.started ? 'inProgress' : 'notStarted';
}

const W = 1000;
const PAD = 40;

/**
 * Where each node sits on the map. A model file's coordinates when every node has them (y grows upwards, as in
 * EPANET); otherwise a tree drawn out from the tank or source, one column per pipe away from it.
 */
function layout(nodes: PipeNodeDto[], segments: PipeSegmentDto[]): { at: Map<string, [number, number]>; height: number } {
  const placed = nodes.length > 0 && nodes.every((n) => n.x !== null && n.y !== null);
  const raw = new Map<string, [number, number]>();
  if (placed) {
    for (const n of nodes) raw.set(n.id, [n.x!, -n.y!]);
  } else {
    const next = new Map<string, string[]>();
    for (const s of segments) {
      next.set(s.fromNodeId, [...(next.get(s.fromNodeId) ?? []), s.toNodeId]);
      next.set(s.toNodeId, [...(next.get(s.toNodeId) ?? []), s.fromNodeId]);
    }
    const roots = [...nodes.filter((n) => SOURCE_NODE_KINDS.includes(n.kind)), ...nodes];
    let row = 0;
    const walk = (id: string, depth: number) => {
      const kids = (next.get(id) ?? []).filter((k) => !raw.has(k));
      if (!kids.length) {
        raw.set(id, [depth, row++]);
        return;
      }
      raw.set(id, [depth, row]);
      kids.forEach((k, i) => {
        if (raw.has(k)) return;
        if (i > 0) row++;
        walk(k, depth + 1);
      });
    };
    for (const r of roots) if (!raw.has(r.id)) {
      walk(r.id, 0);
      row++;
    }
  }
  const xs = [...raw.values()].map((p) => p[0]);
  const ys = [...raw.values()].map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = x1 - x0 || 1;
  const spanY = y1 - y0 || 1;
  // Keep the drawing's shape, between a strip and a square.
  const height = Math.round(Math.min(W, Math.max(260, ((W - 2 * PAD) * spanY) / spanX + 2 * PAD)));
  const scale = Math.min((W - 2 * PAD) / spanX, (height - 2 * PAD) / spanY);
  const offX = (W - scale * spanX) / 2;
  const offY = (height - scale * spanY) / 2;
  const at = new Map<string, [number, number]>();
  for (const [id, [x, y]] of raw) at.set(id, [offX + (x - x0) * scale, offY + (y - y0) * scale]);
  return { at, height };
}

/**
 * A zone's network drawn from its nodes and pipes: each pipe in the state of its work, thicker for larger
 * diameters, the tank or source as a square and valves as diamonds (filled once fixed). The pipe list beside it says
 * the same in words, so the drawing is a picture, not a control.
 */
export function PipeMap({ nodes, segments, selected, label }: { nodes: PipeNodeDto[]; segments: PipeSegmentDto[]; selected?: string | null; label: string }) {
  const { token } = theme.useToken();
  const { at, height } = useMemo(() => layout(nodes, segments), [nodes, segments]);
  const stroke: Record<SegmentState, { color: string; dash?: string }> = {
    existing: { color: token.colorBorder, dash: '2 6' },
    notStarted: { color: token.colorTextTertiary, dash: '10 6' },
    inProgress: { color: token.colorWarning },
    laid: { color: token.colorPrimary },
    tested: { color: token.colorSuccess },
  };
  const dias = segments.map((s) => s.diameterMm);
  const [dMin, dMax] = [Math.min(...dias), Math.max(...dias)];
  const width = (d: number) => (dMax > dMin ? 2.5 + (4 * (d - dMin)) / (dMax - dMin) : 4);
  const labels = segments.length <= 40;
  const nodeLabels = nodes.length <= 60;
  const metres = (state: SegmentState) => segments.filter((s) => segmentState(s) === state).reduce((t, s) => t + Number(s.lengthM), 0);
  const states = (Object.keys(SEGMENT_STATE_LABELS) as SegmentState[]).filter((k) => segments.some((s) => segmentState(s) === k));

  return (
    <div>
      <div data-scroll-region style={{ overflowX: 'auto', border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer }}>
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', minWidth: 560, height: 'auto' }}>
          {segments.map((s) => {
            const a = at.get(s.fromNodeId);
            const b = at.get(s.toNodeId);
            if (!a || !b) return null;
            const st = stroke[segmentState(s)];
            const on = selected === s.id;
            return (
              <g key={s.id}>
                {on ? <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={token.colorPrimaryBorder} strokeWidth={width(s.diameterMm) + 10} strokeLinecap="round" /> : null}
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={st.color} strokeWidth={width(s.diameterMm)} strokeDasharray={st.dash} strokeLinecap="round">
                  <title>{`${s.code}, ${s.fromCode} to ${s.toCode}: ${formatQty(s.lengthM)} m, ${s.diameterMm} mm, ${SEGMENT_STATE_LABELS[segmentState(s)].toLowerCase()}`}</title>
                </line>
                {labels ? (
                  <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 8} textAnchor="middle" fontSize={13} fill={token.colorTextSecondary} paintOrder="stroke" stroke={token.colorBgContainer} strokeWidth={4}>
                    {s.code}
                  </text>
                ) : null}
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = at.get(n.id);
            if (!p) return null;
            const source = SOURCE_NODE_KINDS.includes(n.kind);
            const valve = VALVE_NODE_KINDS.includes(n.kind);
            const shape = source ? (
              <rect x={p[0] - 9} y={p[1] - 9} width={18} height={18} fill={token.colorPrimary} stroke={token.colorBgContainer} strokeWidth={2} />
            ) : valve ? (
              <path d={`M ${p[0]} ${p[1] - 8} L ${p[0] + 8} ${p[1]} L ${p[0]} ${p[1] + 8} L ${p[0] - 8} ${p[1]} Z`} fill={n.fixed ? token.colorText : token.colorBgContainer} stroke={token.colorText} strokeWidth={2} />
            ) : (
              <circle cx={p[0]} cy={p[1]} r={4.5} fill={token.colorText} stroke={token.colorBgContainer} strokeWidth={1.5} />
            );
            return (
              <g key={n.id}>
                {shape}
                <title>{n.code}</title>
                {nodeLabels || source ? (
                  <text x={p[0] + 10} y={p[1] + 16} fontSize={13} fill={token.colorText} paintOrder="stroke" stroke={token.colorBgContainer} strokeWidth={4}>
                    {n.code}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <Flex wrap gap="small" style={{ marginTop: token.marginXS, columnGap: token.marginMD }} aria-label="Map key" role="list">
        {states.map((k) => (
          <Flex key={k} align="center" gap={6} role="listitem">
            <svg width={28} height={10} aria-hidden="true">
              <line x1={2} y1={5} x2={26} y2={5} stroke={stroke[k].color} strokeWidth={4} strokeDasharray={stroke[k].dash ? '5 3' : undefined} />
            </svg>
            <span>
              {SEGMENT_STATE_LABELS[k]} <span translate="no">{formatQty(metres(k))} m</span>
            </span>
          </Flex>
        ))}
        <Flex align="center" gap={6} role="listitem">
          <svg width={14} height={14} aria-hidden="true">
            <rect x={1} y={1} width={12} height={12} fill={token.colorPrimary} />
          </svg>
          <span>Tank or source</span>
        </Flex>
        {nodes.some((n) => VALVE_NODE_KINDS.includes(n.kind)) ? (
          <Flex align="center" gap={6} role="listitem">
            <svg width={16} height={16} aria-hidden="true">
              <path d="M 8 1 L 15 8 L 8 15 L 1 8 Z" fill={token.colorText} />
            </svg>
            <span>Valve fixed (hollow: not yet)</span>
          </Flex>
        ) : null}
      </Flex>
    </div>
  );
}
