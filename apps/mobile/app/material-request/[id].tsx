import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MATERIAL_PRIORITY_LABELS, type MaterialRequestDto, type MaterialRequestStockDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, Pill, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

const PRIORITY_TONE: Record<MaterialRequestDto['priority'], { fg: string; bg: string }> = {
  LOW: { fg: colors.neutral, bg: colors.neutralSoft },
  NORMAL: { fg: colors.primary, bg: colors.primarySoft },
  HIGH: { fg: colors.warning, bg: colors.warningSoft },
  URGENT: { fg: colors.danger, bg: colors.dangerSoft },
};

export default function MaterialRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<MaterialRequestDto>((api) => api.get(`/material-requests/${id}`), [id], { enabled: !!id });
  // Stock first: what this site and the others hold of each item, once the request is approved.
  const approved = data?.status === 'APPROVED';
  const stock = useFetch<MaterialRequestStockDto>((api) => api.get(`/material-requests/${id}/stock`), [id, approved], { enabled: !!id && approved });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const tone = PRIORITY_TONE[data.priority];
  const stockLine = (l: MaterialRequestStockDto['lines'][number] | undefined, covered: string | null) => {
    const parts: string[] = [];
    if (l) {
      parts.push(Number(l.here) > 0 ? t('{qty} in stock here', { qty: fmtQty(l.here) }) : t('None in stock here'));
      const elsewhere = l.others.reduce((sum, o) => sum + Number(o.balance), 0);
      if (l.others.length) parts.push(t('{qty} at {n} other sites', { qty: fmtQty(String(elsewhere)), n: l.others.length }));
    }
    if (covered) parts.push(t('{qty} from stock', { qty: fmtQty(covered) }));
    return parts.length ? <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>{parts.join(' · ')}</Text> : null;
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.requestNo} subtitle={t('Material request')} />
      <Card>
        <KeyValue label={t('Required by')} value={formatDate(data.requiredDate)} />
        <KeyValue label={t('Priority')} value={<Pill text={t(MATERIAL_PRIORITY_LABELS[data.priority])} fg={tone.fg} bg={tone.bg} />} />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Items ({n})', { n: data.items.length })}>
        {data.items.map((it, i) => (
          <View key={it.id} style={[styles.item, i === data.items.length - 1 && styles.itemLast]}>
            <View style={styles.itemBody}>
              <Text style={typography.bodyStrong}>{it.itemName}</Text>
              {it.specification ? <Text style={typography.caption}>{it.specification}</Text> : null}
              {stockLine(stock.data?.lines.find((l) => l.materialRequestItemId === it.id), Number(it.coveredQty) > 0 ? it.coveredQty : null)}
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
