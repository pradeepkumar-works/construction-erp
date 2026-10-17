'use client';

import React from 'react';
import { Progress, Table, Typography } from 'antd';
import type { PipelineStages, VillagePipeline } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { formatQty, toNumber } from '@/lib/format';

const STAGES: { key: keyof Omit<PipelineStages, 'plannedM'>; label: string; hint: string }[] = [
  { key: 'orderedM', label: 'Ordered', hint: 'on approved purchase orders' },
  { key: 'suppliedM', label: 'Supplied', hint: 'received at the store' },
  { key: 'laidM', label: 'Laid', hint: 'approved progress' },
  { key: 'testedM', label: 'Tested', hint: 'approved hydro tests' },
];

/** Water supply pipe from purchase to test, and village by village. */
export function PipelineCard({ stages, villages }: { stages: PipelineStages; villages: VillagePipeline[] }) {
  const planned = toNumber(stages.plannedM);
  const top = Math.max(planned, ...STAGES.map((s) => toNumber(stages[s.key])), 1);
  return (
    <div className="pipeline-card">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Pipe, in metres{planned ? ` (planned ${formatQty(planned)} m)` : ''}
      </Typography.Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
        {STAGES.map((s) => (
          <div key={s.key} className={`stage-${s.key}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{s.label}</strong>
              <span>{formatQty(stages[s.key])} m</span>
            </div>
            <Progress percent={Math.round((toNumber(stages[s.key]) / top) * 100)} showInfo={false} strokeColor={s.key === 'testedM' ? BRAND.colors.success : BRAND.colors.primary} aria-label={`${s.label}: ${Math.round((toNumber(stages[s.key]) / top) * 100)}%`} />
            <div className="text-muted" style={{ fontSize: 12 }}>
              {s.hint}
            </div>
          </div>
        ))}
      </div>
      <Table<VillagePipeline>
        className="village-pipeline"
        size="small"
        rowKey="village"
        pagination={false}
        dataSource={villages}
        locale={{ emptyText: 'Add the villages in Sector settings, then tag progress with them' }}
        columns={[
          { title: 'Village', dataIndex: 'village' },
          { title: 'Laid (m)', dataIndex: 'laidM', align: 'right', render: (v: string) => formatQty(v) },
          { title: 'Tested (m)', dataIndex: 'testedM', align: 'right', render: (v: string) => formatQty(v) },
          {
            title: 'Tested of laid',
            key: 'pct',
            width: 200,
            render: (_, r) => {
              const laid = toNumber(r.laidM);
              return laid ? <Progress size="small" percent={Math.min(100, Math.round((toNumber(r.testedM) / laid) * 100))} aria-label={`${Math.min(100, Math.round((toNumber(r.testedM) / laid) * 100))}% of laid tested`} /> : <span className="text-muted">nothing laid</span>;
            },
          },
        ]}
      />
    </div>
  );
}
