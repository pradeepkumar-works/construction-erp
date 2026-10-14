import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WorkOrderDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

const rupees = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A subcontractor's work order on the phone: scope, rates and terms, what is measured and billed, and approval. Orders are issued on the web. */
export default function WorkOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
          <Text style={typography.caption}>{approved ? `${data.billedPct}% billed${data.closedAt ? ' · closed' : ''}` : 'before GST'}</Text>
        </View>
        <KeyValue label="PAN" value={data.vendorPan} />
        <KeyValue label="MSME" value={data.vendorMsme ? MSME_CATEGORY_LABELS[data.vendorMsme] : null} />
        <KeyValue label="Period" value={`${data.startDate ? formatDate(data.startDate) : '-'} to ${data.endDate ? formatDate(data.endDate) : '-'}`} />
        <KeyValue label="GST" value={`${data.gstRate}%`} />
        <KeyValue label="Retention" value={`${data.retentionPct}%`} />
        <KeyValue label="TDS (194C)" value={`${data.tdsPct}%`} />
        {Number(data.advanceAmount) > 0 ? <KeyValue label="Advance" value={`${rupees(data.advanceAmount)} at ${data.advanceRecoveryPct}% a bill, ${rupees(data.advanceRecovered)} recovered`} multiline /> : null}
        <KeyValue label="Payment" value={data.paymentDays !== null ? `${data.paymentDays} days from the bill` : null} />
        <KeyValue label="Terms" value={data.terms} multiline />
        <KeyValue label="Remarks" value={data.remarks} multiline />
      </Card>
      <Card title={`Scope (${data.lines.length})`}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={2}>
                {l.itemNo ? `${l.itemNo} ` : ''}
                {l.description}
              </Text>
              <Text style={typography.caption}>
                {fmtQty(l.quantity)} {l.unit} @ {rupees(l.rate)}
                {approved ? ` · ${l.boqItemId ? `${fmtQty(l.measuredQty)} measured, ` : ''}${fmtQty(l.billedQty)} billed` : ''}
              </Text>
            </View>
            <Text style={styles.amount}>{rupees(l.amount)}</Text>
          </View>
        ))}
      </Card>
      {data.bills && data.bills.length > 0 ? (
        <Card title={`Bills (${data.bills.length})`}>
          {data.bills.map((b) => (
            <View key={b.id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineTitle}>{b.label}</Text>
                <Text style={typography.caption}>
                  {formatDate(b.billDate)} · {b.status.replace('_', ' ').toLowerCase()}
                </Text>
              </View>
              <Text style={styles.amount}>{rupees(b.netPayable)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="WORK_ORDER" item={data} onReviewed={setData} />
      <Button title="Open project" variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
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
