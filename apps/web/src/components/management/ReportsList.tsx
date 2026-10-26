'use client';

import React from 'react';
import Link from 'next/link';
import { theme } from 'antd';
import { MANAGEMENT_REPORT_KEYS, MANAGEMENT_REPORTS } from '@erp/shared';

/** The management reports, each a link with what it shows. */
export function ReportsList() {
  const { token } = theme.useToken();
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        columnGap: token.marginLG,
      }}
    >
      {MANAGEMENT_REPORT_KEYS.map((k) => (
        <li key={k} style={{ padding: `${token.paddingXS}px 0`, minHeight: 44 }}>
          <Link href={`/management/reports/${k}`} style={{ fontWeight: token.fontWeightStrong }}>
            {MANAGEMENT_REPORTS[k].title}
          </Link>
          <div
            style={{
              color: token.colorTextSecondary,
              fontSize: token.fontSizeSM,
            }}
          >
            {MANAGEMENT_REPORTS[k].description}
          </div>
        </li>
      ))}
    </ul>
  );
}
