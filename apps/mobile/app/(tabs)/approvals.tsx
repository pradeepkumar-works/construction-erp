import React, { useMemo } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SUBMISSION_TYPE_LABELS, type PendingApprovalDto, type SubmissionType } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { EmptyState, ErrorState, Loading, Screen, SubmissionRow } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { timeAgo } from '../../src/utils/format';

const ORDER: SubmissionType[] = ['DPR', 'PROGRESS', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT'];
const DETAIL_PATH: Record<SubmissionType, string> = { PROGRESS: '/progress/', DPR: '/dpr/', MATERIAL_REQUEST: '/material-request/', MACHINERY: '/machinery/', EXPENSE: '/expense/', MEASUREMENT: '/measurement/' };

export default function ApprovalsScreen() {
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<PendingApprovalDto[]>((api) => api.get('/approvals/pending'), []);

  const sections = useMemo(
    () =>
      ORDER.map((type) => ({ type, title: SUBMISSION_TYPE_LABELS[type], data: (data ?? []).filter((p) => p.type === type) })).filter((s) => s.data.length > 0),
    [data],
  );

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <Screen scroll={false} padded={false}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          data && data.length ? (
            <Text style={styles.summary}>
              {data.length} item{data.length === 1 ? '' : 's'} waiting for your review
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState title="All caught up" subtitle="Nothing is waiting for your approval." icon="checkmark-done-circle-outline" />}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={typography.h3}>{section.title}</Text>
            <Text style={typography.caption}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SubmissionRow type={item.type} title={item.title} subtitle={item.projectName} meta={`${item.submittedByName} · ${timeAgo(item.submittedAt)}`} onPress={() => router.push(`${DETAIL_PATH[item.type]}${item.id}`)} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  summary: { ...typography.caption, marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
});
