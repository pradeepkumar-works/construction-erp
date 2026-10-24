'use client';

import React from 'react';
import { Tooltip } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { WarningOutlined } from '@/components/common/icons';
import type { UnpricedDto } from '@erp/shared';

export const unpricedText = (u: UnpricedDto) =>
  [
    u.materialItems ? `${u.materialItems} item(s) issued without a rate` : null,
    u.machineryLogs ? `${u.machineryLogs} machinery log(s) of machines without a rate` : null,
    u.labourManDays ? `${u.labourManDays} man-day(s) of trades without a daily rate` : null,
  ].filter(Boolean) as string[];

/** Warns that part of the cost is missing because a rate is not set. */
export function UnpricedNote({ unpriced }: { unpriced: UnpricedDto }) {
  const lines = unpricedText(unpriced);
  if (!lines.length) return null;
  return (
    <Tooltip title={lines.join('; ')}>
      <AppTag tone="pending" icon={<WarningOutlined />} style={{ margin: 0 }}>
        Rates missing
      </AppTag>
    </Tooltip>
  );
}
