'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import { EMI_STAGE_LABELS, type EmiStage } from '@erp/shared';


/** Where an EMI stands: paid, overdue, due within a week, or later. The word says it, the colour only marks it. */
export function EmiStageTag({ stage }: { stage: EmiStage }) {
  return <AppTag kind="emi" status={stage}>{EMI_STAGE_LABELS[stage]}</AppTag>;
}
