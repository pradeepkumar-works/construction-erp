import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { RaBillDto } from '@erp/shared';
import { BILL_STAGE_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** An RA bill on the phone: read it and approve it. Bills are prepared and sent from the web. */
export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<RaBillDto>((api) => api.get(`/ra-bills/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.billLabel} subtitle={t('{date} · measurements up to {upto}', { date: formatDate(data.billDate), upto: formatDate(data.measuredUpTo) })} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total}>{rupees(data.netPayable)}</Text>
          <Text style={typography.caption}>{t('net payable')}</Text>
        </View>
        <KeyValue label={t('Client')} value={data.clientName} />
        <KeyValue label={t('Work in this bill')} value={rupees(data.grossAmount)} />
        <KeyValue label={t('Work up to date')} value={rupees(data.grossUpto)} />
        {data.pvLines?.length ? <KeyValue label={t('Price variation')} value={rupees(data.pvAmount)} /> : null}
        <KeyValue label={t('GST @ {rate}%', { rate: data.gstRate })} value={rupees(data.gstAmount)} />
        {data.deductions.map((d) => (
          <KeyValue key={d.key} label={d.pct !== null ? t('{label} @ {pct}%', { label: t(d.label), pct: d.pct }) : t(d.label)} value={`- ${rupees(d.amount)}`} />
        ))}
        {data.status === 'APPROVED' ? <KeyValue label={t('With client')} value={t(BILL_STAGE_LABELS[data.stage])} /> : null}
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Abstract ({n} items)', { n: data.items.length })}>
        {data.items.map((i) => (
          <View key={i.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={2}>
                {i.itemNo} · {i.description}
              </Text>
              <Text style={typography.caption}>
                {t('{qty} {unit} this bill · {upto} up to date', { qty: fmtQty(i.thisQty), unit: i.unit, upto: fmtQty(i.uptoQty) })}
                {Number(i.excessQty) > 0 ? <Text style={{ color: colors.danger }}> · {t('{qty} over BOQ', { qty: fmtQty(i.excessQty) })}</Text> : null}
              </Text>
            </View>
            <Text style={styles.amount}>{rupees(i.amount)}</Text>
          </View>
        ))}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="BILL" item={data} onReviewed={setData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, marginLeft: spacing.md },
});
