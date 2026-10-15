import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ChecklistTemplateDto, InspectionDto } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { useT } from '../../src/i18n/LanguageContext';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';

/** Request an inspection of an activity at a location (works offline through the outbox), or (with `editId`) change a returned one and request it again. */
export default function RequestInspectionScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const api = useApi();
  const t = useT();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();
  const existing = useFetch<InspectionDto>((a) => a.get(`/inspections/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [checklistId, setChecklistId] = useState<string>('');
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<InspectionDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const checklists = useFetch<ChecklistTemplateDto[]>((a) => a.get('/inspections/checklists'), [], { refetchOnFocus: false, cacheKey: 'checklists' });
  const activityOptions = useMemo<SelectOption[]>(
    () => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: [a.holdPoint ? t('Hold point') : null, a.checklistName].filter(Boolean).join(' · ') || undefined })),
    [activities.data, t],
  );
  const checklistOptions = useMemo<SelectOption[]>(() => [{ value: '', label: t('No checklist') }, ...(checklists.data ?? []).map((c) => ({ value: c.id, label: c.name, hint: t('{n} points', { n: c.items.length }) }))], [checklists.data, t]);
  const activity = activities.data?.find((a) => a.id === activityId) ?? null;
  const checklistBefore = editId ? ((checklists.data ?? []).find((c) => c.name === existing.data?.checklistName)?.id ?? '') : null;

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  useEffect(() => {
    const x = existing.data;
    if (!x) return;
    setProjectId(x.projectId);
    setActivityId(x.activityId);
    setDate(x.date);
    setLocation(x.location);
    setRemarks(x.remarks ?? '');
    setPhotos(attachmentsToPhotos(x.attachments));
  }, [existing.data]);

  useEffect(() => {
    if (checklistBefore !== null) setChecklistId(checklistBefore);
  }, [checklistBefore]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!activityId) e.activityId = t('Choose the activity');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    if (!location.trim()) e.location = t('Say where, e.g. First floor slab, bays 1 to 4');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    else if (editId && photosQueued(photos)) e.photos = t('Photos need a connection to upload before requesting again');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { activityId, date, location: location.trim(), remarks: remarks.trim() || (editId ? null : undefined) };
      // A new request takes the chosen checklist; an edit only sends it when changed (that starts the points afresh).
      if (!editId || checklistId !== checklistBefore) body.checklistTemplateId = checklistId || null;
      if (editId) {
        setCreated(await api.patch<InspectionDto>(`/inspections/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(
          await enqueue({
            type: 'INSPECTION',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${t('Inspection')} · ${activity?.name ?? t('Activity')} · ${location.trim()}`,
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<InspectionDto>('/inspections', { projectId, ...body, attachmentIds: attachmentIds(photos) }));
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
    setLocation('');
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (created) {
    return (
      <SubmitSuccess
        title={t(editId ? 'Inspection requested again' : 'Inspection requested')}
        subtitle={t('{no}: {activity} at {location}. QA/QC has been told.', { no: created.inspectionNo, activity: created.activityName, location: created.location })}
        detailHref={`/inspection/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: t(editId ? 'Edit Inspection Request' : 'Request Inspection') }} />
      <ErrorBanner message={submitError ?? projects.error ?? activities.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select
          label={t('Project')}
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setActivityId(null);
          }}
          placeholder={t('Choose project')}
          error={errors.projectId}
          disabled={!!editId}
        />
        <Select
          label={t('Activity')}
          required
          value={activityId}
          options={activityOptions}
          onChange={(v) => {
            setActivityId(v);
            setChecklistId(activities.data?.find((a) => a.id === v)?.checklistTemplateId ?? '');
          }}
          placeholder={t(!projectId ? 'Choose a project first' : activities.loading ? 'Loading activities…' : 'Choose activity')}
          disabled={!projectId}
          error={errors.activityId}
          emptyText={t('No activities in this project')}
        />
        {activity?.holdPoint ? <Text style={[typography.caption, styles.hold]}>{t('Hold point: its progress is approved after this inspection passes.')}</Text> : null}
        <Input label={t('Location')} required value={location} onChangeText={setLocation} placeholder={t('Chainage, grid, floor or zone')} error={errors.location} />
        <DatePicker label={t('Ready on')} required value={date} onChange={setDate} error={errors.date} />
        <Select label={t('Checklist')} value={checklistId} options={checklistOptions} onChange={(v) => setChecklistId(v ?? '')} placeholder={t('No checklist')} />
      </Card>
      <Card title={t('Photos')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Card>
        <Input label={t('Remarks')} value={remarks} onChangeText={setRemarks} placeholder={t('What is ready, anything the inspector should know')} multiline />
      </Card>
      <Button title={t(editId ? 'Request again' : 'Request inspection')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hold: { marginTop: -spacing.sm, marginBottom: spacing.md, color: colors.warning },
  err: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
});
