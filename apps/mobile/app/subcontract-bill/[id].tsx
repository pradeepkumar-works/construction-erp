import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SubcontractBillDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { useT } from '../../src/i18n/LanguageContext';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, fontSize, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, formatMoney } from '../../src/utils/format';

const rupees = (v: string | number) => formatMoney(v);

/** A subcontractor's bill on the phone: work as measured, the recoveries, the net payable, and approval. Bills are prepared on the web. */
export default function SubcontractBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<SubcontractBillDto>((api) => api.get(`/subcontract-bills/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const excess = data.lines.filter((l) => Number(l.excessQty) > 0);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.label} · ${data.vendorName}`} subtitle={`${data.woTitle} · ${t('measured up to {date}', { date: formatDate(data.measuredUpTo) })}`} />
      <Card>
        <View style={styles.box}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.total}>{rupees(data.netPayable)}</Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('net payable, due {date}', { date: formatDate(data.dueDate) })}</Text>
        </View>
        {excess.length > 0 ? (
          <View style={styles.warn}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.warnText}>
              {t('Billed beyond the work order: {items}', {
                items: excess.map((l) => t('{item} {upto} of {ordered} {unit}', { item: l.itemNo ?? l.description, upto: fmtQty(l.uptoQty), ordered: fmtQty(l.woQty), unit: l.unit })).join(', '),
              })}
            </Text>
          </View>
        ) : null}
        <KeyValue label={t('Work in this bill')} value={rupees(data.grossAmount)} />
        <KeyValue label={t('GST {rate}%', { rate: data.gstRate })} value={rupees(data.gstAmount)} />
        {data.deductions
          .filter((d) => Number(d.amount) > 0)
          .map((d) => (
            <KeyValue key={d.key} label={d.pct ? t('Less {label} @ {pct}%', { label: t(d.label), pct: d.pct }) : t('Less {label}', { label: t(d.label) })} value={`(${rupees(d.amount)})`} />
          ))}
        <KeyValue label={t('Their invoice')} value={data.invoiceNo} />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Work')} count={data.lines.length}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.lineTitle} numberOfLines={2}>
                {l.itemNo ? `${l.itemNo} ` : ''}
                {l.description}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                {fmtQty(l.thisQty)} {l.unit} @ {rupees(l.rate)} · {t('{qty} to date', { qty: fmtQty(l.uptoQty) })}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.amount}>{rupees(l.amount)}</Text>
          </View>
        ))}
      </Card>
      {data.materials.length > 0 ? (
        <Card title={t('Material issued to them')}>
          {data.materials.map((m) => (
            <View key={m.itemId} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.lineTitle}>{m.itemName}</Text>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                  {fmtQty(m.quantity)} {m.unit} @ {rupees(m.rate)}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.amount}>{rupees(m.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="SUBCONTRACT_BILL" item={data} onReviewed={setData} />
      <Button title={t('Open work order')} variant="ghost" icon="hammer-outline" onPress={() => router.push(`/work-order/${data.workOrderId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  warn: { padding: spacing.sm, borderRadius: 10, marginBottom: spacing.sm, backgroundColor: colors.dangerSoft },
  warnText: { fontSize: fontSize.secondary, color: colors.danger },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  amount: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginLeft: spacing.md },
});
