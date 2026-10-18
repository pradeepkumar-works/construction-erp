'use client';

import React from 'react';
import { Tag, Tooltip } from 'antd';
import type { EquipmentOwnership, MachineryLogDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS } from '@erp/shared';
import { formatQty, toNumber } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';

export const OwnershipTag = ({ ownership }: { ownership: EquipmentOwnership }) => (
  <Tag color={ownership === 'HIRED' ? 'orange' : 'geekblue'} style={{ margin: 0 }}>
    {EQUIPMENT_OWNERSHIP_LABELS[ownership]}
  </Tag>
);

/** "7.5 h" plus idle / breakdown when there are any. */
export function HoursCell({ log }: { log: Pick<MachineryLogDto, 'hoursWorked' | 'idleHours' | 'breakdownHours' | 'breakdownNote'> }) {
  const idle = toNumber(log.idleHours);
  const down = toNumber(log.breakdownHours);
  return (
    <div>
      <span className="mono" translate="no">{formatQty(log.hoursWorked)} h</span>
      {idle > 0 || down > 0 ? (
        <div style={{ fontSize: themeFontSize('fontSizeSM') }}>
          {idle > 0 ? <span className="text-muted">{formatQty(idle)} idle</span> : null}
          {idle > 0 && down > 0 ? <span className="text-muted"> · </span> : null}
          {down > 0 ? (
            <Tooltip title={log.breakdownNote}>
              <span style={{ color: themeColor('colorErrorText') }}>{formatQty(down)} breakdown</span>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
