import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { PurchaseOrderDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate } from '../../src/utils/format';

const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A purchase order on the phone: read it and approve it. Orders are raised on the web. */
export default function PurchaseOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<PurchaseOrderDto>((api) => api.get(`/purchase-orders/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`${data.poNo} · ${data.vendorName}`} subtitle={`${formatDate(data.poDate)}${data.requestNo ? ` · for ${data.requestNo}` : ''}`} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total}>{rupees(data.total)}</Text>
          <Text style={typography.caption}>order total with GST and freight</Text>
        </View>
        <KeyValue label="Vendor" value={data.vendorName} />
        <KeyValue label="GSTIN" value={data.vendorGstin} />
        {data.vendorMsme ? <KeyValue label="MSME" value={MSME_CATEGORY_LABELS[data.vendorMsme]} /> : null}
        <KeyValue label="Before GST" value={rupees(data.subtotal)} />
        <KeyValue label="GST" value={rupees(data.gstAmount)} />
        {Number(data.freight) > 0 ? <KeyValue label="Freight" value={rupees(data.freight)} /> : null}
        <KeyValue label="Deliver by" value={data.deliveryBy ? formatDate(data.deliveryBy) : null} />
        <KeyValue label="Payment" value={data.paymentTerms ?? (data.paymentDays !== null ? `${data.paymentDays} days from invoice` : null)} />
        {data.status === 'APPROVED' ? <KeyValue label="Received" value={data.closedAt ? `${data.receivedPct}% (closed)` : `${data.receivedPct}%`} /> : null}
        <KeyValue label="Remarks" value={data.remarks} multiline />
      </Card>
      <Card title={`Items (${data.lines.length})`}>
        {data.lines.map((l) => (
          <View key={l.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={2}>
                {l.itemName}
              </Text>
              <Text style={typography.caption}>
                {fmtQty(l.quantity)} {l.unit} @ {rupees(l.rate)} + {l.gstRate}% GST
                {Number(l.receivedQty) > 0 ? ` · ${fmtQty(l.receivedQty)} received` : ''}
              </Text>
            </View>
            <Text style={styles.amount}>{rupees(l.amount)}</Text>
          </View>
        ))}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <ReviewActions type="PURCHASE_ORDER" item={data} onReviewed={setData} />
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
