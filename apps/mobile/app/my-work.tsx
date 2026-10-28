import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SUBMISSION_STATUS_LABELS, seesCompanyToday } from '@erp/shared';
import type { CompanyTodayDto, DailyReportDto, MaterialRequestDto, MyWorkDto, Paginated, ProgressEntryDto, ProjectSummary, SubmissionBase, SubmissionType } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { fetchProjects } from '../src/api/lists';
import { useAuth } from '../src/auth/AuthContext';
import { Button, EmptyState, ErrorState, OfflineBanner, Screen, SectionTitle, SubmissionRow, Touchable } from '../src/components';
import { CompanyTodayPanel } from '../src/components/CompanyToday';
import { MyWorkPanel } from '../src/components/MyWork';
import { NewEntries } from '../src/home/NewEntries';
import { readDprDraft, type DprDraftSteps } from '../src/home/today';
import { useLauncher } from '../src/launcher/useLauncher';
import { Skeleton } from '../src/components/Skeleton';
import { useOffline } from '../src/offline';
import { colors, fontSize, maxFontScale, radius, spacing, statusTone, typography } from '../src/theme';
import { fmtQty, formatDate, timeAgo, today } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

interface HomeData {
  projects: ProjectSummary[];
  progress: ProgressEntryDto[];
  dprs: DailyReportDto[];
  mrs: MaterialRequestDto[];
}

type Recent = { type: SubmissionType; item: SubmissionBase; title: string; subtitle: string };

/**
 * My work, the level under Home (its first icon): the company's day for those who lead with it, Today on site (each
 * project's DPR, with its steps while a draft is on this phone), what waits for the role, New entry and the recent
 * entries.
 */
