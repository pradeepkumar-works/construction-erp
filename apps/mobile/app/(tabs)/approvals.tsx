import React, { useMemo } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SUBMISSION_TYPE_LABELS, type PendingApprovalDto, type SubmissionType } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { EmptyState, ErrorState, Loading, Screen, SubmissionRow } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { timeAgo } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

const ORDER: SubmissionType[] = ['DPR', 'PROGRESS', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT', 'BILL', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'INSPECTION'];
const DETAIL_PATH: Record<SubmissionType, string> = { PROGRESS: '/progress/', DPR: '/dpr/', MATERIAL_REQUEST: '/material-request/', MACHINERY: '/machinery/', EXPENSE: '/expense/', MEASUREMENT: '/measurement/', BILL: '/bill/', PURCHASE_ORDER: '/purchase-order/', VENDOR_BILL: '/vendor-bill/', WORK_ORDER: '/work-order/', SUBCONTRACT_BILL: '/subcontract-bill/', INSPECTION: '/inspection/' };

export default function ApprovalsScreen() {
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<PendingApprovalDto[]>((api) => api.get('/approvals/pending'), []);

  const sections = useMemo(
    () =>
      ORDER.map((type) => ({ type, title: t(SUBMISSION_TYPE_LABELS[type]), data: (data ?? []).filter((p) => p.type === type) })).filter((s) => s.data.length > 0),
    [data, t],
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
              {data.length === 1 ? t('1 item waiting for your review') : t('{n} items waiting for your review', { n: data.length })}
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState title={t('All caught up')} subtitle={t('Nothing is waiting for your approval.')} icon="checkmark-done-circle-outline" art="approved" />}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={typography.h3}>{section.title}</Text>
            <Text style={typography.caption}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SubmissionRow type={item.type} title={item.title} subtitle={item.projectName} meta={`${item.amount && item.type !== 'EXPENSE' ? `₹${Number(item.amount).toLocaleString('en-IN')} · ` : ''}${item.submittedByName} · ${timeAgo(item.submittedAt)}`} onPress={() => router.push(`${DETAIL_PATH[item.type]}${item.id}`)} />
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
