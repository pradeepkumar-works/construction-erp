'use client';

import React from 'react';
import Link from 'next/link';
import { tk } from '@/ds';
import { MANAGEMENT_REPORT_KEYS, MANAGEMENT_REPORTS, canReadReport } from '@erp/shared';
import { useAuth } from '@/lib/auth';

/** The management reports the reader may open, each a link with what it shows. */
export function ReportsList() {
  const { user } = useAuth();
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        columnGap: tk.space[6],
      }}
    >
      {MANAGEMENT_REPORT_KEYS.filter((k) => !user || canReadReport(user.roleKey, k)).map((k) => (
        <li key={k} style={{ padding: `${tk.space[2]} 0`, minHeight: 44 }}>
          <Link href={`/management/reports/${k}`} style={{ fontWeight: tk.type.title.fontWeight }}>
            {MANAGEMENT_REPORTS[k].title}
          </Link>
          <div
            style={{
              color: tk.color.text.muted,
              fontSize: tk.type.caption.fontSize,
            }}
          >
            {MANAGEMENT_REPORTS[k].description}
          </div>
        </li>
      ))}
    </ul>
  );
}
