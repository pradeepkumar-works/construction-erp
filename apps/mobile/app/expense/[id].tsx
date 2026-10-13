import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ExpenseDto } from '@erp/shared';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_MODE_LABELS } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Button, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';

const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<ExpenseDto>((api) => api.get(`/expenses/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.description} subtitle={`${data.expenseNo} · ${formatDate(data.date)}`} />
      <Card>
        <View style={styles.box}>
          <Text style={styles.total}>{rupees(data.totalAmount)}</Text>
          <Text style={typography.caption}>
            {rupees(data.amount)} + GST {Number(data.gstRate)}% {rupees(data.gstAmount)}
          </Text>
        </View>
        <KeyValue label="Category" value={EXPENSE_CATEGORY_LABELS[data.category]} />
        <KeyValue label="Paid by" value={PAYMENT_MODE_LABELS[data.paymentMode]} />
        <KeyValue label="Vendor" value={data.vendor} />
        <KeyValue label="Vendor GSTIN" value={data.vendorGstin} />
        <KeyValue label="Bill no." value={data.billNo} />
        <KeyValue label="Activity" value={data.activityName} />
        <KeyValue label="Remarks" value={data.remarks} multiline />
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="EXPENSE" item={data} />
      <ReviewActions type="EXPENSE" item={data} onReviewed={setData} />
      <Button title="Open project" variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: 12 },
  total: { fontSize: 32, fontWeight: '800', color: colors.primaryDark },
});
