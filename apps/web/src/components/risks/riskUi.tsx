'use client';

import React from 'react';
import { Tag, Tooltip } from 'antd';
import type { RiskDto, RiskLevel, RiskStatus } from '@erp/shared';
import { RISK_KIND_LABELS, RISK_LEVEL_LABELS, RISK_RATING_LABELS, RISK_STATUS_LABELS, riskLevel } from '@erp/shared';

export const LEVEL_COLORS: Record<RiskLevel, string> = { LOW: '#52c41a', MEDIUM: '#faad14', HIGH: '#f5222d' };
export const LEVEL_TAG: Record<RiskLevel, string> = { LOW: 'green', MEDIUM: 'gold', HIGH: 'red' };
export const STATUS_TAG: Record<RiskStatus, string> = { OPEN: 'red', MONITORING: 'blue', CLOSED: 'default' };

export const RATING_OPTIONS = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} · ${RISK_RATING_LABELS[v]}` }));

export function ScoreTag({ r }: { r: Pick<RiskDto, 'score' | 'probability' | 'impact'> }) {
  const level = riskLevel(r.score);
  return (
    <Tooltip title={`Probability ${r.probability} × impact ${r.impact} · ${RISK_LEVEL_LABELS[level]}`}>
      <Tag color={LEVEL_TAG[level]} style={{ margin: 0, minWidth: 34, textAlign: 'center' }}>
        {r.score}
      </Tag>
    </Tooltip>
  );
}

export const RiskStatusTag = ({ status }: { status: RiskStatus }) => (
  <Tag color={STATUS_TAG[status]} style={{ margin: 0 }}>
    {RISK_STATUS_LABELS[status]}
  </Tag>
);

export const KindTag = ({ kind }: { kind: RiskDto['kind'] }) => (
  <Tag color={kind === 'DELAY' ? 'volcano' : 'geekblue'} style={{ margin: 0 }}>
    {RISK_KIND_LABELS[kind]}
  </Tag>
);
