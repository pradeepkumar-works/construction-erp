'use client';

import React from 'react';
import { Tooltip, Typography } from 'antd';
import { formatChainage, type ChainageLayer } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { themeColor, themeFontSize } from '@/lib/theme';
import { formatDate, formatQty } from '@/lib/format';

const LABEL = 220;
const SIDE = 110;

/** A tick step (metres) that gives at most about ten ticks over the length. */
const tickStep = (length: number) => [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find((s) => length / s <= 10) ?? 200000;

/**
 * Road strip chart: one row per layer, the project's length left to right, approved stretches in green and stretches
 * waiting for approval in orange. Work at one point (a culvert) is a thin mark.
 */
export function ChainageStrip({ layers, start, end }: { layers: ChainageLayer[]; start: number | null; end: number | null }) {
  const all = layers.flatMap((l) => l.segments);
  const lo = start ?? (all.length ? Math.min(...all.map((s) => s.from)) : 0);
  const hi = end ?? (all.length ? Math.max(...all.map((s) => s.to)) : 1000);
  const length = Math.max(hi - lo, 1);
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - lo) / length) * 100))}%`;
  const step = tickStep(length);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

  return (
    <div className="chainage-strip" data-scroll-region aria-label="Chainage strip" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 22 }}>
          <div style={{ width: LABEL, flex: 'none' }} />
          <div style={{ position: 'relative', flex: 1, height: 22 }}>
            {ticks.map((t) => (
              <span key={t} className="text-muted" style={{ position: 'absolute', left: pct(t), transform: 'translateX(-50%)', fontSize: themeFontSize('fontSizeSM'), whiteSpace: 'nowrap' }}>
                {formatChainage(t)}
              </span>
            ))}
          </div>
          <div style={{ width: SIDE, flex: 'none', fontSize: themeFontSize('fontSizeSM'), textAlign: 'right' }} className="text-muted">
            done
          </div>
        </div>
        {layers.map((l) => (
          <div key={l.activityId} className="strip-row" data-activity={l.name} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${themeColor('colorBorderSecondary')}` }}>
            <div style={{ width: LABEL, flex: 'none', paddingRight: 12 }}>
              <div style={{ fontWeight: 500 }}>{l.name}</div>
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {formatQty(l.executedQty)} of {formatQty(l.plannedQty)} {l.unit}
                {Number(l.unplacedQty) ? ` · ${formatQty(l.unplacedQty)} with no chainage` : ''}
              </div>
            </div>
            <div style={{ position: 'relative', flex: 1, height: 18, background: themeColor('colorFillSecondary'), borderRadius: 3 }}>
              {ticks.map((t) => (
                <span key={t} style={{ position: 'absolute', left: pct(t), top: 0, bottom: 0, width: 1, background: themeColor('colorBorder') }} />
              ))}
              {l.segments.map((s) => {
                const point = s.to - s.from < length / 400;
                const colour = s.status === 'APPROVED' ? BRAND.colors.success : BRAND.colors.pending;
                return (
                  <Tooltip key={s.entryId} title={`${s.from === s.to ? `Ch ${formatChainage(s.from)}` : `Ch ${formatChainage(s.from)} to ${formatChainage(s.to)}`}: ${formatQty(s.quantity)} ${l.unit}, ${formatDate(s.date)}${s.status === 'APPROVED' ? '' : ' (waiting for approval)'}`}>
                    <span
                      className={`strip-seg strip-${s.status.toLowerCase()}`}
                      style={{
                        position: 'absolute',
                        left: pct(s.from),
                        width: point ? 4 : `calc(${pct(s.to)} - ${pct(s.from)})`,
                        marginLeft: point ? -2 : 0,
                        top: point ? -2 : 2,
                        bottom: point ? -2 : 2,
                        background: colour,
                        opacity: s.status === 'APPROVED' ? 0.9 : 0.55,
                        borderRadius: 2,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </div>
            <div style={{ width: SIDE, flex: 'none', textAlign: 'right', fontSize: themeFontSize('fontSizeSM') }}>
              {!l.coveredM && !l.pendingM && l.segments.length ? (
                // Work at points (culverts): count the places, a length means nothing.
                <div style={{ fontWeight: 600 }}>
                  {l.segments.length} place{l.segments.length === 1 ? '' : 's'}
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 600 }}>{start !== null && end !== null ? `${Math.round((l.coveredM / length) * 100)}%` : `${formatQty(l.coveredM)} m`}</div>
                  <div className="text-muted">
                    {(l.coveredM / 1000).toFixed(2)} km{l.pendingM ? ` + ${(l.pendingM / 1000).toFixed(2)} waiting` : ''}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: BRAND.colors.success, marginRight: 4, verticalAlign: 'middle' }} />
          approved
          <span style={{ display: 'inline-block', width: 10, height: 10, background: BRAND.colors.pending, opacity: 0.55, margin: '0 4px 0 12px', verticalAlign: 'middle' }} />
          waiting for approval. Overlapping entries count once.
        </Typography.Paragraph>
      </div>
    </div>
  );
}
