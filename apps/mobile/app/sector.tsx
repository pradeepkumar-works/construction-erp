import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ChainageLayer, PipelineStages, SectorMatrix, SectorProgressDto } from '@erp/shared';
import { formatChainage } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { useT } from '../src/i18n/LanguageContext';
import { Card, EmptyState, ErrorState, Loading, ProgressBar, Screen } from '../src/components';
import { colors, radius, spacing, statusTone, typography } from '../src/theme';
import { fmtQty } from '../src/utils/format';

/** Progress where it happened: along the road, floor by floor, or village by village with the pipe stages. */
export default function SectorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<SectorProgressDto>((a) => a.get(`/projects/${projectId}/sector-progress`), [projectId], { enabled: !!projectId, cacheKey: `sector:${projectId}` });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const title = t(data.type === 'ROAD' ? 'Progress by Chainage' : data.type === 'BUILDING' ? 'Progress by Floor' : 'Villages & Pipeline');
  const empty = !data.pipeline && !data.strip?.length && !data.matrix?.rows.length;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title }} />
      {empty ? <EmptyState title={t('Nothing placed yet')} subtitle={t('Give the chainage, floor or village on progress entries and it shows here.')} icon="map-outline" /> : null}
      {data.pipeline ? <Pipeline stages={data.pipeline.stages} villages={data.pipeline.villages} /> : null}
      {data.strip?.length ? <Strip layers={data.strip} start={data.chainageStart} end={data.chainageEnd} main={data.type !== 'ROAD'} /> : null}
      {data.matrix && data.matrix.rows.length ? <Matrix matrix={data.matrix} /> : null}
    </Screen>
  );
}

function Strip({ layers, start, end, main }: { layers: ChainageLayer[]; start: number | null; end: number | null; main: boolean }) {
  const all = layers.flatMap((l) => l.segments);
  const lo = start ?? (all.length ? Math.min(...all.map((s) => s.from)) : 0);
  const hi = end ?? (all.length ? Math.max(...all.map((s) => s.to)) : 1000);
  const length = Math.max(hi - lo, 1);
  const pos = (m: number) => Math.min(100, Math.max(0, ((m - lo) / length) * 100));
  const t = useT();
  return (
    <Card title={t(main ? 'Along the main: {from} to {to}' : 'Along the road: {from} to {to}', { from: formatChainage(lo), to: formatChainage(hi) })}>
      {layers.map((l) => (
        <View key={l.activityId} style={styles.layer}>
          <View style={styles.layerHead}>
            <Text style={[typography.bodyStrong, styles.flex]} numberOfLines={1}>
              {l.name}
            </Text>
            <Text style={typography.bodyStrong}>{!l.coveredM && !l.pendingM && l.segments.length ? t(l.segments.length === 1 ? '{n} place' : '{n} places', { n: l.segments.length }) : `${Math.round((l.coveredM / length) * 100)}%`}</Text>
          </View>
          <View style={styles.track}>
            {l.segments.map((s) => {
              const point = s.to - s.from < length / 200;
              return (
                <View
                  key={s.entryId}
                  style={[
                    styles.seg,
                    { left: `${pos(s.from)}%`, width: point ? 3 : `${Math.max(pos(s.to) - pos(s.from), 0.5)}%`, backgroundColor: statusTone[s.status as keyof typeof statusTone]?.fg ?? colors.warning, opacity: s.status === 'APPROVED' ? 0.9 : 0.5 },
                  ]}
                />
              );
            })}
          </View>
          <Text style={typography.caption}>
            {t('{km} km done', { km: (l.coveredM / 1000).toFixed(2) })}
            {l.pendingM ? `, ${t('{km} km waiting', { km: (l.pendingM / 1000).toFixed(2) })}` : ''} · {t('{done} of {planned} {unit}', { done: fmtQty(l.executedQty), planned: fmtQty(l.plannedQty), unit: l.unit })}
          </Text>
        </View>
      ))}
      <Text style={typography.caption}>{t('Green approved, orange waiting for approval.')}</Text>
    </Card>
  );
}

function Matrix({ matrix }: { matrix: SectorMatrix }) {
  const names = new Map(matrix.activities.map((a) => [a.id, a]));
  const t = useT();
  const rows = matrix.rowLabel === 'Floor' ? [...matrix.rows].reverse() : matrix.rows;
  return (
    <>
      {rows.map((r) => {
        const cells = matrix.cells.filter((c) => c.row === r);
        return (
          <Card key={r} title={r}>
            {cells.length ? (
              cells.map((c) => {
                const a = names.get(c.activityId);
                return (
                  <View key={c.activityId} style={styles.cell}>
                    <Text style={[typography.body, styles.flex]} numberOfLines={1}>
                      {a?.name}
                    </Text>
                    <Text style={[typography.bodyStrong, { color: colors.success }]}>
                      {fmtQty(c.approvedQty)} {a?.unit}
                    </Text>
                    {Number(c.pendingQty) ? <Text style={[typography.caption, { color: colors.warning }]}> +{fmtQty(c.pendingQty)}</Text> : null}
                  </View>
                );
              })
            ) : (
              <Text style={typography.caption}>{t('Nothing yet')}</Text>
            )}
          </Card>
        );
      })}
    </>
  );
}

const STAGES: { key: keyof Omit<PipelineStages, 'plannedM'>; label: string }[] = [
  { key: 'orderedM', label: 'Ordered' },
  { key: 'suppliedM', label: 'Supplied' },
  { key: 'laidM', label: 'Laid' },
  { key: 'testedM', label: 'Tested' },
];

function Pipeline({ stages, villages }: { stages: PipelineStages; villages: { village: string; laidM: string; testedM: string }[] }) {
  const top = Math.max(Number(stages.plannedM), ...STAGES.map((s) => Number(stages[s.key])), 1);
  const t = useT();
  return (
    <>
      <Card title={Number(stages.plannedM) ? t('Pipe (m), planned {n}', { n: fmtQty(stages.plannedM) }) : t('Pipe (m)')}>
        {STAGES.map((s) => (
          <View key={s.key} style={styles.stage}>
            <View style={styles.layerHead}>
              <Text style={[typography.body, styles.flex]}>{t(s.label)}</Text>
              <Text style={typography.bodyStrong}>{fmtQty(stages[s.key])}</Text>
            </View>
            <ProgressBar value={(Number(stages[s.key]) / top) * 100} showLabel={false} color={s.key === 'testedM' ? colors.success : colors.primary} />
          </View>
        ))}
      </Card>
      {villages.length ? (
        <Card title={t('Villages')}>
          {villages.map((v) => (
            <View key={v.village} style={styles.cell}>
              <Text style={[typography.body, styles.flex]}>{v.village}</Text>
              <Text style={typography.caption}>
                {t('laid {laid} · tested {tested}', { laid: fmtQty(v.laidM), tested: fmtQty(v.testedM) })}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  layer: { marginBottom: spacing.md },
  layerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  track: { height: 14, backgroundColor: colors.bg, borderRadius: radius.sm, overflow: 'hidden', marginBottom: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  seg: { position: 'absolute', top: 0, bottom: 0 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  stage: { marginBottom: spacing.md },
});
