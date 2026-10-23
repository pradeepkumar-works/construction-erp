'use client';

import React, { useState } from 'react';
import { Alert, Button, Empty } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ProjectDetail } from '@erp/shared';
import { formatChainage } from '@erp/shared';
import { useSectorProgress } from '@/lib/queries';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ChainageStrip } from './ChainageStrip';
import { SectorMatrixTable } from './SectorMatrixTable';
import { PipelineCard } from './PipelineCard';
import { SectorSettingsModal } from './SectorSettingsModal';
import { Section } from '@/components/common/Section';

/** Tab label for a project's sector view. */
export const sectorTabLabel = (type: ProjectDetail['type']) => (type === 'ROAD' || type === 'SEWERAGE' ? 'Chainage' : type === 'BUILDING' ? 'Floors' : 'Villages and pipeline');

/** Progress where it happened: along the road, floor by floor, or village by village with the pipe stages. */
export function SectorPanel({ project, editable }: { project: ProjectDetail; editable: boolean }) {
  const { data, isLoading, error, refetch } = useSectorProgress(project.id);
  const [settings, setSettings] = useState(false);
  const missing =
    project.type === 'ROAD' && project.chainageStart === null
      ? "Set the road's chainage from and to so the strip covers the whole contract stretch."
      : project.type === 'BUILDING' && !project.floors.length
        ? "Set the building's floors so site entries can pick one."
        : project.type === 'WATER_SUPPLY' && !project.villages.length
          ? 'Add the villages the scheme serves so site entries can pick one.'
          : null;

  return (
    <div className="sector-panel" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      {editable || missing ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {missing ? <Alert style={{ flex: 1 }} type="info" showIcon title={missing} /> : <div style={{ flex: 1 }} />}
          {editable ? (
            <Button icon={<SettingOutlined />} onClick={() => setSettings(true)}>
              Sector settings
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      {isLoading || !data ? (
        isLoading ? <Loading /> : null
      ) : (
        <>
          {data.pipeline ? (
            <Section>
              <PipelineCard stages={data.pipeline.stages} villages={data.pipeline.villages} />
            </Section>
          ) : null}
          {data.strip ? (
            <Section title={`Along the ${project.type === 'ROAD' ? 'road' : 'main'}${data.chainageStart !== null && data.chainageEnd !== null ? `: Ch ${formatChainage(data.chainageStart)} to ${formatChainage(data.chainageEnd)}` : ''}`}>
              {data.strip.length ? <ChainageStrip layers={data.strip} start={data.chainageStart} end={data.chainageEnd} /> : <Empty description="No progress placed along the chainage yet" />}
            </Section>
          ) : null}
          {data.matrix ? (
            <Section title={data.matrix.rowLabel === 'Floor' ? 'Floor by activity (approved quantity)' : 'Village by activity (approved quantity)'}>
              {data.matrix.rows.length || data.matrix.unassigned.length ? <SectorMatrixTable matrix={data.matrix} /> : <Empty description={`No ${data.matrix.rowLabel === 'Floor' ? 'floors' : 'villages'} yet`} />}
            </Section>
          ) : null}
        </>
      )}
      <SectorSettingsModal open={settings} onClose={() => setSettings(false)} project={project} />
    </div>
  );
}
