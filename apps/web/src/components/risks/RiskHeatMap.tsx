'use client';

import React from 'react';
import { Tooltip, Typography } from 'antd';
import { tk } from '@/ds';
import { riskLevel } from '@erp/shared';
import { LEVEL_COLORS } from './riskUi';

/** 5 × 5 matrix of active risks: probability up the side (5 at the top), impact along the bottom. */
export function RiskHeatMap({ heat }: { heat: number[][] }) {
  const cell = 30;
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
        Active risks by probability × impact
      </Typography.Text>
      <div style={{ display: 'flex', gap: tk.space[1], marginTop: tk.space[1] }}>
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: tk.type.caption.fontSize, color: tk.color.text.faint, textAlign: 'center' }}>Probability</div>
        <div>
          {[5, 4, 3, 2, 1].map((p) => (
            <div key={p} style={{ display: 'flex', gap: tk.space.half, marginBottom: tk.space.half }}>
              <div style={{ width: 12, fontSize: tk.type.caption.fontSize, color: tk.color.text.faint, lineHeight: `${cell}px` }}>{p}</div>
              {[1, 2, 3, 4, 5].map((i) => {
                const n = heat[p - 1]?.[i - 1] ?? 0;
                const color = LEVEL_COLORS[riskLevel(p * i)];
                return (
                  <Tooltip key={i} title={`Probability ${p} × impact ${i} = ${p * i}: ${n} risk(s)`}>
                    <div
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: tk.radius.sm,
                        background: n ? color : `color-mix(in srgb, ${color} 15%, transparent)`,
                        color: n ? tk.color.text.onAccent : 'transparent',
                        fontWeight: tk.type.title.fontWeight,
                        fontSize: tk.type.body.fontSize,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {n || ''}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          ))}
          {/* The impact axis lines up with the cells: an empty cell under the probability numbers, then one per column. */}
          <div style={{ display: 'flex', gap: tk.space.half }}>
            <div aria-hidden style={{ width: 12, flex: 'none' }} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ width: cell, textAlign: 'center', fontSize: tk.type.caption.fontSize, color: tk.color.text.faint }}>
                {i}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: tk.space.half }}>
            <div aria-hidden style={{ width: 12, flex: 'none' }} />
            <div style={{ flex: 1, textAlign: 'center', fontSize: tk.type.caption.fontSize, color: tk.color.text.faint }}>Impact</div>
          </div>
        </div>
      </div>
    </div>
  );
}
