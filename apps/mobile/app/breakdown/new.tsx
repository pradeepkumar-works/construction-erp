import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { EquipmentDto, MaintenanceJobDto, Paginated } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, SubmitSuccess } from '../../src/forms/common';
import { useOffline } from '../../src/offline';
import { colors, spacing } from '../../src/theme';
import { isIsoDate, today } from '../../src/utils/format';

const NUM = /^\d+(\.\d+)?$/;

/**
 * Report a machine that has broken down at site (v4 item 42). The store manager and the project manager are told at
 * once and keep the job card on the web. Needs a connection, since the point is to get the machine looked at now.
 */
export default function BreakdownScreen() {
  const params = useLocalSearchParams<{ equipmentId?: string; projectId?: string }>();
  const api = useApi();
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
    return [...all].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code)).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, hint: e.projectName ?? 'Yard' }));
  }, [fleet.data, params.projectId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!equipmentId) e.equipmentId = 'Choose the machine';
    if (!isIsoDate(date) || date > today()) e.date = 'Enter a date up to today';
    if (meter.trim() && !NUM.test(meter.trim())) e.meter = 'Enter a number';
    if (!description.trim()) e.description = 'Say what broke down';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos) || photosQueued(photos)) e.photos = 'Photos need a connection; remove them or try again';
    setErrors(e);
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
        title="Breakdown reported"
        subtitle={`${saved.jobNo} for ${saved.equipmentCode}. The store manager and the project manager have been told.`}
        onAnother={reset}
      />
    );
  if (fleet.loading && !fleet.data) return <Loading />;
  if (fleet.error && !fleet.data) return <ErrorState message={fleet.error} onRetry={fleet.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Report Breakdown' }} />
      <ErrorBanner message={submitError ?? (online ? null : 'You are offline. A breakdown is sent straight away, so it needs a connection.')} />
      <Card>
        <Select label="Machine" required value={equipmentId} options={options} onChange={setEquipmentId} placeholder="Choose the machine" error={errors.equipmentId} />
        <DatePicker label="Stopped on" required value={date} onChange={setDate} error={errors.date} />
        <Input label="Hour meter / km" value={meter} onChangeText={setMeter} keyboardType="decimal-pad" maxLength={12} error={errors.meter} />
        <Input label="What broke down" required value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="Hydraulic hose burst on the boom; machine stopped at Ch 14+600" error={errors.description} />
      </Card>
      <Card title="Photos">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title="Report breakdown" icon="send" onPress={submit} loading={busy} disabled={!online} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
