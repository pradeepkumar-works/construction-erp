import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canKeepStock, canRecordAttendance } from '@erp/shared';
import type { DailyReportDto, MaterialRequestDto, Paginated, ProgressEntryDto, ProjectSummary, SubmissionBase, SubmissionType } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { fetchProjects } from '../../src/api/lists';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Card, EmptyState, ErrorState, Loading, NotificationBell, OfflineBanner, Screen, SectionTitle, Stat, SubmissionRow } from '../../src/components';
import { useOffline } from '../../src/offline';
import { colors, radius, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, timeAgo, today } from '../../src/utils/format';

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

  const derived = useMemo(() => {
    if (!data) return null;
    const all: Recent[] = [
      ...data.progress.map((p) => ({ type: 'PROGRESS' as const, item: p, title: `${p.activityName} · ${fmtQty(p.quantity)} ${p.unit}`, subtitle: `${p.projectName} · ${formatDate(p.date)}` })),
      ...data.dprs.map((d) => ({ type: 'DPR' as const, item: d, title: `DPR · ${formatDate(d.date)}`, subtitle: d.projectName })),
      ...data.mrs.map((m) => ({ type: 'MATERIAL_REQUEST' as const, item: m, title: `${m.requestNo} · ${m.items.length} item${m.items.length === 1 ? '' : 's'}`, subtitle: `${m.projectName} · needed ${formatDate(m.requiredDate)}` })),
    ];
    const pending = all.filter((r) => r.item.status === 'SUBMITTED').length;
    const changes = all.filter((r) => r.item.status === 'CHANGES_REQUESTED').length;
    const recent = [...all].sort((a, b) => (b.item.createdAt > a.item.createdAt ? 1 : -1)).slice(0, 8);
    const t = today();
    const dprToday = data.projects.map((p) => ({
      project: p,
      dpr: data.dprs.find((d) => d.projectId === p.id && d.date === t) ?? null,
      queued: outbox.some((i) => i.type === 'DPR' && i.payload.projectId === p.id && i.payload.date === t),
    }));
    return { pending, changes, recent, dprToday };
  }, [data, outbox]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName.split(' ')[0] ?? '';

  const openDetail = (r: Recent) => {
    const path = r.type === 'PROGRESS' ? '/progress/' : r.type === 'DPR' ? '/dpr/' : '/material-request/';
    router.push(`${path}${r.item.id}`);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topRow}>
        <View style={styles.flex}>
          <Text style={typography.h1}>
            {greeting}, {firstName}
          </Text>
          <Text style={[typography.caption, styles.sub]}>{user?.roleName} · {formatDate(today())}</Text>
        </View>
        <NotificationBell />
      </View>
      <OfflineBanner />

      <SectionTitle title="New entry" />
      <View style={styles.quick}>
        <QuickAction icon="trending-up" label="Progress" onPress={() => router.push('/progress/new')} tone={colors.brand} iconColor={colors.onBrand} />
        <QuickAction icon="document-text" label="DPR" onPress={() => router.push('/dpr/new')} tone={colors.accent} />
        <QuickAction icon="cube" label="Material" onPress={() => router.push('/material-request/new')} tone={colors.success} />
        {user && canRecordAttendance(user.roleKey) ? <QuickAction icon="people" label="Attendance" onPress={() => router.push('/attendance')} tone={colors.primaryDark} /> : null}
        {/* Four tiles fit a phone row: the store manager gets Stock where site supervisors get Attendance. */}
        {user && canKeepStock(user.roleKey) && !canRecordAttendance(user.roleKey) ? <QuickAction icon="file-tray-stacked" label="Stock" onPress={() => router.push('/stock')} tone={colors.info} /> : null}
      </View>

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && derived ? (
        <>
          <View style={styles.stats}>
            <Stat label="My projects" value={data.projects.length} />
            <Stat label="Awaiting approval" value={derived.pending} tone={colors.warning} />
            <Stat label="Changes requested" value={derived.changes} tone={derived.changes ? colors.info : colors.textMuted} />
          </View>

          <SectionTitle title="Today's DPR" />
          {derived.dprToday.length === 0 ? (
            <Card>
              <Text style={typography.caption}>You are not assigned to any project yet.</Text>
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
                      <Text style={[styles.dprStateText, { color: colors.success }]}>Done</Text>
                    </View>
                  ) : queued ? (
                    <View style={[styles.dprState, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                      <Text style={[styles.dprStateText, { color: colors.primary }]}>In outbox</Text>
                    </View>
                  ) : (
                    <View style={[styles.dprState, { backgroundColor: colors.warningSoft }]}>
                      <Ionicons name="time" size={18} color={colors.warning} />
                      <Text style={[styles.dprStateText, { color: colors.warning }]}>Not submitted</Text>
                    </View>
                  )}
                </View>
              </Card>
            ))
          )}

          <SectionTitle title="My recent submissions" right={<Button title="See all" variant="ghost" size="sm" onPress={() => router.push('/submissions')} />} />
          {derived.recent.length === 0 ? (
            <EmptyState title="No submissions yet" subtitle="Use the quick actions above to submit your first entry." icon="create-outline" />
          ) : (
            derived.recent.map((r) => <SubmissionRow key={`${r.type}-${r.item.id}`} type={r.type} title={r.title} subtitle={r.subtitle} status={r.item.status} meta={timeAgo(r.item.createdAt)} onPress={() => openDetail(r)} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

function QuickAction({ icon, label, onPress, tone, iconColor = '#fff' }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone: string; iconColor?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`New ${label}`} style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}>
      <View style={[styles.quickIcon, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sub: { marginTop: 2, marginBottom: spacing.sm },
  quick: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  quickBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 96, justifyContent: 'center' },
  quickIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  quickLabel: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  dprRow: { flexDirection: 'row', alignItems: 'center' },
  dprState: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, marginLeft: spacing.sm },
  dprStateText: { fontSize: 12, fontWeight: '700' },
});
