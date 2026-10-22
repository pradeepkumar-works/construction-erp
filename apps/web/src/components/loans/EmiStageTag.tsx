'use client';

import React from 'react';
import { Tag } from 'antd';
import { EMI_STAGE_LABELS, type EmiStage } from '@erp/shared';

const COLOR: Record<EmiStage, string | undefined> = { PAID: 'success', OVERDUE: 'error', DUE: 'warning', LATER: undefined };

/** Where an EMI stands (v6 item 108): paid, overdue, due within a week, or later. The word says it, the colour only marks it. */
export function EmiStageTag({ stage }: { stage: EmiStage }) {
  return <Tag color={COLOR[stage]}>{EMI_STAGE_LABELS[stage]}</Tag>;
}
