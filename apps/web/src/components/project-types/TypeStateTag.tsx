'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';

/** Standard, the company's copy of a standard one, its own, or archived. */
export function TypeStateTag({ standard, edited, active }: { standard: boolean; edited: boolean; active: boolean }) {
  if (!active) return <AppTag tone="neutral" style={{ margin: 0 }}>Archived</AppTag>;
  if (!standard) return <AppTag tone="violet" style={{ margin: 0 }}>Your own</AppTag>;
  return edited ? <AppTag tone="success" style={{ margin: 0 }}>Changed</AppTag> : <AppTag tone="info" style={{ margin: 0 }}>Standard</AppTag>;
}
