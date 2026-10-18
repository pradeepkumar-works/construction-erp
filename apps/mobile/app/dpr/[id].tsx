import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WEATHER_LABELS, type DailyReportDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, PhotoChecks, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

export default function DprDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<DailyReportDto>((api) => api.get(`/dpr/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`DPR · ${formatDate(data.date)}`} subtitle={t('Daily progress report')} />
      <Card title={t('Site')}>
        <KeyValue label={t('Weather')} value={data.weather ? t(WEATHER_LABELS[data.weather]) : null} />
        <KeyValue label={t('Site condition')} value={data.siteCondition} />
      </Card>
      <Card title={t('Manpower')} right={<Text style={styles.total}>{t('Total {n}', { n: data.totalManpower })}</Text>}>
        {data.manpower.length === 0 ? <Text style={typography.caption}>{t('No manpower recorded')}</Text> : data.manpower.map((m, i) => <KeyValue key={`${m.category}-${i}`} label={t(m.category)} value={String(m.count)} />)}
      </Card>
      <Card title={t('Machinery')}>
        {data.machinery.length === 0 ? <Text style={typography.caption}>{t('No machinery recorded')}</Text> : data.machinery.map((m, i) => <KeyValue key={`${m.name}-${i}`} label={m.name} value={t('{h} h', { h: m.hours })} />)}
      </Card>
      <Card title={t('Work')}>
        <Block label={t('Work executed')} value={data.workExecuted} />
        <Block label={t('Material received')} value={data.materialReceived} />
        <Block label={t('Tests conducted')} value={data.testsConducted} />
        <Block label={t('Safety observations')} value={data.safetyObservations} />
        <Block label={t('Issues / hindrances')} value={data.issues} />
        <Block label={t('Next-day plan')} value={data.nextDayPlan} />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <PhotoChecks kind="dpr" id={data.id} attachments={data.attachments} />
      <SubmitterActions type="DPR" item={data} />
      <ReviewActions type="DPR" item={data} onReviewed={setData} />
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
