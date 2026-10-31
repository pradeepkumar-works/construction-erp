import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { RfiDto, RfiPriority } from '@erp/shared';
import { rfiReplyBy } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, spacing } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';

/** Raise an RFI from site: what you found, a photo of it, and when the answer is needed (works offline through the outbox). */
export default function RaiseRfiScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // One id for a direct send and the outbox, so a send that timed out but arrived is never raised twice.
  const clientId = useRef(newId());
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [proposal, setProposal] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<RfiPriority>('NORMAL');
  const [replyBy, setReplyBy] = useState(rfiReplyBy(today(), 'NORMAL'));
  const [replyTouched, setReplyTouched] = useState(false);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<RfiDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const pickPriority = (p: RfiPriority) => {
    setPriority(p);
    if (!replyTouched) setReplyBy(rfiReplyBy(today(), p));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!subject.trim()) e.subject = t('Say in a line what the question is about');
    if (!question.trim()) e.question = t('Write the question');
    if (!isIsoDate(replyBy) || replyBy < today()) e.replyBy = t('Choose a date from today');
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
      const body = { projectId, subject: subject.trim(), question: question.trim(), proposal: opt(proposal), location: opt(location), priority, raisedOn: today(), replyBy };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(await enqueue({ id: clientId.current, type: 'RFI', payload: body, photos: toOutboxPhotos(photos), title: `${t('RFI')} · ${subject.trim()}`, subtitle: `${projectName} · ${t('answer by {date}', { date: formatDate(replyBy) })}` }));
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<RfiDto>('/rfis', { id: clientId.current, ...body, attachmentIds: attachmentIds(photos) }));
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
    setSubject('');
    setQuestion('');
    setProposal('');
    setLocation('');
    setPriority('NORMAL');
    setReplyBy(rfiReplyBy(today(), 'NORMAL'));
    setReplyTouched(false);
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) return <SubmitSuccess title={t('RFI raised')} subtitle={t('{no} sent to {to}. You will be told when it is answered.', { no: saved.rfiNo, to: saved.toParty })} detailHref={`/rfi/${saved.id}`} onAnother={reset} />;
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} />
        <Input {...field()} label={t('Subject')} required value={subject} onChangeText={setSubject} maxLength={200} placeholder={t('e.g. Footing level differs between drawings')} error={errors.subject} />
        <Input {...field({ multiline: true })} label={t('Question')} required value={question} onChangeText={setQuestion} multiline maxLength={4000} placeholder={t('What you found, what the drawing says, what you need to know')} error={errors.question} />
        <Input {...field({ multiline: true })} label={t('Our proposal')} value={proposal} onChangeText={setProposal} multiline maxLength={2000} placeholder={t('Optional: what you suggest')} />
        <Input {...field()} label={t('Location')} value={location} onChangeText={setLocation} maxLength={200} placeholder={t('Grid, floor, chainage or village')} />
      </Card>
      <Card title={t('Answer needed')}>
        <Chips
          label={t('Priority')}
          value={priority}
          clearable={false}
          onChange={(v) => v && pickPriority(v)}
          options={[
            { value: 'NORMAL', label: t('Normal') },
            { value: 'URGENT', label: t('Urgent') },
          ]}
        />
        <DatePicker
          label={t('Answer needed by')}
          required
          value={replyBy}
          onChange={(v) => {
            setReplyBy(v);
            setReplyTouched(true);
          }}
          error={errors.replyBy}
        />
      </Card>
      <Card title={t('Photo or marked-up drawing')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t('New RFI')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
