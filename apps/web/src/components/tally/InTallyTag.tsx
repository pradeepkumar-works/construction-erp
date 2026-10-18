'use client';

import React from 'react';
import { Tag, Tooltip } from 'antd';

/** Marks a record that is in a Tally export: it cannot be changed until that export is undone. */
export function InTallyTag() {
  return (
    <Tooltip title="Exported to Tally. Undo that export under Billing → Tally export to change it.">
      <Tag color="geekblue" style={{ margin: 0 }}>
        In Tally
      </Tag>
    </Tooltip>
  );
}
