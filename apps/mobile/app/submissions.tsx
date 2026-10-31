import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DailyReportDto, ExpenseDto, InspectionDto, MeasurementSheetDto, MachineryLogDto, MaterialRequestDto, Paginated, ProgressEntryDto, SubmissionType, WaitingEntryDto } from '@erp/shared';
import { useApi, useFetch, type Api } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, EmptyState, ErrorState, Input, Loading, OfflineBanner, Screen, SubmissionRow, Touchable } from '../src/components';
import { OUTBOX_DETAIL, useOffline } from '../src/offline';
import { colors, fontSize, maxFontScale, radius, spacing, touch } from '../src/theme';
import { fmtQty, formatDate, formatMoney, timeAgo } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';
import type { TranslateVars } from '../src/i18n/translate';

type T = (en: string, vars?: TranslateVars) => string;

const SEGMENTS: { type: SubmissionType; label: string }[] = [
  { type: 'PROGRESS', label: 'Progress' },
  { type: 'DPR', label: 'DPR' },
  { type: 'MATERIAL_REQUEST', label: 'Indents' },
  { type: 'MACHINERY', label: 'Machinery logs' },
  { type: 'EXPENSE', label: 'Expenses' },
  { type: 'MEASUREMENT', label: 'Measurements' },
  { type: 'INSPECTION', label: 'Inspections' },
];

type Row = { id: string; title: string; subtitle: string; status: ProgressEntryDto['status']; createdAt: string };
type Page = { rows: Row[]; total: number };

const PAGE_SIZE = 30;

/** One page of the user's own submissions of a type, mapped to list rows. Server-side search with `q`. */
async function loadPage(api: Api, type: SubmissionType, page: number, q: string, t: T): Promise<Page> {
  const params = { mine: true, page, pageSize: PAGE_SIZE, q: q || undefined };
  if (type === 'PROGRESS') {
    const res = await api.get<Paginated<ProgressEntryDto>>('/progress', params);
    return { total: res.total, rows: res.items.map((p) => ({ id: p.id, title: `${p.activityName} · ${fmtQty(p.quantity)} ${p.unit}`, subtitle: `${p.projectName} · ${formatDate(p.date)}`, status: p.status, createdAt: p.createdAt })) };
  }
  if (type === 'DPR') {
    const res = await api.get<Paginated<DailyReportDto>>('/dpr', params);
    return { total: res.total, rows: res.items.map((d) => ({ id: d.id, title: `DPR · ${formatDate(d.date)}`, subtitle: `${d.projectName} · ${t('{n} on site', { n: d.totalManpower })}`, status: d.status, createdAt: d.createdAt })) };
  }
  if (type === 'MACHINERY') {
    const res = await api.get<Paginated<MachineryLogDto>>('/machinery-logs', params);
    return { total: res.total, rows: res.items.map((l) => ({ id: l.id, title: `${l.equipmentCode} · ${fmtQty(l.hoursWorked)} h`, subtitle: `${l.projectName} · ${formatDate(l.date)}`, status: l.status, createdAt: l.createdAt })) };
  }
  if (type === 'MEASUREMENT') {
    const res = await api.get<Paginated<MeasurementSheetDto>>('/measurements', params);
    return { total: res.total, rows: res.items.map((m) => ({ id: m.id, title: `${m.mbNo} · ${fmtQty(m.totalQty)} ${m.unit}`, subtitle: `${m.projectName} · ${m.boqItemNo} · ${m.location}`, status: m.status, createdAt: m.createdAt })) };
  }
  if (type === 'INSPECTION') {
    const res = await api.get<Paginated<InspectionDto>>('/inspections', params);
    return { total: res.total, rows: res.items.map((i) => ({ id: i.id, title: `${i.inspectionNo} · ${i.activityName}`, subtitle: `${i.projectName} · ${i.location}`, status: i.status, createdAt: i.createdAt })) };
  }
  if (type === 'EXPENSE') {
    const res = await api.get<Paginated<ExpenseDto>>('/expenses', params);
    return { total: res.total, rows: res.items.map((x) => ({ id: x.id, title: `${x.expenseNo} · ${formatMoney(x.totalAmount, { paise: false })}`, subtitle: `${x.projectName} · ${x.description}`, status: x.status, createdAt: x.createdAt })) };
  }
  const res = await api.get<Paginated<MaterialRequestDto>>('/material-requests', params);
  return { total: res.total, rows: res.items.map((m) => ({ id: m.id, title: `${m.requestNo} · ${m.items.length === 1 ? t('1 item') : t('{n} items', { n: m.items.length })}`, subtitle: `${m.projectName} · ${t('needed {date}', { date: formatDate(m.requiredDate) })}`, status: m.status, createdAt: m.createdAt })) };
}

