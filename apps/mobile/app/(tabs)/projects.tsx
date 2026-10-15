import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectSummary } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { fetchProjects } from '../../src/api/lists';
import { Card, EmptyState, ErrorState, Loading, Pill, ProgressBar, Screen } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { useT } from '../../src/i18n/LanguageContext';

export default function ProjectsScreen() {
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<ProjectSummary[]>(fetchProjects, [], { cacheKey: 'projects' });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState title={t('No projects')} subtitle={t('You have not been added to any project yet.')} icon="business-outline" art="projects" />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/project/${item.id}`)}>
            <View style={styles.top}>
              <Text style={styles.code}>{item.code}</Text>
              <Pill text={t(PROJECT_STATUS_LABELS[item.status])} fg={item.status === 'ACTIVE' ? colors.success : colors.neutral} bg={item.status === 'ACTIVE' ? colors.successSoft : colors.neutralSoft} />
            </View>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={typography.caption}>{t(PROJECT_TYPE_LABELS[item.type])}</Text>
            <View style={styles.bar}>
              <ProgressBar value={item.physicalProgressPct} />
            </View>
            <View style={styles.metaRow}>
              {item.clientName ? (
                <View style={styles.meta}>
                  <Ionicons name="briefcase-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {item.clientName}
                  </Text>
                </View>
              ) : null}
              {item.location ? (
                <View style={styles.meta}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
              ) : null}
            </View>
            {item.pendingApprovals > 0 ? (
              <Text style={styles.pending}>
                {item.pendingApprovals === 1 ? t('1 pending approval') : t('{n} pending approvals', { n: item.pendingApprovals })}
              </Text>
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  code: { ...typography.label, color: colors.primary },
  name: { ...typography.h3, marginBottom: 2 },
  bar: { marginTop: spacing.md, marginBottom: spacing.sm },
  metaRow: { gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.caption, flex: 1 },
  pending: { ...typography.caption, color: colors.warning, fontWeight: '600', marginTop: spacing.sm },
});
