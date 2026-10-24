'use client';

import React from 'react';
import { Statistic, Tag, Tooltip } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { SAFETY_INCIDENT_TYPE_LABELS } from '@erp/shared';
import { useSafetySummary } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { IncidentList } from './IncidentList';
import { TalkList } from './TalkList';
import { PermitList } from './PermitList';
import { PpePanel } from './PpePanel';
import { INCIDENT_TYPE_COLORS } from './safetyUi';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor, themeFontSize } from '@/lib/theme';
import { useUrlTab } from '@/lib/url-state';

export const SAFETY_TABS = ['incidents', 'talks', 'permits', 'ppe'] as const;
export type SafetyTab = (typeof SAFETY_TABS)[number];
const big = { content: { fontSize: themeFontSize('fontSizeXL') } };

/** Safety at a glance and its three registers; the Safety page and a project tab. The open register is `?sub=` in the URL (UX item 84). */
export function SafetyPanel({ projectId, initialTab, initialId }: { projectId?: string; initialTab?: SafetyTab; initialId?: string }) {
  const { data: s } = useSafetySummary(projectId);
  const [tab, setTab] = useUrlTab<SafetyTab>(SAFETY_TABS, 'incidents', { initial: initialTab });
  return (
    <div className="safety-panel">
      {s ? (
        <CardToolbar className="safety-summary" variant="summary" wrap gap={28} align="flex-start">
          <Statistic
            title={<Tooltip title="Since the last lost-time injury or fatality">Days without a lost-time injury</Tooltip>}
            value={s.daysSinceLostTime ?? 'None recorded'}
            styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: s.daysSinceLostTime !== null && s.daysSinceLostTime < 30 ? themeColor('colorErrorText') : undefined } }}
            suffix={s.lastLostTimeDate ? <span style={{ fontSize: themeFontSize('fontSizeSM') }}>since {formatDate(s.lastLostTimeDate)}</span> : undefined}
          />
          <Statistic title="Incidents this month" value={s.incidentsThisMonth} styles={big} />
          <Statistic title="Near misses this month" value={s.nearMissesThisMonth} styles={big} />
          <Statistic title="Open incidents" value={s.openIncidents} styles={big} />
          <Statistic title="Toolbox talks this month" value={s.toolboxTalksThisMonth} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>{s.attendeesThisMonth} attended</span>} styles={big} />
          <Statistic title="Permits waiting / live" value={`${s.permitsRequested} / ${s.permitsActive}`} styles={big} />
          {s.permitsExpired ? <Statistic title="Permits run out, not closed" value={s.permitsExpired} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: themeColor('colorWarningText') } }} /> : null}
          {s.byType.length ? (
            <div style={{ flexBasis: '100%', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), marginRight: 4 }}>
                This year:
              </span>
              {s.byType.map((t) => (
                <Tag key={t.type} color={INCIDENT_TYPE_COLORS[t.type]}>
                  {SAFETY_INCIDENT_TYPE_LABELS[t.type]}: {t.count}
                </Tag>
              ))}
              <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {s.injuredThisYear} {s.injuredThisYear === 1 ? 'person' : 'people'} hurt, {s.lostTimeThisYear} lost-time
              </span>
            </div>
          ) : null}
        </CardToolbar>
      ) : null}
      <AppTabs
        activeKey={tab}
        onChange={(k) => setTab(k as SafetyTab)}
        variant="page"
        items={[
          { key: 'incidents', label: 'Incidents and near misses', children: <IncidentList projectId={projectId} initialOpenId={initialTab === 'incidents' || !initialTab ? initialId : undefined} /> },
          { key: 'talks', label: 'Toolbox talks', children: <TalkList projectId={projectId} /> },
          { key: 'permits', label: 'Permits to work', count: s?.permitsRequested, countLabel: 'waiting', attention: true, children: <PermitList projectId={projectId} initialOpenId={initialTab === 'permits' ? initialId : undefined} /> },
          { key: 'ppe', label: 'PPE', children: <PpePanel projectId={projectId} /> },
        ]}
      />
    </div>
  );
}
