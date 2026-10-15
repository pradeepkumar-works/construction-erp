import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { SafetyIncidentDto, SafetyIncidentType } from '@erp/shared';
import { INJURY_TYPES, SAFETY_INCIDENT_TYPES, SAFETY_INCIDENT_TYPE_LABELS, isReportableIncident } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Report an incident or a near miss from site (works offline through the outbox). */
export default function IncidentFormScreen() {
  const params = useLocalSearchParams<{ projectId?: string; nearMiss?: string }>();
  const api = useApi();
  const { online, enqueue } = useOffline();
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

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const hurt = !!type && INJURY_TYPES.includes(type);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!type) e.type = 'Pick what kind';
    if (!isIsoDate(date) || date > today()) e.date = 'Enter a date up to today';
    if (time.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) e.time = 'Like 15:40';
    if (!location.trim()) e.location = 'Where did it happen?';
    if (!description.trim()) e.description = 'Describe what happened';
    if (hurt && !(Number(injured) >= 1)) e.injured = 'At least 1';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate() || !type) return;
    setBusy(true);
    try {
      const t = (v: string) => v.trim() || undefined;
      const body = {
        projectId,
        type,
        date,
        time: t(time) ?? null,
        location: location.trim(),
        description: description.trim(),
        injuredCount: hurt ? Number(injured) : 0,
        injuredNames: hurt ? t(names) : undefined,
        daysLost: type === 'LOST_TIME' && daysLost.trim() ? Number(daysLost) : null,
        contractor: t(contractor),
        immediateAction: t(action),
      };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(await enqueue({ type: 'SAFETY_INCIDENT', payload: body, photos: toOutboxPhotos(photos), title: `${SAFETY_INCIDENT_TYPE_LABELS[type]} · ${location.trim()}`, subtitle: `${projectName} · ${formatDate(date)}` }));
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<SafetyIncidentDto>('/safety/incidents', { ...body, attachmentIds: attachmentIds(photos) }));
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

  if (queued) return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) {
    return (
      <SubmitSuccess
        title={saved.type === 'NEAR_MISS' ? 'Near miss reported' : 'Incident reported'}
        subtitle={`${saved.incidentNo}. ${isReportableIncident(saved.type) ? 'The safety officer and the project manager have been told.' : 'The safety officer has been told.'}`}
        detailHref={`/incident/${saved.id}`}
        onAnother={reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: type === 'NEAR_MISS' ? 'Report a Near Miss' : 'Report an Incident' }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} />
        <Select label="What kind" required value={type} options={SAFETY_INCIDENT_TYPES.map((t) => ({ value: t, label: SAFETY_INCIDENT_TYPE_LABELS[t] }))} onChange={setType} placeholder="Near miss, first aid..." error={errors.type} />
        <DatePicker label="Date" required value={date} onChange={setDate} error={errors.date} />
        <Input label="Time" value={time} onChangeText={setTime} placeholder="HH:mm" keyboardType="numbers-and-punctuation" maxLength={5} error={errors.time} />
        <Input label="Where" required value={location} onChangeText={setLocation} placeholder="Chainage, block and floor, yard" maxLength={200} error={errors.location} />
        <Input label="What happened" required value={description} onChangeText={setDescription} multiline maxLength={4000} error={errors.description} />
      </Card>
      {hurt ? (
        <Card title="People hurt">
          <Input label="How many" required value={injured} onChangeText={setInjured} keyboardType="number-pad" maxLength={3} error={errors.injured} />
          <Input label="Names" value={names} onChangeText={setNames} placeholder="Name (trade)" maxLength={1000} />
          {type === 'LOST_TIME' ? <Input label="Days off work" value={daysLost} onChangeText={setDaysLost} keyboardType="number-pad" maxLength={4} /> : null}
        </Card>
      ) : null}
      <Card>
        <Input label="Whose workers" value={contractor} onChangeText={setContractor} placeholder="Labour contractor or subcontractor" maxLength={200} />
        <Input label="Immediate action" value={action} onChangeText={setAction} multiline maxLength={2000} placeholder="First aid given, area cordoned off, work stopped" />
      </Card>
      <Card title="Photos of the spot">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title="Report" icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
