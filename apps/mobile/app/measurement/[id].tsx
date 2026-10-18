import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MeasurementSheetDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, fontSize, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, formatMoney } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

const rupees = (v: string) => formatMoney(v, { paise: false });
const factors = (l: MeasurementSheetDto['lines'][number]) => [l.nos, l.length, l.breadth, l.depth].filter((v) => v !== null).map((v) => fmtQty(v as string)).join(' × ');

export default function MeasurementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<MeasurementSheetDto>((api) => api.get(`/measurements/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.boqItemNo} · ${data.boqDescription}`} subtitle={`${data.mbNo} · ${formatDate(data.date)}`} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total}>
            {fmtQty(data.totalQty)} {data.unit}
          </Text>
          <Text style={typography.caption}>
            {t('{amount} at {rate} / {unit}', { amount: rupees(data.amount), rate: rupees(data.rate), unit: data.unit })}
          </Text>
        </View>
        <KeyValue label={t('Location')} value={data.location} />
        {data.woNo ? <KeyValue label={t('Done by')} value={`${data.contractorName ?? ''} (${data.woNo})`} /> : null}
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Measurements ({n})', { n: data.lines.length })}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle}>
                {l.description}
                {l.deduct ? <Text style={{ color: colors.danger }}> · {t('deduct')}</Text> : null}
              </Text>
              <Text style={typography.caption}>{factors(l)}</Text>
            </View>
            <Text style={[styles.qty, l.deduct && { color: colors.danger }]}>{fmtQty(l.quantity)}</Text>
          </View>
        ))}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="MEASUREMENT" item={data} />
      <ReviewActions type="MEASUREMENT" item={data} onReviewed={setData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 30, fontWeight: '800', color: colors.primaryDark },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  qty: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginLeft: spacing.md },
});