export default function MyWorkScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const { syncedCount, items: outbox } = useOffline();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<HomeData>(
    async (api) => {
      const [projects, progress, dprs, mrs] = await Promise.all([
        fetchProjects(api),
        api.get<Paginated<ProgressEntryDto>>('/progress', { mine: true, pageSize: 50 }),
        api.get<Paginated<DailyReportDto>>('/dpr', { mine: true, pageSize: 50 }),
        api.get<Paginated<MaterialRequestDto>>('/material-requests', { mine: true, pageSize: 50 }),
      ]);
      return { projects, progress: progress.items, dprs: dprs.items, mrs: mrs.items };
    },
    // Refetch when queued entries reach the server.
    [syncedCount],
    { cacheKey: 'home' },
  );
  // What the role should act on now, as on the web home; pull to refresh reloads it with the rest.
  const myWork = useFetch<MyWorkDto>((api) => api.get('/dashboard/my-work'), [syncedCount], { cacheKey: 'my-work' });
  // Owners, directors, accounts and project managers lead with the company's day (v5 item 96); site roles keep the rest.
  const leads = !!user && seesCompanyToday(user.roleKey);
  const company = useFetch<CompanyTodayDto | null>((api) => (leads ? api.get('/dashboard/company-today') : Promise.resolve(null)), [syncedCount, leads], { cacheKey: 'company-today' });
  const launcher = useLauncher();
  // A DPR typed on this phone and not sent yet, read again each time My work comes back into view.
  const [draft, setDraft] = useState<DprDraftSteps | null>(null);
  useFocusEffect(useCallback(() => setDraft(user ? readDprDraft(user.id) : null), [user]));
  const refreshAll = async () => {
    await Promise.all([refresh(), myWork.refresh(), leads ? company.refresh() : null]);
  };

  const derived = useMemo(() => {
    if (!data) return null;
    const all: Recent[] = [
      ...data.progress.map((p) => ({ type: 'PROGRESS' as const, item: p, title: `${p.activityName} · ${fmtQty(p.quantity)} ${p.unit}`, subtitle: `${p.projectName} · ${formatDate(p.date)}` })),
      ...data.dprs.map((d) => ({ type: 'DPR' as const, item: d, title: `DPR · ${formatDate(d.date)}`, subtitle: d.projectName })),
      ...data.mrs.map((m) => ({ type: 'MATERIAL_REQUEST' as const, item: m, title: `${m.requestNo} · ${m.items.length === 1 ? t('1 item') : t('{n} items', { n: m.items.length })}`, subtitle: `${m.projectName} · ${t('needed {date}', { date: formatDate(m.requiredDate) })}` })),
    ];
    const recent = [...all].sort((a, b) => (b.item.createdAt > a.item.createdAt ? 1 : -1)).slice(0, 5);
    const day = today();
    const dprToday = data.projects.map((p) => ({
      project: p,
      dpr: data.dprs.find((d) => d.projectId === p.id && d.date === day) ?? null,
      queued: outbox.some((i) => i.type === 'DPR' && i.payload.projectId === p.id && i.payload.date === day),
    }));
    return { recent, dprToday };
  }, [data, outbox, t]);

  const openDetail = (r: Recent) => {
    const path = r.type === 'PROGRESS' ? '/progress/' : r.type === 'DPR' ? '/dpr/' : '/material-request/';
    router.push(`${path}${r.item.id}`);
  };

  return (
    <Screen refreshing={refreshing || myWork.refreshing || company.refreshing} onRefresh={refreshAll}>
      <OfflineBanner />

      {leads ? <CompanyTodayPanel data={company.data} loading={company.loading} /> : null}

      {loading && !data ? (
        <Skeleton variant="card" label={t('Loading…')} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && derived && derived.dprToday.length ? (
        <>
          <SectionTitle title={t('Today on site')} right={<Text style={typography.caption}>{formatDate(today())}</Text>} />
          <View style={styles.today}>
            {derived.dprToday.map(({ project, dpr, queued }, i) => (
              <TodayRow key={project.id} first={i === 0} project={project} dpr={dpr} queued={queued} draft={draft && draft.projectId === project.id && draft.date === today() ? draft : null} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle title={t('Waiting for you')} />
      <MyWorkPanel data={myWork.data} loading={myWork.loading} title={false} webUrl={launcher.webUrl} />

      <SectionTitle title={t('New')} />
      <NewEntries />

      {data && derived ? (
        <>
          <SectionTitle title={t('Recent')} right={<Button title={t('See all')} variant="ghost" size="sm" onPress={() => router.push('/submissions')} />} />
          {derived.recent.length === 0 ? (
            <EmptyState title={t('No submissions yet')} subtitle={t('Use New above to send your first entry.')} icon="create-outline" art="entries" />
          ) : (
            derived.recent.map((r) => <SubmissionRow key={`${r.type}-${r.item.id}`} type={r.type} title={r.title} subtitle={r.subtitle} status={r.item.status} meta={timeAgo(r.item.createdAt)} onPress={() => openDetail(r)} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * One project's DPR today: sent (or in the outbox), its steps while a draft is on this phone (head count, work lines,
 * photos, send), or not started.
 */
function TodayRow({ project, dpr, queued, draft, first }: { project: ProjectSummary; dpr: DailyReportDto | null; queued: boolean; draft: DprDraftSteps | null; first: boolean }) {
  const router = useRouter();
  const t = useT();
  const head = (
    <View style={styles.flex}>
      <Text style={typography.bodyStrong} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
        {project.name}
      </Text>
      <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
        {project.code}
      </Text>
    </View>
  );
  if (dpr || queued) {
    const tone = dpr ? statusTone[dpr.status] : { fg: colors.primary, bg: colors.primarySoft, icon: 'cloud-upload-outline' as const };
    return (
      <Touchable accessibilityRole="button" onPress={() => router.push(dpr ? `/dpr/${dpr.id}` : '/outbox')} style={[styles.todayRow, !first && styles.todayRule]}>
        {head}
        <View style={[styles.dprState, { backgroundColor: tone.bg }]}>
          <Ionicons name={tone.icon} size={18} color={tone.fg} />
          <Text style={[styles.dprStateText, { color: tone.fg }]} maxFontSizeMultiplier={maxFontScale}>
            {dpr ? t(SUBMISSION_STATUS_LABELS[dpr.status]) : t('In outbox')}
          </Text>
        </View>
      </Touchable>
    );
  }
  if (draft) {
    const steps = [
      { label: t('Head count'), done: draft.headCount > 0, note: draft.headCount ? t('{n} on site', { n: draft.headCount }) : t('Not counted') },
      { label: t('Work lines'), done: draft.lines > 0, note: draft.lines === 1 ? t('1 line') : draft.lines ? t('{n} lines', { n: draft.lines }) : t('None yet') },
      { label: t('Photos'), done: draft.photos > 0, note: draft.photos === 1 ? t('1 photo') : draft.photos ? t('{n} photos', { n: draft.photos }) : t('None yet') },
      { label: t('Send'), done: false, note: t('Not sent') },
    ];
    const at = steps.findIndex((s) => !s.done);
    const next = [t('Add the head count'), t('Add the work lines'), t('Add photos and send'), t('Send the DPR')][at];
    return (
      <View style={[styles.draft, !first && styles.todayRule]}>
        <View style={styles.todayHead}>
          {head}
          <View style={[styles.dprState, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.dprStateText, { color: colors.primary }]} maxFontSizeMultiplier={maxFontScale}>
              {t('{n} of 4 done', { n: at })}
            </Text>
          </View>
        </View>
        <View style={styles.steps} accessibilityRole="list">
          {steps.map((s, i) => (
            <View key={s.label} style={styles.step} accessibilityLabel={`${s.label}, ${s.note}${s.done ? `, ${t('done')}` : ''}`}>
              <View style={[styles.dot, s.done ? styles.dotDone : i === at ? styles.dotNow : null]}>
                {s.done ? <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} /> : <Text style={[styles.dotText, i === at && { color: colors.primary }]}>{i + 1}</Text>}
              </View>
              <View style={styles.flex}>
                <Text style={typography.body} maxFontSizeMultiplier={maxFontScale}>
                  {s.label}
                </Text>
                <Text style={[typography.caption, i === at && styles.nowNote]} maxFontSizeMultiplier={maxFontScale}>
                  {s.note}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Button title={next} icon={at === 2 ? 'camera-outline' : 'create-outline'} onPress={() => router.push('/dpr/new')} />
      </View>
    );
  }
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={t('{project}: no DPR yet. Start', { project: project.name })} onPress={() => router.push(`/dpr/new?projectId=${project.id}`)} style={[styles.todayRow, !first && styles.todayRule]}>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
          {project.name}
        </Text>
        <Text style={[typography.caption, { color: colors.warning }]} maxFontSizeMultiplier={maxFontScale}>
          {t('No DPR yet')}
        </Text>
      </View>
      <Text style={styles.start} maxFontSizeMultiplier={maxFontScale}>
        {t('Start')}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  today: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.lg, overflow: 'hidden' },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  todayRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  todayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  draft: { padding: spacing.lg, gap: spacing.md },
  dprState: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
  dprStateText: { fontSize: fontSize.small, fontWeight: '700' },
  steps: { gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotNow: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  dotText: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },
  nowNote: { color: colors.primary, fontWeight: '600' },
  start: { fontSize: fontSize.body, fontWeight: '600', color: colors.primary },
});
