import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { AiStatusDto, DefectDto, DefectPriority, SnagDraftDto } from '@erp/shared';
import { DEFECT_PHASE_LABELS, DEFECT_PRIORITIES, DEFECT_PRIORITY_LABELS } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, maxFontScale, spacing, typography } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';

/**
 * Report a snag (before handover) or a defect (in the defect liability period) with photos (v4 item 47). Which one it is
 * follows from whether completion is recorded for the project. Works offline through the outbox.
 */
export default function ReportSnagScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // One id for a direct send and the outbox, so a report that timed out but arrived is never made twice.
  const clientId = useRef(newId());
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [trade, setTrade] = useState('');
  const [priority, setPriority] = useState<DefectPriority>('MEDIUM');
  const [contractor, setContractor] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<DefectDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);
  const ai = useFetch<AiStatusDto>((a) => a.get('/ai/status'), [], { refetchOnFocus: false });
  const [describing, setDescribing] = useState(false);
  const [described, setDescribed] = useState<string | null>(null);
  const photoId = photos.find((p) => p.attachmentId)?.attachmentId;

  const draft = useFormDraft('snag', { projectId, title, location, trade, priority, contractor, dueDate, description, photos }, (d) => {
    setProjectId(d.projectId);
    setTitle(d.title);
    setLocation(d.location);
    setTrade(d.trade);
    setPriority(d.priority);
    setContractor(d.contractor);
    setDueDate(d.dueDate);
    setDescription(d.description);
    setPhotos(restorePhotos(d.photos));
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });

  // Ask Nirmaan drafts the snag from its first photo (AI item 76) and fills in the fields still empty; nothing is sent.
  const describe = async () => {
    if (!photoId) return;
    if (!projectId) {
      setErrors((e) => ({ ...e, projectId: t('Choose a project') }));
      return;
    }
    setDescribing(true);
    setSubmitError(null);
    try {
      const d = await api.post<SnagDraftDto>('/photo-checks/snag-draft', { attachmentId: photoId, projectId });
      if (!title.trim()) setTitle(d.title);
      if (!description.trim()) setDescription(d.description);
      if (!location.trim() && d.location) setLocation(d.location);
      if (!trade.trim() && d.trade) setTrade(d.trade);
      setDescribed(t('Filled in by Ask Nirmaan from the photo. Check it before you report.'));
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setDescribing(false);
    }
  };

  useEffect(() => {
    if (!projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [projects.options, projectId, draft]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!title.trim()) e.title = t('Say what is wrong');
    if (dueDate && !isIsoDate(dueDate)) e.dueDate = t('Pick the date from the calendar');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        projectId,
        title: title.trim(),
        location: location.trim() || null,
        trade: trade.trim() || null,
        priority,
        contractor: contractor.trim() || null,
        dueDate: dueDate || null,
        reportedOn: today(),
        description: description.trim() || null,
      };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(await enqueue({ id: clientId.current, type: 'DEFECT', payload: body, photos: toOutboxPhotos(photos), title: `${t('Snag')} · ${title.trim()}`, subtitle: `${projectName} · ${formatDate(today())}` }));
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<DefectDto>('/defects', { id: clientId.current, ...body, attachmentIds: attachmentIds(photos) }));
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
    setSaved(null);
    setQueued(null);
    setTitle('');
    setLocation('');
    setDescription('');
    setPhotos([]);
    setErrors({});
    setDescribed(null);
  };
  const startOver = () => {
    setTitle('');
    setLocation('');
    setTrade('');
    setPriority('MEDIUM');
    setContractor('');
    setDueDate('');
    setDescription('');
    setPhotos([]);
    setErrors({});
    setDescribed(null);
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) return <SubmitSuccess title={t('{phase} reported', { phase: t(DEFECT_PHASE_LABELS[saved.phase]) })} subtitle={`${saved.defectNo}: ${saved.title}. ${t('The project manager has been told.')}`} onAnother={reset} />;
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: t('Report snag') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} />
        <Input {...field()} label={t('What is wrong')} required value={title} onChangeText={setTitle} maxLength={200} placeholder={t('Toilet floor slopes away from the drain')} error={errors.title} />
        <Input {...field()} label={t('Where')} value={location} onChangeText={setLocation} maxLength={200} placeholder={t('Block B, 2nd floor, toilet T4')} />
        <Input {...field()} label={t('Trade')} value={trade} onChangeText={setTrade} maxLength={80} placeholder={t('Tiling, plaster, plumbing…')} />
        <Chips label={t('Priority')} value={priority} clearable={false} onChange={(v) => v && setPriority(v)} options={DEFECT_PRIORITIES.map((p) => ({ value: p, label: t(DEFECT_PRIORITY_LABELS[p]) }))} />
        <Input {...field()} label={t('Subcontractor to put it right')} value={contractor} onChangeText={setContractor} maxLength={160} />
        <DatePicker label={t('Put right by')} value={dueDate} onChange={setDueDate} error={errors.dueDate} />
        <Input {...field({ multiline: true })} label={t('Details')} value={description} onChangeText={setDescription} multiline maxLength={2000} />
      </Card>
      <Card title={t('Photos')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors.photos}</Text> : null}
        {ai.data?.enabled && photoId ? (
          <>
            <Button title={t('Describe from photo')} icon="sparkles-outline" variant="secondary" size="sm" onPress={describe} loading={describing} disabled={!online} />
            <Text style={styles.hint} maxFontSizeMultiplier={maxFontScale}>
              {described ?? t('Ask Nirmaan fills in the empty fields from the first photo')}
            </Text>
          </>
        ) : null}
      </Card>
      <Button title={t('Report snag')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
  hint: { ...typography.caption, marginTop: spacing.xs },
});
