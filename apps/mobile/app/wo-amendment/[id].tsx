import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { WorkOrderAmendmentDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty as formatQty, formatDate, formatMoney } from '../../src/utils/format';

/**
 * A work order amendment on the phone: the order's value after it (what the approval limit reads) and the change, why,
 * and each line it changes before and after, for the approver to decide. It is raised and edited on the web.
 */
export default function WoAmendmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<WorkOrderAmendmentDto>((api) => api.get(`/work-order-amendments/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const changed = data.lines.filter((l) => l.changed);
  const change = Number(data.change);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.label} · ${data.vendorName}`} subtitle={t('Work order amendment')} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total} maxFontSizeMultiplier={maxFontScale}>
            {formatMoney(data.valueAfter)}
          </Text>
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {change >= 0 ? t('{amount} more than now, before GST', { amount: formatMoney(change) }) : t('{amount} less than now, before GST', { amount: formatMoney(-change) })}
          </Text>
        </View>
        <KeyValue label={t('Work order')} value={`${data.woNo} · ${data.woTitle}`} multiline />
        <KeyValue label={t('Why')} value={data.reason || '-'} multiline />
        <KeyValue label={t('Value now')} value={formatMoney(data.valueBefore)} />
        {data.endDate && data.endDate !== data.endDateBefore ? (
          <KeyValue label={t('End date')} value={t('{from} to {to}', { from: data.endDateBefore ? formatDate(data.endDateBefore) : '-', to: formatDate(data.endDate) })} />
        ) : null}
      </Card>
      <Card title={t('What changes')}>
        {changed.length ? (
          changed.map((l) => (
            <KeyValue
              key={l.id}
              label={l.description}
              value={
                l.isNew
                  ? t('New: {qty} {unit} at {rate}', { qty: formatQty(l.quantity), unit: l.unit, rate: formatMoney(l.rate) })
                  : t('{from} to {to}', { from: `${formatQty(l.qtyBefore ?? '0')} ${l.unit} @ ${formatMoney(l.rateBefore ?? '0')}`, to: `${formatQty(l.quantity)} ${l.unit} @ ${formatMoney(l.rate)}` })
              }
              multiline
            />
          ))
        ) : (
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('Only the end date changes')}
          </Text>
        )}
      </Card>
      <ReviewActions type="WO_AMENDMENT" item={data} onReviewed={setData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
});
