import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ProgressEntryDto } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosUploading, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, isIsoDate, today } from '../../src/utils/format';

export default function NewProgressScreen() {
  const params = useLocalSearchParams<{ projectId?: string; activityId?: string }>();
  const api = useApi();
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [activityId, setActivityId] = useState<string | null>(params.activityId ?? null);
  const [date, setDate] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [manpower, setManpower] = useState('');
  const [machinery, setMachinery] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ProgressEntryDto | null>(null);

  // Default to the only project when the user has just one.
  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false });
  const activityOptions = useMemo<SelectOption[]>(
    () => (activities.data ?? []).map((a) => ({ value: a.id, label: `${a.boqItemNo ? `${a.boqItemNo} · ` : ''}${a.name}`, hint: `${a.unit} · ${fmtQty(a.executedQty)} of ${fmtQty(a.plannedQty)} done (${Math.round(a.progressPct)}%)` })),
    [activities.data],
  );
  const activity = activities.data?.find((a) => a.id === activityId) ?? null;

  const changeProject = (id: string) => {
    setProjectId(id);
    setActivityId(null);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!activityId) e.activityId = 'Choose an activity';
    if (!isIsoDate(date)) e.date = 'Enter a valid date';
    const q = Number(quantity);
    if (!quantity.trim() || Number.isNaN(q) || q <= 0) e.quantity = 'Enter a quantity greater than 0';
    if (manpower.trim() && (!/^\d+$/.test(manpower.trim()) || Number(manpower) < 0)) e.manpower = 'Whole number';
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
      const body = {
        projectId,
        activityId,
        date,
        quantity: String(Number(quantity)),
        remarks: remarks.trim() || undefined,
        location: location.trim() || undefined,
        manpowerCount: manpower.trim() ? Number(manpower) : undefined,
        machineryUsed: machinery.trim() || undefined,
        attachmentIds: attachmentIds(photos),
      };
      const res = await api.post<ProgressEntryDto>('/progress', body);
      setCreated(res);
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCreated(null);
    setQuantity('');
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  if (created) {
    return <SubmitSuccess title="Progress submitted" subtitle={`${created.activityName}: ${fmtQty(created.quantity)} ${created.unit} on ${created.date}. Sent for approval.`} detailHref={`/progress/${created.id}`} onAnother={reset} />;
  }
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard>
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={changeProject} placeholder="Choose project" error={errors.projectId} />
        <Select
          label="Activity"
          required
          value={activityId}
          options={activityOptions}
          onChange={setActivityId}
          placeholder={!projectId ? 'Choose a project first' : activities.loading ? 'Loading activities…' : 'Choose activity'}
          disabled={!projectId || activities.loading}
          error={errors.activityId ?? activities.error}
          emptyText="No activities in this project"
        />
        {activity ? (
          <View style={styles.activityInfo}>
            <Text style={typography.caption}>
              Unit <Text style={styles.strong}>{activity.unit}</Text> · Planned <Text style={styles.strong}>{fmtQty(activity.plannedQty)}</Text> · Executed <Text style={styles.strong}>{fmtQty(activity.executedQty)}</Text> · Balance{' '}
              <Text style={styles.strong}>{fmtQty(Math.max(0, Number(activity.plannedQty) - Number(activity.executedQty)))}</Text>
            </Text>
          </View>
        ) : null}
        <DatePicker label="Date" required value={date} onChange={setDate} error={errors.date} />
        <Input
          label={`Quantity executed${activity ? ` (${activity.unit})` : ''}`}
          required
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          placeholder="e.g. 120"
          error={errors.quantity}
          style={styles.bigInput}
        />
      </Card>
      <Card title="Details (optional)">
        <Input label="Location / chainage" value={location} onChangeText={setLocation} placeholder="e.g. Km 14+200 to 14+600" />
        <Input label="Manpower count" value={manpower} onChangeText={setManpower} keyboardType="number-pad" placeholder="e.g. 18" error={errors.manpower} />
        <Input label="Machinery used" value={machinery} onChangeText={setMachinery} placeholder="e.g. Grader, Roller" />
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="Anything the PM should know" />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title="Submit for approval" icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityInfo: { backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: 10, marginBottom: spacing.lg, marginTop: -spacing.sm },
  strong: { fontWeight: '700', color: colors.text },
  bigInput: { fontSize: 22, fontWeight: '700' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
