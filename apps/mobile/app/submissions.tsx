import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DailyReportDto, MaterialRequestDto, ProgressEntryDto, SubmissionType } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { EmptyState, ErrorState, Loading, OfflineBanner, Screen, SubmissionRow } from '../src/components';
import { useOffline } from '../src/offline';
import { colors, radius, spacing } from '../src/theme';
import { fmtQty, formatDate, timeAgo } from '../src/utils/format';

const SEGMENTS: { type: SubmissionType; label: string }[] = [
  { type: 'PROGRESS', label: 'Progress' },
  { type: 'DPR', label: 'DPR' },
  { type: 'MATERIAL_REQUEST', label: 'Material' },
];

type Row = { id: string; title: string; subtitle: string; status: ProgressEntryDto['status']; createdAt: string };

export default function SubmissionsScreen() {
  const router = useRouter();
  const [type, setType] = useState<SubmissionType>('PROGRESS');
  const { syncedCount } = useOffline();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<Row[]>(
    async (api) => {
      if (type === 'PROGRESS') {
        const rows = await api.get<ProgressEntryDto[]>('/progress', { mine: true });
        return rows.map((p) => ({ id: p.id, title: `${p.activityName} · ${fmtQty(p.quantity)} ${p.unit}`, subtitle: `${p.projectName} · ${formatDate(p.date)}`, status: p.status, createdAt: p.createdAt }));
      }
      if (type === 'DPR') {
        const rows = await api.get<DailyReportDto[]>('/dpr', { mine: true });
        return rows.map((d) => ({ id: d.id, title: `DPR · ${formatDate(d.date)}`, subtitle: `${d.projectName} · ${d.totalManpower} manpower`, status: d.status, createdAt: d.createdAt }));
      }
      const rows = await api.get<MaterialRequestDto[]>('/material-requests', { mine: true });
      return rows.map((m) => ({ id: m.id, title: `${m.requestNo} · ${m.items.length} item${m.items.length === 1 ? '' : 's'}`, subtitle: `${m.projectName} · needed ${formatDate(m.requiredDate)}`, status: m.status, createdAt: m.createdAt }));
    },
    [type, syncedCount],
    { cacheKey: `submissions:${type}` },
  );

  const path = type === 'PROGRESS' ? '/progress/' : type === 'DPR' ? '/dpr/' : '/material-request/';

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.segments}>
        {SEGMENTS.map((s) => {
          const active = s.type === type;
          return (
            <Pressable key={s.type} onPress={() => setType(s.type)} style={[styles.segment, active && styles.segmentActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.banner}>
        <OfflineBanner />
      </View>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState title="Nothing here yet" subtitle="Your submissions of this type will appear here." icon="file-tray-outline" />}
          renderItem={({ item }) => <SubmissionRow type={type} title={item.title} subtitle={item.subtitle} status={item.status} meta={timeAgo(item.createdAt)} onPress={() => router.push(`${path}${item.id}`)} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', margin: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontWeight: '600', color: colors.textMuted, fontSize: 15 },
  segmentTextActive: { color: colors.primary },
  banner: { paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, flexGrow: 1 },
});
