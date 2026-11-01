import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { PurchaseOrderDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canViewCost } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthContext';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { OrderBudget, OrderQuotes } from '../../src/components/OrderDecision';
import { colors, fontSize, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, formatMoney } from '../../src/utils/format';

const rupees = (v: string) => formatMoney(v);

/** A purchase order on the phone: read it and approve it. Orders are raised on the web. */
export default function PurchaseOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<PurchaseOrderDto>((api) => api.get(`/purchase-orders/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.poNo} · ${data.vendorName}`} subtitle={`${formatDate(data.poDate)}${data.requestNo ? ` · ${t('for {request}', { request: data.requestNo })}` : ''}`} />
      <Card>
        <View style={styles.box}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.total}>{rupees(data.total)}</Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('order total with GST and freight')}</Text>
        </View>
        <KeyValue label={t('Vendor')} value={data.vendorName} />
        <KeyValue label={t('GSTIN')} value={data.vendorGstin} />
        {data.vendorMsme ? <KeyValue label={t('MSME')} value={t(MSME_CATEGORY_LABELS[data.vendorMsme])} /> : null}
        <KeyValue label={t('Before GST')} value={rupees(data.subtotal)} />
        <KeyValue label={t('GST')} value={rupees(data.gstAmount)} />
        {Number(data.freight) > 0 ? <KeyValue label={t('Freight')} value={rupees(data.freight)} /> : null}
        <KeyValue label={t('Deliver by')} value={data.deliveryBy ? formatDate(data.deliveryBy) : null} />
        <KeyValue label={t('Payment')} value={data.paymentTerms ?? (data.paymentDays !== null ? t('{n} days from invoice', { n: data.paymentDays }) : null)} />
        {data.status === 'APPROVED' ? <KeyValue label={t('Received')} value={data.closedAt ? t('{pct}% (closed)', { pct: data.receivedPct }) : `${data.receivedPct}%`} /> : null}
        {data.selectionReason ? <KeyValue label={t('Why this vendor')} value={data.selectionReason} multiline /> : null}
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Items')} count={data.lines.length}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.lineTitle} numberOfLines={2}>
                {l.itemName}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                {fmtQty(l.quantity)} {l.unit} @ {rupees(l.rate)} + {l.gstRate}% GST
                {Number(l.receivedQty) > 0 ? ` · ${t('{qty} received', { qty: fmtQty(l.receivedQty) })}` : ''}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.amount}>{rupees(l.amount)}</Text>
          </View>
        ))}
      </Card>
      <OrderQuotes order={data} />
      {user && canViewCost(user.roleKey) ? <OrderBudget order={data} /> : null}
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="PURCHASE_ORDER" item={data} onReviewed={setData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  amount: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginLeft: spacing.md },
});
