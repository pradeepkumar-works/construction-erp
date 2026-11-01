'use client';

import React from 'react';
import { Tooltip } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { RiskDto, RiskLevel, RiskStatus } from '@erp/shared';
import { RISK_KIND_LABELS, RISK_LEVEL_LABELS, RISK_RATING_LABELS, RISK_STATUS_LABELS, riskLevel } from '@erp/shared';
import { themeColor } from '@/lib/theme';

export const LEVEL_COLORS: Record<RiskLevel, string> = { LOW: themeColor('colorSuccess'), MEDIUM: themeColor('colorWarning'), HIGH: themeColor('red6') };

export const RATING_OPTIONS = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} · ${RISK_RATING_LABELS[v]}` }));

/** A risk's score as a figure (a score is not a state), with how it was reached on hover. */
export function RiskScore({ r }: { r: Pick<RiskDto, 'score' | 'probability' | 'impact'> }) {
  return (
    <Tooltip title={`Probability ${r.probability} × impact ${r.impact} · ${RISK_LEVEL_LABELS[riskLevel(r.score)]}`}>
      <span translate="no" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {r.score}
      </span>
    </Tooltip>
  );
}

export const RiskStatusTag = ({ status }: { status: RiskStatus }) => (
  <AppTag kind="risk" status={status} style={{ margin: 0 }}>
    {RISK_STATUS_LABELS[status]}
  </AppTag>
);

export const KindTag = ({ kind }: { kind: RiskDto['kind'] }) => (
  <AppTag variant="kind" style={{ margin: 0 }}>
    {RISK_KIND_LABELS[kind]}
  </AppTag>
);
