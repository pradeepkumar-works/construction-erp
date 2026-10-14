'use client';

import React from 'react';
import { Tag } from 'antd';
import type { BillStage } from '@erp/shared';
import { BILL_STAGE_LABELS } from '@erp/shared';

export const BILL_STAGE_COLORS: Record<BillStage, string> = { NOT_SENT: 'default', SENT: 'blue', CERTIFIED: 'purple', PAID: 'green' };

/** Where an approved bill is with the client. */
export function BillStageTag({ stage }: { stage: BillStage }) {
  return (
    <Tag color={BILL_STAGE_COLORS[stage]} style={{ margin: 0 }}>
      {BILL_STAGE_LABELS[stage]}
    </Tag>
  );
}
