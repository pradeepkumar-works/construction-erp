import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WorkOrderDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

const rupees = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A subcontractor's work order on the phone: scope, rates and terms, what is measured and billed, and approval. Orders are issued on the web. */
export default function WorkOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<WorkOrderDto>((api) => api.get(`/work-orders/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const approved = data.status === 'APPROVED';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.woNo} · ${data.vendorName}`} subtitle={`${data.title} · ${formatDate(data.woDate)}`} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total}>{rupees(data.value)}</Text>
          <Text style={typography.caption}>{approved ? t(data.closedAt ? '{pct}% billed · closed' : '{pct}% billed', { pct: data.billedPct }) : t('before GST')}</Text>
        </View>
        <KeyValue label={t('PAN')} value={data.vendorPan} />
        <KeyValue label={t('MSME')} value={data.vendorMsme ? t(MSME_CATEGORY_LABELS[data.vendorMsme]) : null} />
        <KeyValue label={t('Period')} value={t('{from} to {to}', { from: data.startDate ? formatDate(data.startDate) : '-', to: data.endDate ? formatDate(data.endDate) : '-' })} />
        <KeyValue label={t('GST')} value={`${data.gstRate}%`} />
        <KeyValue label={t('Retention')} value={`${data.retentionPct}%`} />
        <KeyValue label={t('TDS (194C)')} value={`${data.tdsPct}%`} />
        {Number(data.advanceAmount) > 0 ? <KeyValue label={t('Advance')} value={t('{amount} at {pct}% a bill, {recovered} recovered', { amount: rupees(data.advanceAmount), pct: data.advanceRecoveryPct, recovered: rupees(data.advanceRecovered) })} multiline /> : null}
        <KeyValue label={t('Payment')} value={data.paymentDays !== null ? t('{n} days from the bill', { n: data.paymentDays }) : null} />
        <KeyValue label={t('Terms')} value={data.terms} multiline />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Scope ({n})', { n: data.lines.length })}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={2}>
                {l.itemNo ? `${l.itemNo} ` : ''}
                {l.description}
              </Text>
              <Text style={typography.caption}>
                {fmtQty(l.quantity)} {l.unit} @ {rupees(l.rate)}
                {approved ? ` · ${l.boqItemId ? t('{measured} measured, {billed} billed', { measured: fmtQty(l.measuredQty), billed: fmtQty(l.billedQty) }) : t('{billed} billed', { billed: fmtQty(l.billedQty) })}` : ''}
              </Text>
            </View>
            <Text style={styles.amount}>{rupees(l.amount)}</Text>
          </View>
        ))}
      </Card>
      {data.bills && data.bills.length > 0 ? (
        <Card title={t('Bills ({n})', { n: data.bills.length })}>
          {data.bills.map((b) => (
            <View key={b.id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineTitle}>{b.label}</Text>
                <Text style={typography.caption}>
                  {formatDate(b.billDate)} · {t(SUBMISSION_STATUS_LABELS[b.status]).toLowerCase()}
                </Text>
              </View>
              <Text style={styles.amount}>{rupees(b.netPayable)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="WORK_ORDER" item={data} onReviewed={setData} />
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
