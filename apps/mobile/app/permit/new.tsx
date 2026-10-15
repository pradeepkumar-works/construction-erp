import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { WorkPermitDto, WorkPermitType } from '@erp/shared';
import { PERMIT_MAX_DAYS, PERMIT_PRECAUTIONS, WORK_PERMIT_TYPES, WORK_PERMIT_TYPE_LABELS } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { Checklist, permitWindow } from '../../src/components/safetyTone';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const at = (date: string, time: string) => new Date(`${date}T${time}:00`);
const nextHour = () => `${String(Math.min(new Date().getHours() + 1, 23)).padStart(2, '0')}:00`;

/** Ask for a permit to work before hot work, work at height, excavation and the like (works offline through the outbox). */
export default function PermitFormScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const t = useT();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [type, setType] = useState<WorkPermitType | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [fromDate, setFromDate] = useState(today());
  const [fromTime, setFromTime] = useState(nextHour());
  const [toDate, setToDate] = useState(today());
  const [toTime, setToTime] = useState('18:00');
  const [contractor, setContractor] = useState('');
  const [workerCount, setWorkerCount] = useState('');
  const [workers, setWorkers] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<WorkPermitDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!type) e.type = t('Pick the kind of work');
    if (!location.trim()) e.location = t('Where is the work?');
    if (!description.trim()) e.description = t('What will be done?');
    if (!isIsoDate(fromDate) || !TIME.test(fromTime)) e.from = t('Date and a time like 09:00');
    if (!isIsoDate(toDate) || !TIME.test(toTime)) e.to = t('Date and a time like 18:00');
    if (!e.from && !e.to) {
      const mins = (at(toDate, toTime).getTime() - at(fromDate, fromTime).getTime()) / 60000;
      if (mins <= 0) e.to = t('Must end after it starts');
      else if (mins > PERMIT_MAX_DAYS * 24 * 60) e.to = t('At most {n} days; take a new permit for longer work', { n: PERMIT_MAX_DAYS });
    }
    if (workerCount.trim() && !(Number(workerCount) >= 1)) e.workerCount = t('At least 1');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    setErrors(e);
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
        location: location.trim(),
        description: description.trim(),
        contractor: opt(contractor),
        workerCount: workerCount.trim() ? Number(workerCount) : null,
        workers: opt(workers),
        validFrom: at(fromDate, fromTime).toISOString(),
        validTo: at(toDate, toTime).toISOString(),
        precautions: [
          ...ticked,
          ...other
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean),
        ],
      };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(await enqueue({ type: 'WORK_PERMIT', payload: body, photos: toOutboxPhotos(photos), title: `${t('Permit')} · ${t(WORK_PERMIT_TYPE_LABELS[type])} · ${location.trim()}`, subtitle: `${projectName} · ${permitWindow(body, t)}` }));
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<WorkPermitDto>('/safety/permits', { ...body, attachmentIds: attachmentIds(photos) }));
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
    setWorkers('');
    setTicked([]);
    setOther('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) return <SubmitSuccess title={t('Permit asked for')} subtitle={`${saved.permitNo}. ${t('The safety officer has been told; do not start until it is issued.')}`} detailHref={`/permit/${saved.id}`} onAnother={reset} />;
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard>
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} />
        <Select
          label={t('Work')}
          required
          value={type}
          options={WORK_PERMIT_TYPES.map((k) => ({ value: k, label: t(WORK_PERMIT_TYPE_LABELS[k]) }))}
          onChange={(v) => {
            setType(v);
            setTicked([]);
          }}
          placeholder={t('Hot work, height...')}
          error={errors.type}
        />
        <Input label={t('Where')} required value={location} onChangeText={setLocation} maxLength={200} error={errors.location} />
        <Input label={t('The work')} required value={description} onChangeText={setDescription} multiline maxLength={2000} error={errors.description} />
      </Card>
      <Card title={t('Valid (at most {n} days)', { n: PERMIT_MAX_DAYS })}>
        <DatePicker label={t('From')} required value={fromDate} onChange={setFromDate} error={errors.from} />
        <Input label={t('From time')} value={fromTime} onChangeText={setFromTime} placeholder="HH:mm" keyboardType="numbers-and-punctuation" maxLength={5} />
        <DatePicker label={t('Till')} required value={toDate} onChange={setToDate} error={errors.to} />
        <Input label={t('Till time')} value={toTime} onChangeText={setToTime} placeholder="HH:mm" keyboardType="numbers-and-punctuation" maxLength={5} />
      </Card>
      <Card title={t('Workers')}>
        <Input label={t('Contractor')} value={contractor} onChangeText={setContractor} placeholder={t('Optional')} maxLength={200} />
        <Input label={t('How many')} value={workerCount} onChangeText={setWorkerCount} keyboardType="number-pad" maxLength={3} error={errors.workerCount} />
        <Input label={t('Names')} value={workers} onChangeText={setWorkers} placeholder={t('Optional')} maxLength={2000} />
      </Card>
      <Card title={t('Precautions in place')}>
        {type ? <Checklist items={PERMIT_PRECAUTIONS[type]} value={ticked} onChange={setTicked} /> : <Text style={[typography.caption, styles.gap]}>{t('Pick the kind of work to see its precautions.')}</Text>}
        <Input label={t('Other precautions')} value={other} onChangeText={setOther} multiline maxLength={2000} placeholder={t('One per line')} />
      </Card>
      <Card title={t('Photos / drawings')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t('Request permit')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: spacing.sm },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
