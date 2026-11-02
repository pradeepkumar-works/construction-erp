'use client';

import React from 'react';
import { Tooltip } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import type { EquipmentOwnership, MachineryLogDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS } from '@erp/shared';
import { formatQty, toNumber } from '@/lib/format';

export const OwnershipTag = ({ ownership }: { ownership: EquipmentOwnership }) => (
  <AppTag variant="kind" style={{ margin: 0 }}>
    {EQUIPMENT_OWNERSHIP_LABELS[ownership]}
  </AppTag>
);

/** "7.5 h" plus idle / breakdown when there are any. */
export function HoursCell({ log }: { log: Pick<MachineryLogDto, 'hoursWorked' | 'idleHours' | 'breakdownHours' | 'breakdownNote'> }) {
  const idle = toNumber(log.idleHours);
  const down = toNumber(log.breakdownHours);
  return (
    <div>
      <span className="mono" translate="no">{formatQty(log.hoursWorked)} h</span>
      {idle > 0 || down > 0 ? (
        <div style={{ fontSize: tk.type.caption.fontSize }}>
          {idle > 0 ? <span className="text-muted">{formatQty(idle)} idle</span> : null}
          {idle > 0 && down > 0 ? <span className="text-muted"> · </span> : null}
          {down > 0 ? (
            <Tooltip title={log.breakdownNote}>
              <span style={{ color: tk.color.tone.danger.fg }}>{formatQty(down)} breakdown</span>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
