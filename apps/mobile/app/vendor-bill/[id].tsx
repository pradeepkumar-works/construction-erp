import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { VendorBillDto } from '@erp/shared';
import { VENDOR_BILL_KIND_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, fontSize, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, formatMoney } from '../../src/utils/format';

const rupees = (v: string) => formatMoney(v);

/**
 * A vendor's invoice on the phone: the match against its PO and GRNs (or, for a hire, workshop or other bill, its own
 * checks), and approval. Bills are entered on the web.
 */
export default function VendorBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<VendorBillDto>((api) => api.get(`/vendor-bills/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const withPo = !!data.purchaseOrderId;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.billNo} · ${data.vendorName}`} subtitle={t('Invoice {invoice} of {date} · {po}', { invoice: data.invoiceNo, date: formatDate(data.invoiceDate), po: data.poNo ?? t(VENDOR_BILL_KIND_LABELS[data.kind]) })} />
      <Card>
        <View style={styles.box}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.total}>{rupees(data.total)}</Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('due {date}', { date: formatDate(data.dueDate) })}</Text>
        </View>
        <View style={[styles.match, { backgroundColor: data.matched ? colors.successSoft : colors.dangerSoft }]}>
          <Ionicons name={data.matched ? 'checkmark-circle' : 'alert-circle'} size={18} color={data.matched ? colors.success : colors.danger} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={maxFontScale} style={[styles.matchTitle, { color: data.matched ? colors.success : colors.danger }]}>{data.matched ? (withPo ? t('Matches the PO and what was received') : t('No exceptions')) : withPo ? t('Does not match') : t('Has exceptions')}</Text>
            {data.exceptions.map((e) => (
              <Text maxFontSizeMultiplier={maxFontScale} key={e} style={styles.exception}>
                {e}
              </Text>
            ))}
          </View>
        </View>
        <KeyValue label={t('Before GST')} value={rupees(data.subtotal)} />
        <KeyValue label={t('GST')} value={rupees(data.gstAmount)} />
        {Number(data.freight) > 0 ? <KeyValue label={t('Freight')} value={rupees(data.freight)} /> : null}
        {data.equipmentCode ? <KeyValue label={t('Machine')} value={`${data.equipmentCode} · ${data.equipmentName ?? ''}`} /> : null}
        {Number(data.fuelRecovery) > 0 ? (
          <KeyValue label={t('Diesel recovered')} value={t('{amount} for {litres} L', { amount: rupees(data.fuelRecovery), litres: fmtQty(data.fuelLitres) })} />
        ) : null}
        {Number(data.debitNoteAmount) > 0 ? <KeyValue label={t('Debit notes')} value={rupees(data.debitNoteAmount)} /> : null}
        <KeyValue label={t('Payable')} value={rupees(data.payable)} />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Items ({n})', { n: data.lines.length })}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.lineTitle} numberOfLines={2}>
                {l.itemName}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                {fmtQty(l.quantity)} {l.unit} @ {rupees(l.rate)}
                {l.poRate !== null ? ` (PO ${rupees(l.poRate)}) · ${t('{qty} received', { qty: fmtQty(l.receivedQty ?? '0') })}` : ''}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.amount}>{rupees(l.amount)}</Text>
          </View>
        ))}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="VENDOR_BILL" item={data} onReviewed={setData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  match: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: 10, marginBottom: spacing.sm },
  matchTitle: { fontSize: fontSize.secondary, fontWeight: '700' },
  exception: { fontSize: fontSize.secondary, color: colors.text, marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  amount: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginLeft: spacing.md },
});
