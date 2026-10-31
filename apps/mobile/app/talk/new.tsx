import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { ToolboxTalkDraftDto, ToolboxTalkDto } from '@erp/shared';
import { TOOLBOX_TOPICS, talkText } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, useSnackbar, type LocalPhoto } from '../../src/components';
import { TodaysTalk } from '../../src/components/TodaysTalk';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, spacing } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';

const OTHER = '__other';
/** English labels; shown through t(). The value of a listed topic is the English text the API stores. */
const TOPICS = [...TOOLBOX_TOPICS.map((x) => ({ value: x, label: x })), { value: OTHER, label: 'Another topic…' }];
const DURATIONS = ['10', '15', '20', '30'];

/** Record a toolbox talk given at site (works offline through the outbox). */
export default function TalkFormScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { user } = useAuth();
  const { online, enqueue, newId } = useOffline();
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice
  // (a new one for each entry made with Submit another).
  const clientId = useRef(newId());
  const projects = useProjectOptions();
  const snackbar = useSnackbar();

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

  const draft = useFormDraft('toolbox-talk', { projectId, date, topic, otherTopic, conductedBy, contractor, count, attendees, duration, notes, photos }, (d) => {
    setProjectId(d.projectId);
    setDate(d.date);
    setTopic(d.topic);
    setOtherTopic(d.otherTopic);
    setConductedBy(d.conductedBy);
    setContractor(d.contractor);
    setCount(d.count);
    setAttendees(d.attendees);
    setDuration(d.duration);
    setNotes(d.notes);
    setPhotos(restorePhotos(d.photos));
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });

  useEffect(() => {
    if (!projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [projects.options, projectId, draft]);

  const subject = topic === OTHER ? otherTopic.trim() : (topic ?? '');

  /** Today's talk fills the topic and the points covered; the rest is the supervisor's. */
  const takeTalk = (d: ToolboxTalkDraftDto) => {
    if ((TOOLBOX_TOPICS as readonly string[]).includes(d.topic)) setTopic(d.topic);
    else {
      setTopic(OTHER);
      setOtherTopic(d.topic);
    }
    setNotes(talkText(d, 'en').slice(0, 2000));
    snackbar.show(t('Topic and points filled in'));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!isIsoDate(date) || date > today()) e.date = t('Choose a date up to today');
    if (!subject) e.topic = t(topic === OTHER ? 'Type the topic' : 'Pick a topic');
    if (!conductedBy.trim()) e.conductedBy = t('Enter who gave the talk');
    if (!(Number(count) >= 1) || !Number.isInteger(Number(count))) e.count = t('Enter how many attended');
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
      const opt = (v: string) => v.trim() || undefined;
      const body = {
        projectId,
        date,
        topic: subject,
        conductedBy: conductedBy.trim(),
        contractor: opt(contractor),
        attendeeCount: Number(count),
        attendees: opt(attendees),
        durationMinutes: duration ? Number(duration) : null,
        notes: opt(notes),
      };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(await enqueue({ id: clientId.current, type: 'TOOLBOX_TALK', payload: body, photos: toOutboxPhotos(photos), title: `${t('Toolbox talk')} · ${t(subject)}`, subtitle: `${projectName} · ${formatDate(date)} · ${t('{n} attended', { n: count })}` }));
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<ToolboxTalkDto>('/safety/talks', { id: clientId.current, ...body, attachmentIds: attachmentIds(photos) }));
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
    setTopic(null);
    setOtherTopic('');
    setContractor('');
    setCount('');
    setAttendees('');
    setNotes('');
    setPhotos([]);
    setErrors({});
  };
  const startOver = () => {
    setDate(today());
    setTopic(null);
    setOtherTopic('');
    setConductedBy(user?.fullName ?? '');
    setContractor('');
    setCount('');
    setAttendees('');
    setDuration('15');
    setNotes('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) return <SubmitSuccess title={t('Toolbox talk recorded')} subtitle={`${saved.talkNo}: ${t(saved.topic)}, ${t('{n} attended', { n: saved.attendeeCount })}.`} detailHref={`/safety?projectId=${saved.projectId}&show=talks`} onAnother={reset} />;
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      {projectId ? <TodaysTalk projectId={projectId} onUse={takeTalk} /> : null}
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} />
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        <Select label={t('Topic')} required value={topic} options={TOPICS.map((o) => ({ ...o, label: t(o.label) }))} onChange={setTopic} placeholder={t('Choose topic')} searchable error={topic === OTHER ? null : errors.topic} />
        {topic === OTHER ? <Input {...field()} label={t('Topic')} required value={otherTopic} onChangeText={setOtherTopic} maxLength={200} error={errors.topic} /> : null}
        <Input {...field()} label={t('Given by')} required value={conductedBy} onChangeText={setConductedBy} maxLength={120} error={errors.conductedBy} />
        <Chips label={t('How long')} value={duration} onChange={setDuration} options={DURATIONS.map((v) => ({ value: v, label: t('{n} min', { n: v }) }))} />
      </Card>
      <Card title={t('Who attended')}>
        <Input {...field()} label={t('Number attended')} required value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={4} error={errors.count} />
        <Input {...field()} label={t('Whose workers')} value={contractor} onChangeText={setContractor} placeholder={t('Contractor (optional)')} maxLength={200} />
        <Input {...field({ multiline: true })} label={t('Names')} value={attendees} onChangeText={setAttendees} multiline maxLength={4000} placeholder={t('Optional; or photograph the signed sheet')} />
        <Input {...field({ multiline: true })} label={t('Notes')} value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </Card>
      <Card title={t('Photo of the talk or signed sheet')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t('Record toolbox talk')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
