import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, ProgressEntryDto } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosUploading, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, isIsoDate, today } from '../../src/utils/format';

/** New progress entry, or (with `editId`) edit a draft / rejected / changes-requested entry and resubmit it. */
export default function NewProgressScreen() {
  const params = useLocalSearchParams<{ projectId?: string; activityId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const api = useApi();
  const projects = useProjectOptions();
  const existing = useFetch<ProgressEntryDto>((a) => a.get(`/progress/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

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
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  // Editing: prefill the form from the loaded entry.
  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setProjectId(e.projectId);
    setActivityId(e.activityId);
    setDate(e.date);
    setQuantity(e.quantity);
    setLocation(e.location ?? '');
    setManpower(e.manpowerCount === null ? '' : String(e.manpowerCount));
    setMachinery(e.machineryUsed ?? '');
    setRemarks(e.remarks ?? '');
    setPhotos(attachmentsToPhotos(e.attachments));
  }, [existing.data]);

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
      const blank = editId ? null : undefined;
      const body = {
        activityId,
        date,
        quantity: String(Number(quantity)),
        remarks: remarks.trim() || blank,
        location: location.trim() || blank,
        manpowerCount: manpower.trim() ? Number(manpower) : blank,
        machineryUsed: machinery.trim() || blank,
        attachmentIds: attachmentIds(photos),
      };
      const res = editId ? await api.patch<ProgressEntryDto>(`/progress/${editId}`, { ...body, submit: true }) : await api.post<ProgressEntryDto>('/progress', { projectId, ...body });
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
    return (
      <SubmitSuccess
        title={editId ? 'Progress resubmitted' : 'Progress submitted'}
        subtitle={`${created.activityName}: ${fmtQty(created.quantity)} ${created.unit} on ${created.date}. Sent for approval.`}
        detailHref={`/progress/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? 'Edit Progress Entry' : 'New Progress Entry' }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={changeProject} placeholder="Choose project" error={errors.projectId} disabled={!!editId} />
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
      <Button title={editId ? 'Resubmit for approval' : 'Submit for approval'} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityInfo: { backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: 10, marginBottom: spacing.lg, marginTop: -spacing.sm },
  strong: { fontWeight: '700', color: colors.text },
  bigInput: { fontSize: 22, fontWeight: '700' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
