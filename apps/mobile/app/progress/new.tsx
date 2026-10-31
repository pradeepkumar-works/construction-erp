import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ProgressEntryDto } from '@erp/shared';
import { sectorLocation } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, outboxToPhotos, OutboxRefusal, ReviewerNote, useOutboxEntry } from '../../src/forms/edit';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useSectorInputs, type SectorDraft } from '../../src/forms/sector';
import { useT } from '../../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

/**
 * New progress entry, or (with `editId`) edit a draft / rejected / changes-requested entry and resubmit it, or (with
 * `outboxId`) fix one the server refused from the outbox. A new entry is kept on the phone as a draft while it is typed.
 */
export default function NewProgressScreen() {
  const params = useLocalSearchParams<{ projectId?: string; activityId?: string; editId?: string; outboxId?: string }>();
  const editId = params.editId ?? null;
  const outboxId = params.outboxId ?? null;
  const t = useT();
  const field = useFieldChain();
  const api = useApi();
  const { online, enqueue, discard, newId } = useOffline();
  const refused = useOutboxEntry(outboxId);
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice
  // (a new one for each entry made with Submit another).
  const clientId = useRef(outboxId ?? newId());
  const errorSummary = useErrorSummary();
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

  const draft = useFormDraft<{ projectId: string | null; activityId: string | null; date: string; quantity: string; location: string; sector: SectorDraft; manpower: string; machinery: string; remarks: string; photos: LocalPhoto[] }>(
    editId || outboxId ? null : 'progress',
    { projectId, activityId, date, quantity, location, sector: sector.value, manpower, machinery, remarks, photos },
    (d) => {
      setProjectId(d.projectId);
      setActivityId(d.activityId);
      setDate(d.date);
      setQuantity(d.quantity);
      setLocation(d.location);
      sector.restore(d.sector);
      setManpower(d.manpower);
      setMachinery(d.machinery);
      setRemarks(d.remarks);
      setPhotos(restorePhotos(d.photos));
    },
  );
  useLeaveGuard(draft, { keepsDraft: !editId && !outboxId, busy });
  const startOver = () => {
    setProjectId(params.projectId ?? (projects.options.length === 1 ? projects.options[0].value : null));
    setActivityId(params.activityId ?? null);
    setDate(today());
    setQuantity('');
    setLocation('');
    sector.clear();
    setManpower('');
    setMachinery('');
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  // Default to the only project when the user has just one.
  useEffect(() => {
    if (!editId && !outboxId && !projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      draft.settle();
    }
  }, [editId, outboxId, projects.options, projectId, draft.settle]);

  // Fixing a refused outbox entry: fill the form from what was queued.
  const [refusedLoaded, setRefusedLoaded] = useState(false);
  useEffect(() => {
    if (!refused || refusedLoaded) return;
    const p = refused.payload as { projectId: string; activityId: string; date: string; quantity: string; location?: string; remarks?: string; manpowerCount?: number; machineryUsed?: string; chainageFrom?: number; chainageTo?: number; floor?: string; village?: string };
    setProjectId(p.projectId);
    setActivityId(p.activityId);
    setDate(p.date);
    setQuantity(String(p.quantity ?? ''));
    setLocation(p.location ?? '');
    sector.load(p);
    setManpower(p.manpowerCount === undefined || p.manpowerCount === null ? '' : String(p.manpowerCount));
    setMachinery(p.machineryUsed ?? '');
    setRemarks(p.remarks ?? '');
    setPhotos(outboxToPhotos(refused.photos));
    setRefusedLoaded(true);
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refused, refusedLoaded, draft.settle]);

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
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(
    // An activity made of sub-activities takes no progress of its own (item 125).
    () => (activities.data ?? []).filter((a) => !a.isSummary).map((a) => ({ value: a.id, label: `${a.boqItemNo ? `${a.boqItemNo} · ` : ''}${a.name}`, hint: t('{unit} · {done} of {planned} done ({pct}%)', { unit: a.unit, done: fmtQty(a.executedQty), planned: fmtQty(a.plannedQty), pct: Math.round(a.progressPct) }) })),
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
    if (manpower.trim() && (!/^\d+$/.test(manpower.trim()) || Number(manpower) < 0)) e.manpower = t('Enter the manpower count as a whole number');
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
        draft.clear();
        return;
      }
      // New entry: save to the outbox when offline (or when a photo is still on the phone); otherwise send now.
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        draft.clear();
        setQueued(
          await enqueue({
            id: clientId.current,
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
        const entry = await api.post<ProgressEntryDto>('/progress', { id: clientId.current, projectId, ...body, attachmentIds: attachmentIds(photos) });
        draft.clear();
        if (outboxId) await discard(outboxId);
        setCreated(entry);
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
    setQuantity('');
    setRemarks('');
    sector.clear();
    setPhotos([]);
    setErrors({});
    // What stays (project, activity, date…) is the next entry's starting point, not unsent work.
    draft.settle();
  };

  if (queued) {
    return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={outboxId ? undefined : reset} />;
  }
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? t('Progress resubmitted') : t('Progress submitted')}
        subtitle={t('{activity}: {qty} {unit} on {date}. Sent for approval.', { activity: created.activityName, qty: fmtQty(created.quantity), unit: created.unit, date: created.date })}
        detailHref={`/progress/${created.id}`}
        onAnother={editId || outboxId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: editId ? t('Edit progress entry') : outboxId ? t('Fix progress entry') : t('New progress entry') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <OutboxRefusal item={refused} />
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
        <Input {...field()}
          label={`${t('Quantity executed')}${activity ? ` (${activity.unit})` : ''}`}
          required
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          placeholder={t('e.g. 120')}
          error={errors.quantity}
          style={styles.bigInput}
        />
        {sector.fields(errors, field)}
      </Card>
      <Card title={t('Details (optional)')}>
        <Input {...field()} label={t('Location')} value={location} onChangeText={setLocation} placeholder={t('e.g. LHS, grid C4-D7')} />
        <Input {...field()} label={t('Manpower count')} value={manpower} onChangeText={setManpower} keyboardType="number-pad" placeholder={t('e.g. 18')} error={errors.manpower} />
        <Input {...field()} label={t('Machinery used')} value={machinery} onChangeText={setMachinery} placeholder={t('e.g. Grader, Roller')} />
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline placeholder={t('Anything the PM should know')} />
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
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
