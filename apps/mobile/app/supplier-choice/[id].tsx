import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { SupplierChoiceDto } from '@erp/shared';
import { rankLabel } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { formatMoney } from '../../src/utils/format';

/**
 * A supplier choice on the phone: the supplier purchase finalised on a material request, what it costs against L1 and
 * why, and every quotation as it ranks now, for the approver to decide. Purchase finalises and orders on the web.
 */
export default function SupplierChoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<SupplierChoiceDto>((api) => api.get(`/supplier-choices/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const chosen = data.split ? t('Lowest per item, split between vendors') : (data.vendorName ?? t('A quotation since deleted'));
  const above = data.l1Amount !== null ? Number(data.amount) - Number(data.l1Amount) : 0;
  const againstL1 =
    data.l1Amount === null
      ? t('No quotation priced every item')
      : above > 0
        ? t('{amount} more than L1', { amount: formatMoney(above) })
        : above < 0
          ? t('{amount} less than L1', { amount: formatMoney(-above) })
          : t('Is L1');

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.requestNo} · ${chosen}`} subtitle={data.rank ? `${t('Supplier choice')} · ${rankLabel(data.rank)}` : t('Supplier choice')} />
      {!data.current ? (
        <Card>
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('Purchase has since finalised this request again or reopened it, so this choice no longer stands.')}
          </Text>
        </Card>
      ) : null}
      <Card>
        <View style={styles.box}>
          <Text style={styles.total} maxFontSizeMultiplier={maxFontScale}>
            {formatMoney(data.amount)}
          </Text>
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('with GST and freight')}
          </Text>
        </View>
        <KeyValue label={t('Supplier')} value={chosen} />
        <KeyValue label={t('Against L1')} value={againstL1} />
        <KeyValue label={t('Still to order')} value={data.itemNames.length ? `${data.itemNames.join(', ')}${data.itemsLeft > data.itemNames.length ? '…' : ''}` : String(data.itemsLeft)} multiline />
        {data.reason ? <KeyValue label={t('Why this supplier')} value={data.reason} multiline /> : null}
      </Card>
      {data.split && data.splitVendors.length ? (
        <Card title={t('Orders in the split')}>
          {data.splitVendors.map((v) => (
            <KeyValue key={v.vendorName} label={v.vendorName} value={formatMoney(v.total)} />
          ))}
        </Card>
      ) : null}
      <Card title={t('Quotations as they rank now')}>
        {data.ranking.map((q) => (
          <KeyValue
            key={q.quotationId}
            label={`${q.rank ? rankLabel(q.rank) : t('Part quote')} · ${q.vendorName}${q.quotationId === data.quotationId ? ` (${t('chosen')})` : ''}`}
            value={formatMoney(q.total)}
          />
        ))}
      </Card>
      <ReviewActions type="SUPPLIER_CHOICE" item={data} onReviewed={setData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
});
