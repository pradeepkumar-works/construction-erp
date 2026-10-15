'use client';

import React from 'react';
import { Tooltip, Typography } from 'antd';
import { riskLevel } from '@erp/shared';
import { LEVEL_COLORS } from './riskUi';
import { themeColor } from '@/lib/theme';

/** 5 × 5 matrix of active risks: probability up the side (5 at the top), impact along the bottom. */
export function RiskHeatMap({ heat }: { heat: number[][] }) {
  const cell = 30;
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Active risks by probability × impact
      </Typography.Text>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, color: themeColor('colorTextDescription'), textAlign: 'center' }}>Probability</div>
        <div>
          {[5, 4, 3, 2, 1].map((p) => (
            <div key={p} style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
              <div style={{ width: 12, fontSize: 11, color: themeColor('colorTextDescription'), lineHeight: `${cell}px` }}>{p}</div>
              {[1, 2, 3, 4, 5].map((i) => {
                const n = heat[p - 1]?.[i - 1] ?? 0;
                const color = LEVEL_COLORS[riskLevel(p * i)];
                return (
                  <Tooltip key={i} title={`Probability ${p} × impact ${i} = ${p * i}: ${n} risk(s)`}>
                    <div
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: 4,
                        background: n ? color : `${color}26`,
                        color: n ? themeColor('colorTextLightSolid') : 'transparent',
                        fontWeight: 600,
                        fontSize: 13,
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
          <div style={{ display: 'flex', gap: 2, marginLeft: 14 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ width: cell, textAlign: 'center', fontSize: 11, color: themeColor('colorTextDescription') }}>
                {i}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: themeColor('colorTextDescription'), marginLeft: 14 }}>Impact</div>
        </div>
      </div>
    </div>
  );
}
