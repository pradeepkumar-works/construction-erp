import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SUBMISSION_STATUS_LABELS, canKeepStock, canRecordAttendance, seesCompanyToday } from '@erp/shared';
import type { CompanyTodayDto, DailyReportDto, MaterialRequestDto, MyWorkDto, Paginated, ProgressEntryDto, ProjectSummary, SubmissionBase, SubmissionType } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { fetchProjects } from '../../src/api/lists';
import { useAuth } from '../../src/auth/AuthContext';
import { BillingBanner, Button, Card, EmptyState, ErrorState, NotificationBell, OfflineBanner, Screen, SectionTitle, Stat, SubmissionRow, Touchable } from '../../src/components';
import { CompanyTodayPanel } from '../../src/components/CompanyToday';
import { MyWorkPanel } from '../../src/components/MyWork';
import { Skeleton } from '../../src/components/Skeleton';
import { useOffline } from '../../src/offline';
import { colors, fontSize, radius, spacing, statusTone, typography } from '../../src/theme';
import { fmtQty, formatDate, timeAgo, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

interface HomeData {
  projects: ProjectSummary[];
  progress: ProgressEntryDto[];
  dprs: DailyReportDto[];
  mrs: MaterialRequestDto[];
}

type Recent = { type: SubmissionType; item: SubmissionBase; title: string; subtitle: string };

export default function HomeScreen() {
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
    const pending = all.filter((r) => r.item.status === 'SUBMITTED').length;
    const changes = all.filter((r) => r.item.status === 'CHANGES_REQUESTED').length;
    const recent = [...all].sort((a, b) => (b.item.createdAt > a.item.createdAt ? 1 : -1)).slice(0, 8);
    const day = today();
    const dprToday = data.projects.map((p) => ({
      project: p,
      dpr: data.dprs.find((d) => d.projectId === p.id && d.date === day) ?? null,
      queued: outbox.some((i) => i.type === 'DPR' && i.payload.projectId === p.id && i.payload.date === day),
    }));
    return { pending, changes, recent, dprToday };
  }, [data, outbox, t]);

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  const firstName = user?.fullName.split(' ')[0] ?? '';

  const openDetail = (r: Recent) => {
    const path = r.type === 'PROGRESS' ? '/progress/' : r.type === 'DPR' ? '/dpr/' : '/material-request/';
    router.push(`${path}${r.item.id}`);
  };

  return (
    <Screen refreshing={refreshing || myWork.refreshing || company.refreshing} onRefresh={refreshAll} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topRow}>
        <View style={styles.flex}>
          <Text style={typography.h1}>
            {t('{greeting}, {name}', { greeting, name: firstName })}
          </Text>
          <Text style={[typography.caption, styles.sub]}>{user ? t(user.roleName) : ''} · {formatDate(today())}</Text>
        </View>
        <NotificationBell />
      </View>
      <BillingBanner />
      <OfflineBanner />

      {leads ? <CompanyTodayPanel data={company.data} loading={company.loading} /> : null}
      <MyWorkPanel data={myWork.data} loading={myWork.loading} />

      <SectionTitle title={t('New entry')} />
      <View style={styles.quick}>
        <QuickAction icon="trending-up" label={t('Progress')} onPress={() => router.push('/progress/new')} tone={colors.brand} iconColor={colors.onBrand} />
        <QuickAction icon="document-text" label="DPR" onPress={() => router.push('/dpr/new')} tone={colors.accent} />
        <QuickAction icon="cube" label={t('Material')} onPress={() => router.push('/material-request/new')} tone={colors.success} />
        {user && canRecordAttendance(user.roleKey) ? <QuickAction icon="people" label={t('Attendance')} onPress={() => router.push('/attendance')} tone={colors.primaryDark} /> : null}
        {/* Four tiles fit a phone row: the store manager gets Stock where site supervisors get Attendance. */}
        {user && canKeepStock(user.roleKey) && !canRecordAttendance(user.roleKey) ? <QuickAction icon="file-tray-stacked" label={t('Stock')} onPress={() => router.push('/stock')} tone={colors.info} /> : null}
      </View>

      {loading && !data ? (
        <Skeleton variant="card" label={t('Loading…')} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && derived ? (
        <>
          <View style={styles.stats}>
            <Stat label={t('My projects')} value={data.projects.length} />
            <Stat label={t(SUBMISSION_STATUS_LABELS.SUBMITTED)} value={derived.pending} tone={statusTone.SUBMITTED.fg} />
            <Stat label={t(SUBMISSION_STATUS_LABELS.CHANGES_REQUESTED)} value={derived.changes} tone={derived.changes ? statusTone.CHANGES_REQUESTED.fg : colors.textMuted} />
          </View>

          <SectionTitle title={t("Today's DPR")} />
          {derived.dprToday.length === 0 ? (
            <Card>
              <Text style={typography.caption}>{t('You are not assigned to any project yet.')}</Text>
            </Card>
          ) : (
            derived.dprToday.map(({ project, dpr, queued }) => (
              <Card key={project.id} onPress={() => (dpr ? router.push(`/dpr/${dpr.id}`) : queued ? router.push('/outbox') : router.push(`/dpr/new?projectId=${project.id}`))}>
                <View style={styles.dprRow}>
                  <View style={styles.flex}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>
                      {project.name}
                    </Text>
                    <Text style={typography.caption}>{project.code}</Text>
                  </View>
                  {dpr ? (
                    <View style={[styles.dprState, { backgroundColor: colors.successSoft }]}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      <Text style={[styles.dprStateText, { color: colors.success }]}>{t('Done')}</Text>
                    </View>
                  ) : queued ? (
                    <View style={[styles.dprState, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                      <Text style={[styles.dprStateText, { color: colors.primary }]}>{t('In outbox')}</Text>
                    </View>
                  ) : (
                    <View style={[styles.dprState, { backgroundColor: colors.warningSoft }]}>
                      <Ionicons name="time" size={18} color={colors.warning} />
                      <Text style={[styles.dprStateText, { color: colors.warning }]}>{t('Not submitted')}</Text>
                    </View>
                  )}
                </View>
              </Card>
            ))
          )}

          <SectionTitle title={t('My recent submissions')} right={<Button title={t('See all')} variant="ghost" size="sm" onPress={() => router.push('/submissions')} />} />
          {derived.recent.length === 0 ? (
            <EmptyState title={t('No submissions yet')} subtitle={t('Use the quick actions above to submit your first entry.')} icon="create-outline" art="entries" />
          ) : (
            derived.recent.map((r) => <SubmissionRow key={`${r.type}-${r.item.id}`} type={r.type} title={r.title} subtitle={r.subtitle} status={r.item.status} meta={timeAgo(r.item.createdAt)} onPress={() => openDetail(r)} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

function QuickAction({ icon, label, onPress, tone, iconColor = colors.onBrand }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone: string; iconColor?: string }) {
  const t = useT();
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('New {label}', { label })} style={styles.quickBtn}>
      <View style={[styles.quickIcon, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sub: { marginTop: 2, marginBottom: spacing.sm },
  quick: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  quickBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 96, justifyContent: 'center' },
  quickIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  quickLabel: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.text, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  dprRow: { flexDirection: 'row', alignItems: 'center' },
  dprState: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, marginLeft: spacing.sm },
  dprStateText: { fontSize: fontSize.small, fontWeight: '700' },
});
