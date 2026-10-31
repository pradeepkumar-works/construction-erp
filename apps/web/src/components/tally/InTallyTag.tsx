'use client';

import React from 'react';
import { Tooltip } from 'antd';
import { AppTag } from '@/components/common/AppTag';

/** Marks a record that is in a Tally export: it cannot be changed until that export is undone. */
export function InTallyTag() {
  return (
    <Tooltip title="Exported to Tally. To change it, undo that export in Accounts › Tally export.">
      <AppTag tone="info" style={{ margin: 0 }}>
        In Tally
      </AppTag>
    </Tooltip>
  );
}
