import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { EquipmentDto, MaintenanceJobDto, Paginated } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, SubmitSuccess } from '../../src/forms/common';
import { useOffline } from '../../src/offline';
import { colors, fontSize, spacing } from '../../src/theme';
import { isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

const NUM = /^\d+(\.\d+)?$/;

/**
 * Report a machine that has broken down at site (v4 item 42). The store manager and the project manager are told at
 * once and keep the job card on the web. Needs a connection, since the point is to get the machine looked at now.
 */
export default function BreakdownScreen() {
  const params = useLocalSearchParams<{ equipmentId?: string; projectId?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online } = useOffline();
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

  // Machines at the project first (when opened from one), then the rest of the fleet; machines in the yard last.
  const options = useMemo<SelectOption[]>(() => {
    const all = fleet.data?.items ?? [];
    const rank = (e: EquipmentDto) => (params.projectId && e.projectId === params.projectId ? 0 : e.projectId ? 1 : 2);
    return [...all].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code)).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, hint: e.projectName ?? t('Yard') }));
  }, [fleet.data, params.projectId, t]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!equipmentId) e.equipmentId = t('Choose the machine');
    if (!isIsoDate(date) || date > today()) e.date = t('Enter a date up to today');
    if (meter.trim() && !NUM.test(meter.trim())) e.meter = t('Enter the meter reading as a number');
    if (!description.trim()) e.description = t('Say what broke down');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos) || photosQueued(photos)) e.photos = t('Photos need a connection; remove them or try again');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      setSaved(
        await api.post<MaintenanceJobDto>('/maintenance/jobs', {
          equipmentId,
          kind: 'BREAKDOWN',
          date,
          meterReading: meter.trim() || null,
          description: description.trim(),
          attachmentIds: attachmentIds(photos),
        }),
      );
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSaved(null);
    setEquipmentId(null);
    setMeter('');
    setDescription('');
    setPhotos([]);
    setErrors({});
  };

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
      <Stack.Screen options={{ title: t('Report Breakdown') }} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? (online ? null : t('You are offline. A breakdown is sent straight away, so it needs a connection.'))} />
      <Card>
        <Select label={t('Machine')} required value={equipmentId} options={options} onChange={setEquipmentId} placeholder={t('Choose the machine')} error={errors.equipmentId} />
        <DatePicker label={t('Stopped on')} required value={date} onChange={setDate} error={errors.date} />
        <Input {...field()} label={t('Hour meter / km')} value={meter} onChangeText={setMeter} keyboardType="decimal-pad" maxLength={12} error={errors.meter} />
        <Input {...field({ multiline: true })} label={t('What broke down')} required value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder={t('Hydraulic hose burst on the boom; machine stopped at Ch 14+600')} error={errors.description} />
      </Card>
      <Card title={t('Photos')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t('Report breakdown')} icon="send" onPress={submit} loading={busy} disabled={!online} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
