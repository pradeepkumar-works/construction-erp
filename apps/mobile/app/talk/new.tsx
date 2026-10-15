import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { ToolboxTalkDto } from '@erp/shared';
import { TOOLBOX_TOPICS } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';

const OTHER = '__other';
const TOPICS = [...TOOLBOX_TOPICS.map((t) => ({ value: t, label: t })), { value: OTHER, label: 'Another topic…' }];
const DURATIONS = ['10', '15', '20', '30'].map((v) => ({ value: v, label: `${v} min` }));

/** Record a toolbox talk given at site (works offline through the outbox). */
export default function TalkFormScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const { user } = useAuth();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [topic, setTopic] = useState<string | null>(null);
  const [otherTopic, setOtherTopic] = useState('');
  const [conductedBy, setConductedBy] = useState(user?.fullName ?? '');
  const [contractor, setContractor] = useState('');
  const [count, setCount] = useState('');
  const [attendees, setAttendees] = useState('');
  const [duration, setDuration] = useState<string | null>('15');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ToolboxTalkDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const subject = topic === OTHER ? otherTopic.trim() : (topic ?? '');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!isIsoDate(date) || date > today()) e.date = 'Enter a date up to today';
    if (!subject) e.topic = topic === OTHER ? 'Type the topic' : 'Pick a topic';
    if (!conductedBy.trim()) e.conductedBy = 'Who gave the talk?';
    if (!(Number(count) >= 1) || !Number.isInteger(Number(count))) e.count = 'How many attended?';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const t = (v: string) => v.trim() || undefined;
      const body = {
        projectId,
        date,
        topic: subject,
        conductedBy: conductedBy.trim(),
        contractor: t(contractor),
        attendeeCount: Number(count),
        attendees: t(attendees),
        durationMinutes: duration ? Number(duration) : null,
        notes: t(notes),
      };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(await enqueue({ type: 'TOOLBOX_TALK', payload: body, photos: toOutboxPhotos(photos), title: `Toolbox talk · ${subject}`, subtitle: `${projectName} · ${formatDate(date)} · ${count} attended` }));
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<ToolboxTalkDto>('/safety/talks', { ...body, attachmentIds: attachmentIds(photos) }));
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
    setTopic(null);
    setOtherTopic('');
    setContractor('');
    setCount('');
    setAttendees('');
    setNotes('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) return <SubmitSuccess title="Toolbox talk saved" subtitle={`${saved.talkNo}: ${saved.topic}, ${saved.attendeeCount} attended.`} detailHref={`/safety?projectId=${saved.projectId}&show=talks`} onAnother={reset} />;
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard>
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} />
        <DatePicker label="Date" required value={date} onChange={setDate} error={errors.date} />
        <Select label="Topic" required value={topic} options={TOPICS} onChange={setTopic} placeholder="Choose topic" searchable error={topic === OTHER ? null : errors.topic} />
        {topic === OTHER ? <Input label="Topic" required value={otherTopic} onChangeText={setOtherTopic} maxLength={200} error={errors.topic} /> : null}
        <Input label="Given by" required value={conductedBy} onChangeText={setConductedBy} maxLength={120} error={errors.conductedBy} />
        <Chips label="How long" value={duration} onChange={setDuration} options={DURATIONS} />
      </Card>
      <Card title="Who attended">
        <Input label="Number attended" required value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={4} error={errors.count} />
        <Input label="Whose workers" value={contractor} onChangeText={setContractor} placeholder="Contractor (optional)" maxLength={200} />
        <Input label="Names" value={attendees} onChangeText={setAttendees} multiline maxLength={4000} placeholder="Optional; or photograph the signed sheet" />
        <Input label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </Card>
      <Card title="Photo of the talk or signed sheet">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title="Save talk" icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
