'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { BillStage } from '@erp/shared';
import { BILL_STAGE_LABELS } from '@erp/shared';

/** Where an approved bill is with the client. */
export function BillStageTag({ stage }: { stage: BillStage }) {
  return (
    <AppTag kind="billStage" status={stage} style={{ margin: 0 }}>
      {BILL_STAGE_LABELS[stage]}
    </AppTag>
  );
}
