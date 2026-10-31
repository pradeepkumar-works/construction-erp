import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, canManageWorkers, canRecordAttendance, pathIsOff, sectorStepOf, type ActivityDto, type ProjectDetail } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useFetch } from '../../src/api/hooks';
import { Button, Card, EmptyState, ErrorState, KeyValue, Loading, Pill, ProgressBar, Screen, SectionTitle, Stat, Touchable } from '../../src/components';
import { colors, fontSize, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';
import { projectStatusPill } from '../../src/utils/project-status';
import { useT } from '../../src/i18n/LanguageContext';
import { ScheduleStatus } from '../../src/components/ScheduleStatus';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload } = useFetch(
    async (api) => {
      const [project, activities] = await Promise.all([api.get<ProjectDetail>(`/projects/${id}`), api.get<ActivityDto[]>(`/projects/${id}/activities`)]);
      return { project, activities };
    },
    [id],
    { enabled: !!id, cacheKey: `project:${id}` },
  );

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { project, activities } = data;
  const delayed = activities.filter((a) => a.isDelayed).length;
  // Where the project's type places work (item 134): none for a type that is not located by place.
  const sector = sectorStepOf(project);
  // The project's other screens, as rows; a module the company turned off is left out, as on the Submit tab.
  const role = user?.roleKey;
  const all: { path: string; query?: string; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; show: boolean }[] = [
    { path: '/attendance', icon: 'people-outline', title: t("Today's attendance"), show: !!role && canRecordAttendance(role) },
    { path: '/roll-call', icon: 'checkbox-outline', title: t('Roll call'), show: !!role && canManageWorkers(role) },
    { path: '/stock', icon: 'cube-outline', title: t('Stock'), show: true },
    { path: '/sector', query: `&kind=${sector}`, icon: 'map-outline', title: sector === 'chainage' ? t('Progress by chainage') : sector === 'floors' ? t('Progress by floor') : t('Villages and pipeline'), show: !!sector },
    { path: '/structure', icon: 'git-network-outline', title: t('Structure'), show: true },
    { path: '/risks', icon: 'alert-circle-outline', title: t('Delays and risks'), show: true },
    { path: '/safety', icon: 'medkit-outline', title: t('Safety'), show: true },
  ];
  const places = all.filter((p) => p.show && !pathIsOff(p.path, user?.modulesOff));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: project.code }} />
      <Card>
        <View style={styles.top}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.code}>{project.code}</Text>
          <Pill text={t(PROJECT_STATUS_LABELS[project.status])} {...projectStatusPill(project.status)} />
        </View>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{project.name}</Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{project.typeName && project.typeName !== PROJECT_TYPE_LABELS[project.type] ? project.typeName : t(PROJECT_TYPE_LABELS[project.type])}</Text>
        <ScheduleStatus project={project} />
        <View style={styles.bar}>
          <ProgressBar value={project.physicalProgressPct} height={12} />
        </View>
        <KeyValue label={t('Client')} value={project.clientName} />
        <KeyValue label={t('Location')} value={project.location} />
        <KeyValue label={t('Project manager')} value={project.projectManagerName} />
        <KeyValue label={t('Start')} value={formatDate(project.startDate)} />
        <KeyValue label={t('Completion')} value={formatDate(project.endDate)} />
        {project.workOrderNo ? <KeyValue label={t('Work order')} value={project.workOrderNo} /> : null}
      </Card>

      <View style={styles.stats}>
        <Stat label={t('Activities')} value={activities.length} />
        <Stat label={t('Delayed')} value={delayed} tone={delayed ? colors.danger : colors.success} />
        <Stat label={t('Pending approvals')} value={project.pendingApprovals} tone={project.pendingApprovals ? colors.warning : colors.textMuted} />
      </View>

      <View style={styles.actions}>
        <Button title={t('New progress entry')} icon="trending-up" onPress={() => router.push(`/progress/new?projectId=${project.id}`)} style={styles.flex} />
        <Button title={t('New daily report')} icon="document-text" variant="secondary" onPress={() => router.push(`/dpr/new?projectId=${project.id}`)} style={styles.flex} />
      </View>
      <Card style={styles.links}>
        {places.map((p, i) => (
          <Touchable key={p.path} accessibilityRole="link" onPress={() => router.push(`${p.path}?projectId=${project.id}${p.query ?? ''}`)} style={[styles.link, i > 0 && styles.linkRule]}>
            <Ionicons name={p.icon} size={22} color={colors.primary} />
            <Text maxFontSizeMultiplier={maxFontScale} style={[typography.body, styles.flex]}>
              {p.title}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Touchable>
        ))}
      </Card>

      <SectionTitle title={t('Activities')} right={<Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('done of planned')}</Text>} />
      {activities.length === 0 ? (
        <EmptyState title={t('No activities')} subtitle={t('Activities are set up by the planning team on the web.')} icon="list-outline" />
      ) : (
        activities.map((a) => (
          // An activity made of parts takes its progress through them (item 125), so only a plain one opens the form.
          <Card
            key={a.id}
            onPress={a.isSummary ? undefined : () => router.push(`/progress/new?projectId=${project.id}&activityId=${a.id}`)}
            accessibilityLabel={a.isSummary ? undefined : `${a.boqItemNo ? `${a.boqItemNo} · ` : ''}${a.name}`}
            accessibilityHint={a.isSummary ? undefined : t('Opens a new progress entry for this activity')}
          >
            <View style={styles.actTop}>
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.bodyStrong}>
                  {a.boqItemNo ? `${a.boqItemNo} · ` : ''}
                  {a.name}
                </Text>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                  {a.isSummary ? t('Made of {n} parts', { n: activities.filter((p) => p.parentActivityId === a.id).length }) : t('{executed} of {planned} {unit} done', { executed: fmtQty(a.executedQty), planned: fmtQty(a.plannedQty), unit: a.unit })}
                  {a.plannedEnd ? ` · ${t('due {date}', { date: formatDate(a.plannedEnd) })}` : ''}
                </Text>
              </View>
              {a.isDelayed ? (
                <View style={styles.delayed}>
                  <Ionicons name="warning" size={14} color={colors.danger} />
                  <Text maxFontSizeMultiplier={maxFontScale} style={styles.delayedText}>{t('Delayed')}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actBar}>
              <ProgressBar value={a.progressPct} color={a.isDelayed ? colors.danger : undefined} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  code: { ...typography.label, color: colors.primary },
  bar: { marginVertical: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  links: { paddingVertical: 0 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  linkRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actTop: { flexDirection: 'row', alignItems: 'flex-start' },
  delayed: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.dangerSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: spacing.sm },
  delayedText: { color: colors.danger, fontSize: fontSize.small, fontWeight: '700' },
  actBar: { marginVertical: spacing.md },
});
