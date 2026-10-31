import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ExpenseCategory, ExpenseDto, PaymentMode } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GSTIN_PATTERN, GST_RATES, PAYMENT_MODES, PAYMENT_MODE_LABELS, gstFor } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, maxFontScale, radius, spacing, typography } from '../../src/theme';
import { formatDate, formatMoney, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

const MONEY = /^\d+(\.\d{1,2})?$/;
const rupees = (n: number) => formatMoney(n);

/** File a site expense with the bill photo (works offline through the outbox), or (with `editId`) fix and resubmit one. */
export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const api = useApi();
  const { online, enqueue, newId } = useOffline();
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice
  // (a new one for each entry made with Submit another).
  const clientId = useRef(newId());
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

  const draft = useFormDraft(editId ? null : 'expense', { projectId, date, category, description, vendor, gstin, billNo, amount, gstRate, paymentMode, activityId, remarks, photos }, (d) => {
    setProjectId(d.projectId);
    setDate(d.date);
    setCategory(d.category);
    setDescription(d.description);
    setVendor(d.vendor);
    setGstin(d.gstin);
    setBillNo(d.billNo);
    setAmount(d.amount);
    setGstRate(d.gstRate);
    setPaymentMode(d.paymentMode);
    setActivityId(d.activityId);
    setRemarks(d.remarks);
    setPhotos(restorePhotos(d.photos));
  });
  useLeaveGuard(draft, { keepsDraft: !editId, busy });

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [editId, projects.options, projectId, draft]);

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
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(() => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name })), [activities.data]);
  const categoryOptions = useMemo<SelectOption<ExpenseCategory>[]>(() => EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(EXPENSE_CATEGORY_LABELS[c]) })), [t]);
  const gst = MONEY.test(amount.trim()) ? gstFor(amount, gstRate) : 0;
  const total = (MONEY.test(amount.trim()) ? Number(amount) : 0) + gst;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!category) e.category = t('Choose a category');
    if (!isIsoDate(date)) e.date = t('Pick the date from the calendar');
    if (!description.trim()) e.description = t('Say what it was for');
    if (!MONEY.test(amount.trim()) || Number(amount) <= 0) e.amount = t('Enter the taxable value, e.g. 2400 or 2400.50');
    if (gstin.trim() && !GSTIN_PATTERN.test(gstin.trim().toUpperCase())) e.gstin = t('Enter the 15-character GSTIN, or leave it blank');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    else if (editId && photosQueued(photos)) e.photos = t('Photos need a connection to upload before resubmitting');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const blank = editId ? null : undefined;
      const opt = (v: string) => v.trim() || blank;
      const body = {
        date,
        category,
        description: description.trim(),
        vendor: opt(vendor),
        vendorGstin: opt(gstin.toUpperCase()),
        billNo: opt(billNo),
        amount: amount.trim(),
        gstRate,
        paymentMode,
        activityId: activityId ?? blank,
        remarks: opt(remarks),
      };
      if (editId) {
        setCreated(await api.patch<ExpenseDto>(`/expenses/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(
          await enqueue({
            id: clientId.current,
            type: 'EXPENSE',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${rupees(total)} · ${description.trim()}`,
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<ExpenseDto>('/expenses', { id: clientId.current, projectId, ...body, attachmentIds: attachmentIds(photos) }));
        draft.clear();
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
    clientId.current = newId();
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
    draft.settle();
  };
  const startOver = () => {
    setDate(today());
    setCategory(null);
    setDescription('');
    setVendor('');
    setGstin('');
    setBillNo('');
    setAmount('');
    setGstRate('0');
    setPaymentMode('CASH');
    setActivityId(null);
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? t('Expense resubmitted') : t('Expense submitted')}
        subtitle={t('{no}: {amount} for {description}. Sent for approval.', { no: created.expenseNo, amount: rupees(Number(created.totalAmount)), description: created.description })}
        detailHref={`/expense/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: editId ? t('Edit site expense') : t('New site expense') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} disabled={!!editId} />
        <Select label={t('Category')} required value={category} options={categoryOptions} onChange={setCategory} placeholder={t('Choose category')} error={errors.category} />
        <Input {...field()} label={t('What was it for')} required value={description} onChangeText={setDescription} placeholder={t('e.g. Hydraulic hose for grader')} error={errors.description} />
        <DatePicker label={t('Bill date')} required value={date} onChange={setDate} error={errors.date} />
      </Card>
      <Card title={t('Amount')}>
        <Input {...field()} label={t('Taxable value (₹)')} required value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={t('e.g. 2400')} error={errors.amount} style={styles.bigInput} />
        <Chips label={t('GST %')} value={gstRate} onChange={(v) => setGstRate(v ?? '0')} clearable={false} options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))} />
        <View style={styles.totalBox}>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>GST {rupees(gst)}</Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.total}>{rupees(total)}</Text>
        </View>
        <Chips label={t('Paid by')} value={paymentMode} onChange={(v) => setPaymentMode(v ?? 'CASH')} clearable={false} options={PAYMENT_MODES.map((m) => ({ value: m, label: t(PAYMENT_MODE_LABELS[m]).replace(/ \(.*\)$/, '') }))} />
      </Card>
      <Card title={t('Bill photo')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors.photos}</Text> : null}
        {!photos.length ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Take a photo of the bill; the PM may send it back without one.')}</Text> : null}
      </Card>
      <Card title={t('Bill details (optional)')}>
        <Input {...field()} label={t('Vendor')} value={vendor} onChangeText={setVendor} />
        <Input {...field()} label={t('Vendor GSTIN')} value={gstin} onChangeText={setGstin} autoCapitalize="characters" maxLength={15} error={errors.gstin} />
        <Input {...field()} label={t('Bill no.')} value={billNo} onChangeText={setBillNo} />
        <Select label={t('Activity')} value={activityId} options={activityOptions} onChange={setActivityId} placeholder={projectId ? t('Choose activity') : t('Choose a project first')} disabled={!projectId} emptyText={t('No activities in this project')} />
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline />
      </Card>
      <Button title={editId ? t('Resubmit for approval') : t('Submit for approval')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigInput: { fontSize: 22, fontWeight: '700' },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg },
  total: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
