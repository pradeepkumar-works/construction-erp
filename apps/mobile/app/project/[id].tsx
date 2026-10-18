import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, canManageWorkers, canRecordAttendance, type ActivityDto, type ProjectDetail } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useFetch } from '../../src/api/hooks';
import { Button, Card, EmptyState, ErrorState, KeyValue, Loading, Pill, ProgressBar, Screen, SectionTitle, Stat } from '../../src/components';
import { colors, fontSize, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

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

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: project.code }} />
      <Card>
        <View style={styles.top}>
          <Text style={styles.code}>{project.code}</Text>
          <Pill text={t(PROJECT_STATUS_LABELS[project.status])} fg={project.status === 'ACTIVE' ? colors.success : colors.neutral} bg={project.status === 'ACTIVE' ? colors.successSoft : colors.neutralSoft} icon={project.status === 'ACTIVE' ? 'play-circle-outline' : 'pause-circle-outline'} />
        </View>
        <Text style={typography.h2}>{project.name}</Text>
        <Text style={typography.caption}>{t(PROJECT_TYPE_LABELS[project.type])}</Text>
        <View style={styles.bar}>
          <ProgressBar value={project.physicalProgressPct} height={12} />
        </View>
        <KeyValue label={t('Client')} value={project.clientName} />
        <KeyValue label={t('Location')} value={project.location} />
        <KeyValue label={t('Project manager')} value={project.projectManagerName} />
        <KeyValue label={t('Start')} value={formatDate(project.startDate)} />
        <KeyValue label={t('End')} value={formatDate(project.endDate)} />
        {project.workOrderNo ? <KeyValue label={t('Work order')} value={project.workOrderNo} /> : null}
      </Card>

      <View style={styles.stats}>
        <Stat label={t('Activities')} value={activities.length} />
        <Stat label={t('Delayed')} value={delayed} tone={delayed ? colors.danger : colors.success} />
        <Stat label={t('Pending approvals')} value={project.pendingApprovals} tone={project.pendingApprovals ? colors.warning : colors.textMuted} />
      </View>

      <View style={styles.actions}>
        <Button title={t('Add progress')} icon="trending-up" onPress={() => router.push(`/progress/new?projectId=${project.id}`)} style={styles.flex} />
        <Button title={t('New DPR')} icon="document-text" variant="secondary" onPress={() => router.push(`/dpr/new?projectId=${project.id}`)} style={styles.flex} />
      </View>
      {user && canRecordAttendance(user.roleKey) ? (
        <Button title={t("Today's attendance")} icon="people" variant="secondary" onPress={() => router.push(`/attendance?projectId=${project.id}`)} style={styles.attendance} />
      ) : null}
      {user && canManageWorkers(user.roleKey) ? (
        <Button title={t('Roll call')} icon="checkbox-outline" variant="secondary" onPress={() => router.push(`/roll-call?projectId=${project.id}`)} style={styles.attendance} />
      ) : null}
      <Button title={t('Stock')} icon="cube-outline" variant="secondary" onPress={() => router.push(`/stock?projectId=${project.id}`)} style={styles.attendance} />
      <Button title={project.type === 'ROAD' ? t('Progress by chainage') : project.type === 'BUILDING' ? t('Progress by floor') : t('Villages & pipeline')} icon="map-outline" variant="secondary" onPress={() => router.push(`/sector?projectId=${project.id}`)} style={styles.attendance} />
      <Button title={t('Delays & risks')} icon="alert-circle-outline" variant="secondary" onPress={() => router.push(`/risks?projectId=${project.id}`)} style={styles.attendance} />
      <Button title={t('Safety')} icon="medkit-outline" variant="secondary" onPress={() => router.push(`/safety?projectId=${project.id}`)} style={styles.attendance} />

      <SectionTitle title={t('Activities')} right={<Text style={typography.caption}>{t('planned / executed')}</Text>} />
      {activities.length === 0 ? (
        <EmptyState title={t('No activities')} subtitle={t('Activities are set up by the planning team on the web.')} icon="list-outline" />
      ) : (
        activities.map((a) => (
          <Card key={a.id}>
            <View style={styles.actTop}>
              <View style={styles.flex}>
                <Text style={typography.bodyStrong}>
                  {a.boqItemNo ? `${a.boqItemNo} · ` : ''}
                  {a.name}
                </Text>
                <Text style={typography.caption}>
                  {fmtQty(a.plannedQty)} / {fmtQty(a.executedQty)} {a.unit}
                  {a.plannedEnd ? ` · ${t('due {date}', { date: formatDate(a.plannedEnd) })}` : ''}
                </Text>
              </View>
              {a.isDelayed ? (
                <View style={styles.delayed}>
                  <Ionicons name="warning" size={14} color={colors.danger} />
                  <Text style={styles.delayedText}>{t('Delayed')}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actBar}>
              <ProgressBar value={a.progressPct} color={a.isDelayed ? colors.danger : undefined} />
            </View>
            <Button title={t('Add progress for this activity')} size="sm" variant="secondary" icon="add" onPress={() => router.push(`/progress/new?projectId=${project.id}&activityId=${a.id}`)} />
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
  attendance: { marginBottom: spacing.sm },
  actTop: { flexDirection: 'row', alignItems: 'flex-start' },
  delayed: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.dangerSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: spacing.sm },
  delayedText: { color: colors.danger, fontSize: fontSize.small, fontWeight: '700' },
  actBar: { marginVertical: spacing.md },
});
