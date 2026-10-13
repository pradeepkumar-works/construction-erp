import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, EquipmentDto, MachineryLogDto, Paginated } from '@erp/shared';
import { MAX_PAGE_SIZE, machineryLogProblem } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';

const NUM = /^\d+(\.\d+)?$/;

/** Log a machine's day (works offline through the outbox), or (with `editId`) fix a returned log and resubmit it. */
export default function NewMachineryLogScreen() {
  const params = useLocalSearchParams<{ projectId?: string; equipmentId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const api = useApi();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();
  const existing = useFetch<MachineryLogDto>((a) => a.get(`/machinery-logs/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });
  const fleet = useFetch<Paginated<EquipmentDto>>((a) => a.get('/equipment', { pageSize: MAX_PAGE_SIZE }), [], { refetchOnFocus: false, cacheKey: 'equipment:v1' });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [equipmentId, setEquipmentId] = useState<string | null>(params.equipmentId ?? null);
  const [date, setDate] = useState(today());
  const [worked, setWorked] = useState('');
  const [idle, setIdle] = useState('');
  const [down, setDown] = useState('');
  const [breakdownNote, setBreakdownNote] = useState('');
  const [meterStart, setMeterStart] = useState('');
  const [meterEnd, setMeterEnd] = useState('');
  const [diesel, setDiesel] = useState('');
  const [operator, setOperator] = useState('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [workDone, setWorkDone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<MachineryLogDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    const s = (v: string | null) => (v === null || Number(v) === 0 ? '' : v);
    setProjectId(e.projectId);
    setEquipmentId(e.equipmentId);
    setDate(e.date);
    setWorked(e.hoursWorked);
    setIdle(s(e.idleHours));
    setDown(s(e.breakdownHours));
    setBreakdownNote(e.breakdownNote ?? '');
    setMeterStart(e.meterStart ?? '');
    setMeterEnd(e.meterEnd ?? '');
    setDiesel(e.dieselLitres ?? '');
    setOperator(e.operatorName ?? '');
    setActivityId(e.activityId);
    setWorkDone(e.workDone ?? '');
    setRemarks(e.remarks ?? '');
    setPhotos(attachmentsToPhotos(e.attachments));
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(() => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.unit })), [activities.data]);

  // Machines at the chosen project first; the rest of the fleet after them.
  const equipmentOptions = useMemo<SelectOption[]>(() => {
    const all = fleet.data?.items ?? [];
    const here = all.filter((e) => e.projectId === projectId);
    const other = all.filter((e) => e.projectId !== projectId);
    return [...here, ...other].map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, hint: e.projectId === projectId ? 'At this project' : e.projectName ?? 'Yard / unassigned' }));
  }, [fleet.data, projectId]);
  const machine = fleet.data?.items.find((e) => e.id === equipmentId) ?? null;

  const changeProject = (id: string) => {
    setProjectId(id);
    setActivityId(null);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!equipmentId) e.equipmentId = 'Choose a machine';
    if (!isIsoDate(date)) e.date = 'Enter a valid date';
    if (!NUM.test(worked.trim())) e.worked = 'Enter the hours worked (0 if it did not work)';
    for (const [k, v] of [['idle', idle], ['down', down], ['meterStart', meterStart], ['meterEnd', meterEnd], ['diesel', diesel]] as const) if (v.trim() && !NUM.test(v.trim())) e[k] = 'Enter a number';
    if (Object.keys(e).length === 0) {
      const problem = machineryLogProblem({ hoursWorked: worked, idleHours: idle || 0, breakdownHours: down || 0, meterStart: meterStart || null, meterEnd: meterEnd || null, breakdownNote });
      if (problem) e.worked = problem;
    }
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    else if (editId && photosQueued(photos)) e.photos = 'Photos need a connection to upload before resubmitting';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const blank = editId ? null : undefined;
      const n = (v: string) => (v.trim() ? v.trim() : blank);
      const t = (v: string) => v.trim() || blank;
      const body = {
        equipmentId,
        date,
        hoursWorked: worked.trim(),
        idleHours: idle.trim() || '0',
        breakdownHours: down.trim() || '0',
        breakdownNote: Number(down) > 0 ? breakdownNote.trim() : blank,
        meterStart: n(meterStart),
        meterEnd: n(meterEnd),
        dieselLitres: n(diesel),
        operatorName: t(operator),
        activityId: activityId ?? blank,
        workDone: t(workDone),
        remarks: t(remarks),
      };
      if (editId) {
        setCreated(await api.patch<MachineryLogDto>(`/machinery-logs/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(
          await enqueue({
            type: 'MACHINERY',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${machine?.code ?? 'Machine'} · ${fmtQty(worked)} h`,
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<MachineryLogDto>('/machinery-logs', { projectId, ...body, attachmentIds: attachmentIds(photos) }));
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
    setCreated(null);
    setQueued(null);
    setEquipmentId(null);
    setWorked('');
    setIdle('');
    setDown('');
    setBreakdownNote('');
    setMeterStart('');
    setMeterEnd('');
    setDiesel('');
    setOperator('');
    setWorkDone('');
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? 'Machinery log resubmitted' : 'Machinery log submitted'}
        subtitle={`${created.equipmentCode}: ${fmtQty(created.hoursWorked)} h on ${created.date}. Sent for approval.`}
        detailHref={`/machinery/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? 'Edit Machinery Log' : 'Log Machinery' }} />
      <ErrorBanner message={submitError ?? projects.error ?? fleet.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={changeProject} placeholder="Choose project" error={errors.projectId} disabled={!!editId} />
        <Select
          label="Machine"
          required
          searchable
          value={equipmentId}
          options={equipmentOptions}
          onChange={setEquipmentId}
          placeholder={fleet.loading && !fleet.data ? 'Loading equipment…' : 'Choose machine'}
          error={errors.equipmentId}
          emptyText="No equipment yet; ask the PM to add it"
        />
        <DatePicker label="Date" required value={date} onChange={setDate} error={errors.date} />
        <View style={styles.row}>
          <View style={styles.cell}>
            <Input label="Worked (h)" required value={worked} onChangeText={setWorked} keyboardType="decimal-pad" placeholder="8" error={errors.worked} style={styles.bigInput} />
          </View>
          <View style={styles.cell}>
            <Input label="Idle (h)" value={idle} onChangeText={setIdle} keyboardType="decimal-pad" placeholder="0" error={errors.idle} />
          </View>
          <View style={styles.cell}>
            <Input label="Breakdown (h)" value={down} onChangeText={setDown} keyboardType="decimal-pad" placeholder="0" error={errors.down} />
          </View>
        </View>
        {Number(down) > 0 ? <Input label="What broke down" required value={breakdownNote} onChangeText={setBreakdownNote} placeholder="e.g. Hydraulic hose burst" /> : null}
      </Card>
      <Card title="Meter and diesel">
        <View style={styles.row}>
          <View style={styles.cell}>
            <Input label="Meter start" value={meterStart} onChangeText={setMeterStart} keyboardType="decimal-pad" error={errors.meterStart} />
          </View>
          <View style={styles.cell}>
            <Input label="Meter end" value={meterEnd} onChangeText={setMeterEnd} keyboardType="decimal-pad" error={errors.meterEnd} />
          </View>
        </View>
        <Input label="Diesel filled (litres)" value={diesel} onChangeText={setDiesel} keyboardType="decimal-pad" placeholder="e.g. 60" error={errors.diesel} />
      </Card>
      <Card title="Details (optional)">
        <Input label="Operator" value={operator} onChangeText={setOperator} />
        <Select label="Activity" value={activityId} options={activityOptions} onChange={setActivityId} placeholder={projectId ? 'Choose activity' : 'Choose a project first'} disabled={!projectId} emptyText="No activities in this project" />
        <Input label="Work done" value={workDone} onChangeText={setWorkDone} placeholder="e.g. Excavation for drain Ch. 2+400" />
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} multiline />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={editId ? 'Resubmit for approval' : 'Submit for approval'} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  bigInput: { fontSize: 20, fontWeight: '700' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
