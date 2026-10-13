import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WEATHER_LABELS, type DailyReportDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';

export default function DprDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<DailyReportDto>((api) => api.get(`/dpr/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`DPR · ${formatDate(data.date)}`} subtitle="Daily progress report" />
      <Card title="Site">
        <KeyValue label="Weather" value={data.weather ? WEATHER_LABELS[data.weather] : null} />
        <KeyValue label="Site condition" value={data.siteCondition} />
      </Card>
      <Card title="Manpower" right={<Text style={styles.total}>Total {data.totalManpower}</Text>}>
        {data.manpower.length === 0 ? <Text style={typography.caption}>No manpower recorded</Text> : data.manpower.map((m, i) => <KeyValue key={`${m.category}-${i}`} label={m.category} value={String(m.count)} />)}
      </Card>
      <Card title="Machinery">
        {data.machinery.length === 0 ? <Text style={typography.caption}>No machinery recorded</Text> : data.machinery.map((m, i) => <KeyValue key={`${m.name}-${i}`} label={m.name} value={`${m.hours} h`} />)}
      </Card>
      <Card title="Work">
        <Block label="Work executed" value={data.workExecuted} />
        <Block label="Material received" value={data.materialReceived} />
        <Block label="Tests conducted" value={data.testsConducted} />
        <Block label="Safety observations" value={data.safetyObservations} />
        <Block label="Issues / hindrances" value={data.issues} />
        <Block label="Next-day plan" value={data.nextDayPlan} />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="DPR" item={data} />
      <ReviewActions type="DPR" item={data} onReviewed={setData} />
      <Button title="Open project" variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.block}>
      <Text style={typography.label}>{label}</Text>
      <Text style={[typography.body, !value && styles.muted]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  total: { ...typography.bodyStrong, color: colors.primary },
  block: { marginBottom: spacing.md, gap: 2 },
  muted: { color: colors.textMuted },
});
