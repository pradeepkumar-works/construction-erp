import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ActivityDto, type ProjectDetail } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { Button, Card, EmptyState, ErrorState, KeyValue, Loading, Pill, ProgressBar, Screen, SectionTitle, Stat } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
          <Pill text={PROJECT_STATUS_LABELS[project.status]} fg={project.status === 'ACTIVE' ? colors.success : colors.neutral} bg={project.status === 'ACTIVE' ? colors.successSoft : colors.neutralSoft} />
        </View>
        <Text style={typography.h2}>{project.name}</Text>
        <Text style={typography.caption}>{PROJECT_TYPE_LABELS[project.type]}</Text>
        <View style={styles.bar}>
          <ProgressBar value={project.physicalProgressPct} height={12} />
        </View>
        <KeyValue label="Client" value={project.clientName} />
        <KeyValue label="Location" value={project.location} />
        <KeyValue label="Project manager" value={project.projectManagerName} />
        <KeyValue label="Start" value={formatDate(project.startDate)} />
        <KeyValue label="End" value={formatDate(project.endDate)} />
        {project.workOrderNo ? <KeyValue label="Work order" value={project.workOrderNo} /> : null}
      </Card>

      <View style={styles.stats}>
        <Stat label="Activities" value={activities.length} />
        <Stat label="Delayed" value={delayed} tone={delayed ? colors.danger : colors.success} />
        <Stat label="Pending approvals" value={project.pendingApprovals} tone={project.pendingApprovals ? colors.warning : colors.textMuted} />
      </View>

      <View style={styles.actions}>
        <Button title="Add progress" icon="trending-up" onPress={() => router.push(`/progress/new?projectId=${project.id}`)} style={styles.flex} />
        <Button title="New DPR" icon="document-text" variant="secondary" onPress={() => router.push(`/dpr/new?projectId=${project.id}`)} style={styles.flex} />
      </View>

      <SectionTitle title="Activities" right={<Text style={typography.caption}>planned / executed</Text>} />
      {activities.length === 0 ? (
        <EmptyState title="No activities" subtitle="Activities are set up by the planning team on the web." icon="list-outline" />
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
                  {a.plannedEnd ? ` · due ${formatDate(a.plannedEnd)}` : ''}
                </Text>
              </View>
              {a.isDelayed ? (
                <View style={styles.delayed}>
                  <Ionicons name="warning" size={14} color={colors.danger} />
                  <Text style={styles.delayedText}>Delayed</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.actBar}>
              <ProgressBar value={a.progressPct} color={a.isDelayed ? colors.danger : undefined} />
            </View>
            <Button title="Add progress for this activity" size="sm" variant="secondary" icon="add" onPress={() => router.push(`/progress/new?projectId=${project.id}&activityId=${a.id}`)} />
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
  actTop: { flexDirection: 'row', alignItems: 'flex-start' },
  delayed: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.dangerSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: spacing.sm },
  delayedText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  actBar: { marginVertical: spacing.md },
});
