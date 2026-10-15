import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { DefectDto, DefectPriority } from '@erp/shared';
import { DEFECT_PHASE_LABELS, DEFECT_PRIORITIES, DEFECT_PRIORITY_LABELS } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { useOffline } from '../../src/offline';
import { colors, spacing } from '../../src/theme';
import { isIsoDate, today } from '../../src/utils/format';

/**
 * Report a snag (before handover) or a defect (in the defect liability period) with photos (v4 item 47). Which one it is
 * follows from whether completion is recorded for the project. Needs a connection, like a breakdown.
 */
export default function ReportSnagScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const { online } = useOffline();
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

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!title.trim()) e.title = 'Say what is wrong';
    if (dueDate && !isIsoDate(dueDate)) e.dueDate = 'Enter a date';
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
        await api.post<DefectDto>('/defects', {
          projectId,
          title: title.trim(),
          location: location.trim() || null,
          trade: trade.trim() || null,
          priority,
          contractor: contractor.trim() || null,
          dueDate: dueDate || null,
          reportedOn: today(),
          description: description.trim() || null,
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
    setTitle('');
    setLocation('');
    setDescription('');
    setPhotos([]);
    setErrors({});
  };

  if (saved) return <SubmitSuccess title={`${DEFECT_PHASE_LABELS[saved.phase]} reported`} subtitle={`${saved.defectNo}: ${saved.title}. The project manager has been told.`} onAnother={reset} />;
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Report Snag' }} />
      <ErrorBanner message={submitError ?? projects.error ?? (online ? null : 'You are offline. A snag is sent straight away, so it needs a connection.')} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} />
        <Input label="What is wrong" required value={title} onChangeText={setTitle} maxLength={200} placeholder="Toilet floor slopes away from the drain" error={errors.title} />
        <Input label="Where" value={location} onChangeText={setLocation} maxLength={200} placeholder="Block B, 2nd floor, toilet T4" />
        <Input label="Trade" value={trade} onChangeText={setTrade} maxLength={80} placeholder="Tiling, plaster, plumbing..." />
        <Chips label="Priority" value={priority} clearable={false} onChange={(v) => v && setPriority(v)} options={DEFECT_PRIORITIES.map((p) => ({ value: p, label: DEFECT_PRIORITY_LABELS[p] }))} />
        <Input label="Subcontractor to put it right" value={contractor} onChangeText={setContractor} maxLength={160} />
        <DatePicker label="Put right by" value={dueDate} onChange={setDueDate} error={errors.dueDate} />
        <Input label="Details" value={description} onChangeText={setDescription} multiline maxLength={2000} />
      </Card>
      <Card title="Photos">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title="Report" icon="send" onPress={submit} loading={busy} disabled={!online} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
