import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ProgressEntryDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { useT } from '../../src/i18n/LanguageContext';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

export default function ProgressDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<ProgressEntryDto>((api) => api.get(`/progress/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.activityName} subtitle={`${t('Progress entry')} · ${formatDate(data.date)}`} />
      <Card>
        <View style={styles.qtyBox}>
          <Text style={styles.qty}>
            {fmtQty(data.quantity)} <Text style={styles.unit}>{data.unit}</Text>
          </Text>
          <Text style={typography.caption}>{t('Quantity executed on {date}', { date: formatDate(data.date) })}</Text>
        </View>
        <KeyValue label={t('Activity')} value={data.activityName} />
        <KeyValue label={t('Location')} value={data.location} />
        <KeyValue label={t('Manpower')} value={data.manpowerCount === null ? null : String(data.manpowerCount)} />
        <KeyValue label={t('Machinery used')} value={data.machineryUsed} />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="PROGRESS" item={data} />
      <ReviewActions type="PROGRESS" item={data} onReviewed={setData} />
      <Button title={t('Open project')} variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qtyBox: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  qty: { fontSize: 34, fontWeight: '800', color: colors.primaryDark },
  unit: { fontSize: 18, fontWeight: '600', color: colors.primary },
});
