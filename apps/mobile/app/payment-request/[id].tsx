import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { PaymentRequestDto } from '@erp/shared';
import { PAYMENT_MODE_LABELS, PAYMENT_REQUEST_KIND_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { formatDate, formatMoney } from '../../src/utils/format';

/** Where the request's bill or order opens on the phone. */
const targetPath = (r: PaymentRequestDto) =>
  r.vendorBillId ? `/vendor-bill/${r.vendorBillId}` : r.subcontractBillId ? `/subcontract-bill/${r.subcontractBillId}` : r.purchaseOrderId ? `/purchase-order/${r.purchaseOrderId}` : `/work-order/${r.workOrderId}`;

/** A payment request (v5 item 90) on the phone: what is to be paid and why, and approval. Requests are raised on the web. */
export default function PaymentRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<PaymentRequestDto>((api) => api.get(`/payment-requests/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const bill = data.kind === 'BILL';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.requestNo} · ${data.vendorName}`} subtitle={`${t(PAYMENT_REQUEST_KIND_LABELS[data.kind])} · ${data.targetLabel}`} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total} maxFontSizeMultiplier={maxFontScale}>
            {formatMoney(data.amount)}
          </Text>
          <Text style={typography.caption}>{data.neededBy ? t('to pay by {date}', { date: formatDate(data.neededBy) }) : t('to pay')}</Text>
        </View>
        <KeyValue label={bill ? t('Bill') : t('Order')} value={data.targetLabel} />
        <KeyValue label={bill ? t('Bill payable') : t('Order value')} value={formatMoney(data.targetValue)} />
        {data.dueDate ? <KeyValue label={t('Bill due')} value={formatDate(data.dueDate)} /> : null}
        {data.targetOpen !== null && data.status !== 'APPROVED' ? <KeyValue label={t('Most it may ask')} value={formatMoney(data.targetOpen)} /> : null}
        <KeyValue label={t('Pay by')} value={t(PAYMENT_MODE_LABELS[data.mode])} />
        {data.status === 'APPROVED' ? <KeyValue label={t('Paid')} value={data.paidDate ? t('{amount} on {date}', { amount: formatMoney(data.paidAmount), date: formatDate(data.paidDate) }) : formatMoney(data.paidAmount)} /> : null}
        <KeyValue label={t('Reason')} value={data.reason} multiline />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="PAYMENT_REQUEST" item={data} onReviewed={setData} />
      <Button title={bill ? t('Open bill') : t('Open order')} variant="ghost" icon="document-text-outline" onPress={() => router.push(targetPath(data))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
});
