import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { PaymentRequestDto } from '@erp/shared';
import { FUND_PURPOSE_LABELS, PAYMENT_MODE_LABELS, PAYMENT_REQUEST_KIND_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { formatDate, formatMoney } from '../../src/utils/format';

/** Where the request's bill or order opens on the phone. */
const targetPath = (r: PaymentRequestDto) =>
  r.vendorBillId ? `/vendor-bill/${r.vendorBillId}` : r.subcontractBillId ? `/subcontract-bill/${r.subcontractBillId}` : r.purchaseOrderId ? `/purchase-order/${r.purchaseOrderId}` : `/work-order/${r.workOrderId}`;

/**
 * A payment request (v5 item 90) on the phone: what is to be paid and why, and approval; a site's fund request (v6 item
 * 107) shows what the money is for and where it goes. Requests are raised on the web.
 */
export default function PaymentRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<PaymentRequestDto>((api) => api.get(`/payment-requests/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const bill = data.kind === 'BILL';
  const fund = data.kind === 'FUND_REQUEST';
  const payee = data.vendorName ? (fund ? t('{name}, on account', { name: data.vendorName }) : data.vendorName) : t("{name}'s imprest", { name: data.imprestHolderName ?? '' });

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader
        item={data}
        title={`${data.requestNo} · ${payee}`}
        subtitle={`${t(PAYMENT_REQUEST_KIND_LABELS[data.kind])} · ${fund && data.purpose ? t(FUND_PURPOSE_LABELS[data.purpose]) : data.targetLabel}`}
      />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total} maxFontSizeMultiplier={maxFontScale}>
            {formatMoney(data.amount)}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{data.neededBy ? t('Needed by {date}', { date: formatDate(data.neededBy) }) : t('To pay')}</Text>
        </View>
        {fund ? (
          <>
            <KeyValue label={t('Goes to')} value={payee} />
            {data.raisedAtProjectName ? <KeyValue label={t('Asked from')} value={data.raisedAtProjectName} /> : null}
          </>
        ) : (
          <>
            <KeyValue label={bill ? t('Bill') : t('Order')} value={data.targetLabel} />
            <KeyValue label={bill ? t('Bill payable') : t('Order value')} value={formatMoney(data.targetValue)} />
          </>
        )}
        {data.dueDate ? <KeyValue label={t('Bill due')} value={formatDate(data.dueDate)} /> : null}
        {data.targetOpen !== null && data.status !== 'APPROVED' ? <KeyValue label={t('Most it may ask')} value={formatMoney(data.targetOpen)} /> : null}
        <KeyValue label={t('Payment mode')} value={t(PAYMENT_MODE_LABELS[data.mode])} />
        {data.status === 'APPROVED' ? <KeyValue label={fund && data.imprestId ? t('Released') : t('Paid')} value={data.paidDate ? t('{amount} on {date}', { amount: formatMoney(data.paidAmount), date: formatDate(data.paidDate) }) : formatMoney(data.paidAmount)} /> : null}
        <KeyValue label={t('Reason')} value={data.reason} multiline />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="PAYMENT_REQUEST" item={data} onReviewed={setData} />
      {fund ? (
        data.imprestId ? <Button title={t('Open imprest')} variant="ghost" icon="wallet-outline" onPress={() => router.push({ pathname: '/imprest', params: { id: data.imprestId } })} /> : null
      ) : (
        <Button title={bill ? t('Open bill') : t('Open order')} variant="ghost" icon="document-text-outline" onPress={() => router.push(targetPath(data))} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
});
