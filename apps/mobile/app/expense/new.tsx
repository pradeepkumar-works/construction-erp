import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ExpenseCategory, ExpenseDto, PaymentMode } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GSTIN_PATTERN, GST_RATES, PAYMENT_MODES, PAYMENT_MODE_LABELS, gstFor } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, radius, spacing, typography } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';

const MONEY = /^\d+(\.\d{1,2})?$/;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** File a site expense with the bill photo (works offline through the outbox), or (with `editId`) fix and resubmit one. */
export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const api = useApi();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();
  const existing = useFetch<ExpenseDto>((a) => a.get(`/expenses/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [gstin, setGstin] = useState('');
  const [billNo, setBillNo] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState<string>('0');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ExpenseDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setProjectId(e.projectId);
    setDate(e.date);
    setCategory(e.category);
    setDescription(e.description);
    setVendor(e.vendor ?? '');
    setGstin(e.vendorGstin ?? '');
    setBillNo(e.billNo ?? '');
    setAmount(e.amount);
    setGstRate(String(Number(e.gstRate)));
    setPaymentMode(e.paymentMode);
    setActivityId(e.activityId);
    setRemarks(e.remarks ?? '');
    setPhotos(attachmentsToPhotos(e.attachments));
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(() => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name })), [activities.data]);
  const categoryOptions = useMemo<SelectOption<ExpenseCategory>[]>(() => EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] })), []);
  const gst = MONEY.test(amount.trim()) ? gstFor(amount, gstRate) : 0;
  const total = (MONEY.test(amount.trim()) ? Number(amount) : 0) + gst;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!category) e.category = 'Choose a category';
    if (!isIsoDate(date)) e.date = 'Enter a valid date';
    if (!description.trim()) e.description = 'Say what it was for';
    if (!MONEY.test(amount.trim()) || Number(amount) <= 0) e.amount = 'Enter the amount before GST, e.g. 2400 or 2400.50';
    if (gstin.trim() && !GSTIN_PATTERN.test(gstin.trim().toUpperCase())) e.gstin = 'Not a valid 15-character GSTIN';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    else if (editId && photosQueued(photos)) e.photos = 'Photos need a connection to upload before resubmitting';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const blank = editId ? null : undefined;
      const t = (v: string) => v.trim() || blank;
      const body = {
        date,
        category,
        description: description.trim(),
        vendor: t(vendor),
        vendorGstin: t(gstin.toUpperCase()),
        billNo: t(billNo),
        amount: amount.trim(),
        gstRate,
        paymentMode,
        activityId: activityId ?? blank,
        remarks: t(remarks),
      };
      if (editId) {
        setCreated(await api.patch<ExpenseDto>(`/expenses/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(
          await enqueue({
            type: 'EXPENSE',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${rupees(total)} · ${description.trim()}`,
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<ExpenseDto>('/expenses', { projectId, ...body, attachmentIds: attachmentIds(photos) }));
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        await queueIt();
      }
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCreated(null);
    setQueued(null);
    setDescription('');
    setVendor('');
    setGstin('');
    setBillNo('');
    setAmount('');
    setGstRate('0');
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? 'Expense resubmitted' : 'Expense submitted'}
        subtitle={`${created.expenseNo}: ${rupees(Number(created.totalAmount))} for ${created.description}. Sent for approval.`}
        detailHref={`/expense/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? 'Edit Expense' : 'New Site Expense' }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} disabled={!!editId} />
        <Select label="Category" required value={category} options={categoryOptions} onChange={setCategory} placeholder="Choose category" error={errors.category} />
        <Input label="What was it for" required value={description} onChangeText={setDescription} placeholder="e.g. Hydraulic hose for grader" error={errors.description} />
        <DatePicker label="Bill date" required value={date} onChange={setDate} error={errors.date} />
      </Card>
      <Card title="Amount">
        <Input label="Amount before GST (₹)" required value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 2400" error={errors.amount} style={styles.bigInput} />
        <Chips label="GST rate" value={gstRate} onChange={(v) => setGstRate(v ?? '0')} clearable={false} options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))} />
        <View style={styles.totalBox}>
          <Text style={typography.caption}>GST {rupees(gst)}</Text>
          <Text style={styles.total}>{rupees(total)}</Text>
        </View>
        <Chips label="Paid by" value={paymentMode} onChange={(v) => setPaymentMode(v ?? 'CASH')} clearable={false} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m].replace(/ \(.*\)$/, '') }))} />
      </Card>
      <Card title="Bill photo">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
        {!photos.length ? <Text style={typography.caption}>Take a photo of the bill; the PM may send it back without one.</Text> : null}
      </Card>
      <Card title="Bill details (optional)">
        <Input label="Vendor" value={vendor} onChangeText={setVendor} />
        <Input label="Vendor GSTIN" value={gstin} onChangeText={setGstin} autoCapitalize="characters" maxLength={15} error={errors.gstin} />
        <Input label="Bill no." value={billNo} onChangeText={setBillNo} />
        <Select label="Activity" value={activityId} options={activityOptions} onChange={setActivityId} placeholder={projectId ? 'Choose activity' : 'Choose a project first'} disabled={!projectId} emptyText="No activities in this project" />
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} multiline />
      </Card>
      <Button title={editId ? 'Resubmit for approval' : 'Submit for approval'} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigInput: { fontSize: 22, fontWeight: '700' },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg },
  total: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
