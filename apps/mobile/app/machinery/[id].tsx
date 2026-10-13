import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MachineryLogDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

export default function MachineryLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<MachineryLogDto>((api) => api.get(`/machinery-logs/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const down = Number(data.breakdownHours);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.equipmentCode} · ${data.equipmentName}`} subtitle={`Machinery log · ${formatDate(data.date)}`} />
      <Card>
        <View style={styles.hours}>
          <View style={styles.hourBox}>
            <Text style={styles.big}>{fmtQty(data.hoursWorked)}</Text>
            <Text style={typography.caption}>worked (h)</Text>
          </View>
          <View style={styles.hourBox}>
            <Text style={[styles.big, styles.muted]}>{fmtQty(data.idleHours)}</Text>
            <Text style={typography.caption}>idle (h)</Text>
          </View>
          <View style={styles.hourBox}>
            <Text style={[styles.big, down > 0 && styles.danger]}>{fmtQty(data.breakdownHours)}</Text>
            <Text style={typography.caption}>breakdown (h)</Text>
          </View>
        </View>
        {data.breakdownNote ? <KeyValue label="Breakdown" value={data.breakdownNote} multiline /> : null}
        <KeyValue label="Owned / hired" value={EQUIPMENT_OWNERSHIP_LABELS[data.ownership]} />
        <KeyValue label="Hour meter" value={data.meterStart || data.meterEnd ? `${data.meterStart ?? '?'} → ${data.meterEnd ?? '?'}` : null} />
        <KeyValue label="Diesel" value={data.dieselLitres ? `${fmtQty(data.dieselLitres)} L` : null} />
        <KeyValue label="Operator" value={data.operatorName} />
        <KeyValue label="Activity" value={data.activityName} />
        <KeyValue label="Work done" value={data.workDone} multiline />
        <KeyValue label="Remarks" value={data.remarks} multiline />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="MACHINERY" item={data} />
      <ReviewActions type="MACHINERY" item={data} onReviewed={setData} />
      <Button title="Open project" variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hours: { flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: 12, paddingVertical: spacing.md, marginBottom: spacing.sm },
  hourBox: { flex: 1, alignItems: 'center' },
  big: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  muted: { color: colors.textMuted },
  danger: { color: colors.danger },
});
