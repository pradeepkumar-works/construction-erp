import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MATERIAL_PRIORITY_LABELS, type MaterialRequestDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, Pill, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

const PRIORITY_TONE: Record<MaterialRequestDto['priority'], { fg: string; bg: string }> = {
  LOW: { fg: colors.neutral, bg: colors.neutralSoft },
  NORMAL: { fg: colors.primary, bg: colors.primarySoft },
  HIGH: { fg: colors.warning, bg: colors.warningSoft },
  URGENT: { fg: colors.danger, bg: colors.dangerSoft },
};

export default function MaterialRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<MaterialRequestDto>((api) => api.get(`/material-requests/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const tone = PRIORITY_TONE[data.priority];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.requestNo} subtitle="Material request" />
      <Card>
        <KeyValue label="Required by" value={formatDate(data.requiredDate)} />
        <KeyValue label="Priority" value={<Pill text={MATERIAL_PRIORITY_LABELS[data.priority]} fg={tone.fg} bg={tone.bg} />} />
        <KeyValue label="Remarks" value={data.remarks} multiline />
      </Card>
      <Card title={`Items (${data.items.length})`}>
        {data.items.map((it, i) => (
          <View key={it.id} style={[styles.item, i === data.items.length - 1 && styles.itemLast]}>
            <View style={styles.itemBody}>
              <Text style={typography.bodyStrong}>{it.itemName}</Text>
              {it.specification ? <Text style={typography.caption}>{it.specification}</Text> : null}
            </View>
            <Text style={styles.qty}>
              {fmtQty(it.quantity)} <Text style={styles.unit}>{it.unit}</Text>
            </Text>
          </View>
        ))}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="MATERIAL_REQUEST" item={data} />
      <ReviewActions type="MATERIAL_REQUEST" item={data} onReviewed={setData} />
      <Button title="Open project" variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  itemLast: { borderBottomWidth: 0 },
  itemBody: { flex: 1, marginRight: spacing.md },
  qty: { ...typography.h3, color: colors.primaryDark },
  unit: { ...typography.caption, fontWeight: '600' },
});
