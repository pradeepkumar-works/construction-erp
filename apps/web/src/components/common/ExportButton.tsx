'use client';

import React, { useState } from 'react';
import { App, Button } from 'antd';
import { FileExcelOutlined } from '@/components/common/icons';
import { errorMessage } from '@/lib/api';

/** "Export to Excel" button; `onExport` fetches every matching row (not just the page on screen) and downloads it. */
export function ExportButton({ onExport, label = 'Export' }: { onExport: () => Promise<number | void>; label?: string }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon={<FileExcelOutlined />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const n = await onExport();
          if (typeof n === 'number') message.success(`Exported ${n} row${n === 1 ? '' : 's'}`);
        } catch (e) {
          message.error(errorMessage(e, 'Export failed'));
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
