'use client';

import React from 'react';
import { Statistic, Typography, theme } from 'antd';
import type { ModuleFigureDto } from '@erp/shared';
import { formatINR, formatINRCompact, formatPct } from '@/lib/format';
import { KpiTile } from '@/components/home/KpiTile';

/** One figure: a count, rupees, "4 of 6" or a percentage, with the line that says what it stands against. */
export function ModuleFigure({ f }: { f: ModuleFigureDto }) {
  const { token } = theme.useToken();
  const value = f.format === 'money' ? formatINRCompact(f.value) : f.format === 'ratio' ? `${f.value} of ${f.of ?? 0}` : f.format === 'percent' ? formatPct(f.value) : f.value;
  const note = f.note ? (f.noteMoney != null ? f.note.replace('{money}', formatINR(f.noteMoney)) : f.note) : null;
  return (
    <KpiTile href={f.href}>
      <Statistic title={f.label} value={value} valueRender={() => <span translate="no">{value}</span>} />
      {note && (
        <Typography.Text type={f.tone === 'danger' ? 'danger' : f.tone === 'warning' ? 'warning' : 'secondary'} style={{ display: 'block', fontSize: token.fontSizeSM, marginTop: token.marginXXS }}>
          {note}
        </Typography.Text>
      )}
    </KpiTile>
  );
}
