import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { SafetyIncidentDto, SafetyIncidentType } from '@erp/shared';
import { INJURY_TYPES, SAFETY_INCIDENT_TYPES, SAFETY_INCIDENT_TYPE_LABELS, isReportableIncident } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, Input, TimePicker, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, spacing } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Report an incident or a near miss from site (works offline through the outbox). */
export default function IncidentFormScreen() {
  const params = useLocalSearchParams<{ projectId?: string; nearMiss?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice
  // (a new one for each entry made with Submit another).
  const clientId = useRef(newId());
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [type, setType] = useState<SafetyIncidentType | null>(params.nearMiss ? 'NEAR_MISS' : null);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [injured, setInjured] = useState('1');
  const [names, setNames] = useState('');
  const [daysLost, setDaysLost] = useState('');
  const [contractor, setContractor] = useState('');
  const [action, setAction] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SafetyIncidentDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  const draft = useFormDraft('incident', { projectId, type, date, time, location, description, injured, names, daysLost, contractor, action, photos }, (d) => {
    setProjectId(d.projectId);
    setType(d.type);
    setDate(d.date);
    setTime(d.time);
    setLocation(d.location);
    setDescription(d.description);
    setInjured(d.injured);
    setNames(d.names);
    setDaysLost(d.daysLost);
    setContractor(d.contractor);
    setAction(d.action);
    setPhotos(restorePhotos(d.photos));
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });

  useEffect(() => {
    if (!projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [projects.options, projectId, draft]);

  const hurt = !!type && INJURY_TYPES.includes(type);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!type) e.type = t('Choose what kind it was');
    if (!isIsoDate(date) || date > today()) e.date = t('Choose a date up to today');
    if (time.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) e.time = t('Enter the time like 15:40');
    if (!location.trim()) e.location = t('Say where it happened');
    if (!description.trim()) e.description = t('Describe what happened');
    if (hurt && !(Number(injured) >= 1)) e.injured = t('Enter how many were hurt (at least 1)');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate() || !type) return;
    setBusy(true);
    try {
      const opt = (v: string) => v.trim() || undefined;
      const body = {
        projectId,
        type,
        date,
        time: opt(time) ?? null,
        location: location.trim(),
        description: description.trim(),
        injuredCount: hurt ? Number(injured) : 0,
        injuredNames: hurt ? opt(names) : undefined,
        daysLost: type === 'LOST_TIME' && daysLost.trim() ? Number(daysLost) : null,
        contractor: opt(contractor),
        immediateAction: opt(action),
      };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(await enqueue({ id: clientId.current, type: 'SAFETY_INCIDENT', payload: body, photos: toOutboxPhotos(photos), title: `${t(SAFETY_INCIDENT_TYPE_LABELS[type])} · ${location.trim()}`, subtitle: `${projectName} · ${formatDate(date)}` }));
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<SafetyIncidentDto>('/safety/incidents', { id: clientId.current, ...body, attachmentIds: attachmentIds(photos) }));
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
    setLocation('');
    setDescription('');
    setNames('');
    setDaysLost('');
    setAction('');
    setPhotos([]);
    setErrors({});
  };
  const startOver = () => {
    setType(params.nearMiss ? 'NEAR_MISS' : null);
    setDate(today());
    setTime(nowTime());
    setLocation('');
    setDescription('');
    setInjured('1');
    setNames('');
    setDaysLost('');
    setContractor('');
    setAction('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) {
    return (
      <SubmitSuccess
        title={t(saved.type === 'NEAR_MISS' ? 'Near miss reported' : 'Incident reported')}
        subtitle={`${saved.incidentNo}. ${t(isReportableIncident(saved.type) ? 'The safety officer and the project manager have been told.' : 'The safety officer has been told.')}`}
        detailHref={`/incident/${saved.id}`}
        onAnother={reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: t(type === 'NEAR_MISS' ? 'Report near miss' : 'Report incident') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} />
        <Select label={t('What kind')} required value={type} options={SAFETY_INCIDENT_TYPES.map((k) => ({ value: k, label: t(SAFETY_INCIDENT_TYPE_LABELS[k]) }))} onChange={setType} placeholder={t('Near miss, first aid…')} error={errors.type} />
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        <TimePicker label={t('Time')} value={time} onChange={setTime} error={errors.time} />
        <Input {...field()} label={t('Where')} required value={location} onChangeText={setLocation} placeholder={t('Chainage, block and floor, yard')} maxLength={200} error={errors.location} />
        <Input {...field({ multiline: true })} label={t('What happened')} required value={description} onChangeText={setDescription} multiline maxLength={4000} error={errors.description} />
      </Card>
      {hurt ? (
        <Card title={t('People hurt')}>
          <Input {...field()} label={t('How many')} required value={injured} onChangeText={setInjured} keyboardType="number-pad" maxLength={3} error={errors.injured} />
          <Input {...field()} label={t('Names')} value={names} onChangeText={setNames} placeholder={t('Name (trade)')} maxLength={1000} />
          {type === 'LOST_TIME' ? <Input {...field()} label={t('Days off work')} value={daysLost} onChangeText={setDaysLost} keyboardType="number-pad" maxLength={4} /> : null}
        </Card>
      ) : null}
      <Card>
        <Input {...field()} label={t('Whose workers')} value={contractor} onChangeText={setContractor} placeholder={t('Labour contractor or subcontractor')} maxLength={200} />
        <Input {...field({ multiline: true })} label={t('Immediate action')} value={action} onChangeText={setAction} multiline maxLength={2000} placeholder={t('First aid given, area cordoned off, work stopped')} />
      </Card>
      <Card title={t('Photos of the spot')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t(type === 'NEAR_MISS' ? 'Report near miss' : 'Report incident')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
