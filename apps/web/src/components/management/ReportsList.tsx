'use client';

import React from 'react';
import Link from 'next/link';
import { tk } from '@/ds';
import { MANAGEMENT_REPORT_KEYS, MANAGEMENT_REPORTS, canReadReport } from '@erp/shared';
import { useAuth } from '@/lib/auth';

/** The management reports the reader may open, each a link by its name. */
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
        <li key={k} style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
          <Link href={`/management/reports/${k}`} style={{ fontWeight: tk.type.title.fontWeight }}>
            {MANAGEMENT_REPORTS[k].title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
