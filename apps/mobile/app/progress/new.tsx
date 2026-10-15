import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ProgressEntryDto } from '@erp/shared';
import { sectorLocation } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { useSectorInputs } from '../../src/forms/sector';
import { useT } from '../../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';

/** New progress entry, or (with `editId`) edit a draft / rejected / changes-requested entry and resubmit it. */
export default function NewProgressScreen() {
  const params = useLocalSearchParams<{ projectId?: string; activityId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const t = useT();
  const api = useApi();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();
  const existing = useFetch<ProgressEntryDto>((a) => a.get(`/progress/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [activityId, setActivityId] = useState<string | null>(params.activityId ?? null);
  const [date, setDate] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [manpower, setManpower] = useState('');
  const [machinery, setMachinery] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ProgressEntryDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);
  const sector = useSectorInputs(projectId);

  // Default to the only project when the user has just one.
  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  // Editing: prefill the form from the loaded entry.
  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setProjectId(e.projectId);
    setActivityId(e.activityId);
    setDate(e.date);
    setQuantity(e.quantity);
    setLocation(e.location && e.location !== sectorLocation(e) ? e.location : '');
    sector.load(e);
    setManpower(e.manpowerCount === null ? '' : String(e.manpowerCount));
    setMachinery(e.machineryUsed ?? '');
    setRemarks(e.remarks ?? '');
    setPhotos(attachmentsToPhotos(e.attachments));
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(
    () => (activities.data ?? []).map((a) => ({ value: a.id, label: `${a.boqItemNo ? `${a.boqItemNo} · ` : ''}${a.name}`, hint: t('{unit} · {done} of {planned} done ({pct}%)', { unit: a.unit, done: fmtQty(a.executedQty), planned: fmtQty(a.plannedQty), pct: Math.round(a.progressPct) }) })),
    [activities.data, t],
  );
  const activity = activities.data?.find((a) => a.id === activityId) ?? null;

  const changeProject = (id: string) => {
    setProjectId(id);
    setActivityId(null);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!activityId) e.activityId = t('Choose an activity');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    const q = Number(quantity);
    if (!quantity.trim() || Number.isNaN(q) || q <= 0) e.quantity = t('Enter a quantity greater than 0');
    sector.validate(e);
    if (manpower.trim() && (!/^\d+$/.test(manpower.trim()) || Number(manpower) < 0)) e.manpower = t('Whole number');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    else if (editId && photosQueued(photos)) e.photos = t('Photos need a connection to upload before resubmitting');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const blank = editId ? null : undefined;
      const body = {
        activityId,
        date,
        quantity: String(Number(quantity)),
        remarks: remarks.trim() || blank,
        location: location.trim() || blank,
        ...sector.body(!!editId),
        manpowerCount: manpower.trim() ? Number(manpower) : blank,
        machineryUsed: machinery.trim() || blank,
      };
      if (editId) {
        setCreated(await api.patch<ProgressEntryDto>(`/progress/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      // New entry: save to the outbox when offline (or when a photo is still on the phone); otherwise send now.
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(
          await enqueue({
            type: 'PROGRESS',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${activity?.name ?? t('Progress')} · ${fmtQty(Number(quantity))} ${activity?.unit ?? ''}`.trim(),
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<ProgressEntryDto>('/progress', { projectId, ...body, attachmentIds: attachmentIds(photos) }));
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
    setQuantity('');
    setRemarks('');
    sector.clear();
    setPhotos([]);
    setErrors({});
  };

  if (queued) {
    return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  }
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? t('Progress resubmitted') : t('Progress submitted')}
        subtitle={t('{activity}: {qty} {unit} on {date}. Sent for approval.', { activity: created.activityName, qty: fmtQty(created.quantity), unit: created.unit, date: created.date })}
        detailHref={`/progress/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? t('Edit Progress Entry') : t('New Progress Entry') }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={changeProject} placeholder={t('Choose project')} error={errors.projectId} disabled={!!editId} />
        <Select
          label={t('Activity')}
          required
          value={activityId}
          options={activityOptions}
          onChange={setActivityId}
          placeholder={!projectId ? t('Choose a project first') : activities.loading ? t('Loading activities…') : t('Choose activity')}
          disabled={!projectId || activities.loading}
          error={errors.activityId ?? activities.error}
          emptyText={t('No activities in this project')}
        />
        {activity ? (
          <View style={styles.activityInfo}>
            <Text style={typography.caption}>
              {t('Unit')} <Text style={styles.strong}>{activity.unit}</Text> · {t('Planned qty')} <Text style={styles.strong}>{fmtQty(activity.plannedQty)}</Text> · {t('Executed')} <Text style={styles.strong}>{fmtQty(activity.executedQty)}</Text> · {t('Balance')}{' '}
              <Text style={styles.strong}>{fmtQty(Math.max(0, Number(activity.plannedQty) - Number(activity.executedQty)))}</Text>
            </Text>
          </View>
        ) : null}
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        <Input
          label={`${t('Quantity executed')}${activity ? ` (${activity.unit})` : ''}`}
          required
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          placeholder={t('e.g. 120')}
          error={errors.quantity}
          style={styles.bigInput}
        />
        {sector.fields(errors)}
      </Card>
      <Card title={t('Details (optional)')}>
        <Input label={t('Location')} value={location} onChangeText={setLocation} placeholder={t('e.g. LHS, grid C4-D7')} />
        <Input label={t('Manpower count')} value={manpower} onChangeText={setManpower} keyboardType="number-pad" placeholder={t('e.g. 18')} error={errors.manpower} />
        <Input label={t('Machinery used')} value={machinery} onChangeText={setMachinery} placeholder={t('e.g. Grader, Roller')} />
        <Input label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline placeholder={t('Anything the PM should know')} />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={editId ? t('Resubmit for approval') : t('Submit for approval')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityInfo: { backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: 10, marginBottom: spacing.lg, marginTop: -spacing.sm },
  strong: { fontWeight: '700', color: colors.text },
  bigInput: { fontSize: 22, fontWeight: '700' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