export default function SubmissionsScreen() {
  const router = useRouter();
  const t = useT();
  const api = useApi();
  // Home's tiles open a type (?type=DPR, launcher phase 4).
  const params = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<SubmissionType>(SEGMENTS.find((s) => s.type === params.type)?.type ?? 'PROGRESS');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const { syncedCount } = useOffline();
  // Debounce the search box.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);
  // First page via useFetch (cached for offline when not searching); "Load more" appends further pages.
  const first = useFetch<Page>((a) => loadPage(a, type, 1, q, t), [type, q, syncedCount, t], { cacheKey: q ? undefined : `submissions:${type}:v2` });
  const [more, setMore] = useState<{ rows: Row[]; page: number }>({ rows: [], page: 1 });
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  useEffect(() => {
    setMore({ rows: [], page: 1 });
    setMoreError(null);
  }, [first.data]);

  // Waiting with others (v5 item 94): for an entry waiting for approval, whose queue it is in and since when.
  const waiting = useFetch<WaitingEntryDto[]>((a) => a.get('/approvals/waiting'), [syncedCount], { cacheKey: 'approvals:waiting:v1' });
  const waitingOf = useMemo(() => new Map((waiting.data ?? []).map((w) => [`${w.type}:${w.id}`, w])), [waiting.data]);
  const metaOf = (r: Row) => {
    const w = r.status === 'SUBMITTED' ? waitingOf.get(`${type}:${r.id}`) : undefined;
    if (!w) return timeAgo(r.createdAt);
    const who = w.waitingWith.length ? t('With {who}', { who: w.waitingWith.map((x) => t(x)).join(', ') }) : t('No approver yet');
    return [w.levels > 1 ? t('Level {level} of {levels}', { level: w.level, levels: w.levels }) : null, who, timeAgo(w.waitingSince)].filter(Boolean).join(' · ');
  };

  const data = first.data ? [...first.data.rows, ...more.rows] : null;
  const total = first.data?.total ?? 0;
  const { loading, refreshing, error, reload } = first;
  const refresh = () => {
    void first.refresh();
    void waiting.refresh();
  };

  const loadMore = async () => {
    if (moreBusy || !data || data.length >= total) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const next = await loadPage(api, type, more.page + 1, q, t);
      setMore((m) => ({ rows: [...m.rows, ...next.rows], page: m.page + 1 }));
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setMoreBusy(false);
    }
  };

  const path = OUTBOX_DETAIL[type];

  return (
    <Screen scroll={false} padded={false}>
      {/* A row of tabs that scrolls sideways, so each keeps a 48 dp target and its full label (UX item 88). */}
      <View style={styles.segmentsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segments} accessibilityRole="tablist">
          {SEGMENTS.map((s) => {
            const active = s.type === type;
            return (
              <Touchable key={s.type} onPress={() => setType(s.type)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.segment, active && styles.segmentActive]}>
                <Text numberOfLines={1} maxFontSizeMultiplier={maxFontScale} style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t(s.label)}
                </Text>
              </Touchable>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.banner}>
        <OfflineBanner />
        <Input value={text} onChangeText={setText} placeholder={t('Search')} accessibilityLabel={t('Search my submissions')} returnKeyType="search" autoCapitalize="none" containerStyle={styles.search} />
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
          ListEmptyComponent={q ? <EmptyState title={t('No matches')} subtitle={t('Nothing matches "{q}".', { q })} icon="search-outline" /> : <EmptyState title={t('Nothing here yet')} subtitle={t('Your submissions of this type will appear here.')} icon="file-tray-outline" art="entries" />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            data && data.length < total ? (
              <View style={styles.footer}>
                {moreError ? <ErrorBannerText text={moreError} /> : null}
                <Button title={t('Load more · {shown} of {total}', { shown: data.length, total })} variant="ghost" loading={moreBusy} onPress={() => void loadMore()} />
              </View>
            ) : null
          }
          renderItem={({ item }) => <SubmissionRow type={type} title={item.title} subtitle={item.subtitle} status={item.status} meta={metaOf(item)} onPress={() => router.push(`${path}${item.id}`)} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmentsWrap: { margin: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.neutralSoft, borderRadius: radius.md },
  segments: { flexDirection: 'row', padding: 4, gap: 2 },
  segment: { minHeight: touch.min, minWidth: touch.min, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  segmentText: { fontWeight: '600', color: colors.textMuted, fontSize: fontSize.secondary },
  segmentTextActive: { color: colors.primary },
  banner: { paddingHorizontal: spacing.lg },
  search: { marginBottom: 0 },
  footer: { paddingVertical: spacing.sm },
  moreError: { color: colors.danger, fontSize: fontSize.secondary, textAlign: 'center', marginBottom: spacing.xs },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, flexGrow: 1 },
});

function ErrorBannerText({ text }: { text: string }) {
  return <Text maxFontSizeMultiplier={maxFontScale} style={styles.moreError}>{text}</Text>;
}
