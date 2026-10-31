import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { EquipmentDto, MaintenanceJobDto, Paginated } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos } from '../../src/forms/common';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, maxFontScale, spacing } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

const NUM = /^\d+(\.\d+)?$/;

/**
 * Report a machine that has broken down at site (v4 item 42). The store manager and the project manager are told at
 * once and keep the job card on the web. Without a signal it waits in the outbox and goes as soon as there is one.
 */
export default function BreakdownScreen() {
  const params = useLocalSearchParams<{ equipmentId?: string; projectId?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // One id for a direct send and the outbox, so a report that timed out but arrived is never made twice.
  const clientId = useRef(newId());
  const fleet = useFetch<Paginated<EquipmentDto>>((a) => a.get('/equipment', { pageSize: MAX_PAGE_SIZE }), [], { refetchOnFocus: false, cacheKey: 'equipment:v1' });

  const [equipmentId, setEquipmentId] = useState<string | null>(params.equipmentId ?? null);
  const [date, setDate] = useState(today());
  const [meter, setMeter] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<MaintenanceJobDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  const draft = useFormDraft('breakdown', { equipmentId, date, meter, description, photos }, (d) => {
    setEquipmentId(d.equipmentId);
    setDate(d.date);
    setMeter(d.meter);
    setDescription(d.description);
    setPhotos(restorePhotos(d.photos));
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });

  // Machines at the project first (when opened from one), then the rest of the fleet; machines in the yard last.
  const options = useMemo<SelectOption[]>(() => {
    const all = fleet.data?.items ?? [];
    const rank = (e: EquipmentDto) => (params.projectId && e.projectId === params.projectId ? 0 : e.projectId ? 1 : 2);
    return [...all].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code)).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, hint: e.projectName ?? t('Yard') }));
  }, [fleet.data, params.projectId, t]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!equipmentId) e.equipmentId = t('Choose the machine');
    if (!isIsoDate(date) || date > today()) e.date = t('Choose a date up to today');
    if (meter.trim() && !NUM.test(meter.trim())) e.meter = t('Enter the meter reading as a number');
    if (!description.trim()) e.description = t('Say what broke down');
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
      const body = { equipmentId, kind: 'BREAKDOWN', date, meterReading: meter.trim() || null, description: description.trim() };
      const queueIt = async () => {
        const code = fleet.data?.items.find((e) => e.id === equipmentId)?.code ?? t('Machine');
        setQueued(await enqueue({ id: clientId.current, type: 'BREAKDOWN', payload: body, photos: toOutboxPhotos(photos), title: `${t('Breakdown')} · ${code}`, subtitle: formatDate(date) }));
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<MaintenanceJobDto>('/maintenance/jobs', { id: clientId.current, ...body, attachmentIds: attachmentIds(photos) }));
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
    setEquipmentId(null);
    setMeter('');
    setDescription('');
    setPhotos([]);
    setErrors({});
  };
  const startOver = () => {
    setEquipmentId(params.equipmentId ?? null);
    setDate(today());
    setMeter('');
    setDescription('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved)
    return (
      <SubmitSuccess
        title={t('Breakdown reported')}
        subtitle={t('{job} for {code}. The store manager and the project manager have been told.', { job: saved.jobNo, code: saved.equipmentCode })}
        onAnother={reset}
      />
    );
  if (fleet.loading && !fleet.data) return <Loading />;
  if (fleet.error && !fleet.data) return <ErrorState message={fleet.error} onRetry={fleet.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: t('Report breakdown') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError} />
      <Card>
        <Select label={t('Machine')} required value={equipmentId} options={options} onChange={setEquipmentId} placeholder={t('Choose the machine')} error={errors.equipmentId} />
        <DatePicker label={t('Stopped on')} required value={date} onChange={setDate} error={errors.date} />
        <Input {...field()} label={t('Hour meter / km')} value={meter} onChangeText={setMeter} keyboardType="decimal-pad" maxLength={12} error={errors.meter} />
        <Input {...field({ multiline: true })} label={t('What broke down')} required value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder={t('Hydraulic hose burst on the boom; machine stopped at Ch 14+600')} error={errors.description} />
      </Card>
      <Card title={t('Photos')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t('Report breakdown')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
