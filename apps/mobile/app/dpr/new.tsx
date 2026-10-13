import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MANPOWER_CATEGORIES, WEATHER_LABELS, WEATHER_OPTIONS, attendanceToManpower, type AttendanceDayDto, type AttendanceLineInput, type DailyReportDto, type ManpowerLine, type Weather } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';

interface ManpowerRow {
  key: string;
  category: string | null;
  count: string;
}
interface MachineryRow {
  key: string;
  name: string;
  hours: string;
}

const newKey = () => Math.random().toString(36).slice(2, 9);
const CATEGORY_OPTIONS = MANPOWER_CATEGORIES.map((c) => ({ value: c, label: c }));
/** Keep a free-text value (e.g. a trade typed on the web) selectable even when it is not in the standard list. */
const withValue = (options: { value: string; label: string }[], value: string | null) => (value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options);
const WEATHER_CHIPS = WEATHER_OPTIONS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }));

/** New DPR, or (with `editId`) edit a draft / rejected / changes-requested DPR and resubmit it. */
export default function NewDprScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const api = useApi();
  const { online, enqueue, items: outbox } = useOffline();
  const projects = useProjectOptions();
  const existing = useFetch<DailyReportDto>((a) => a.get(`/dpr/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [siteCondition, setSiteCondition] = useState('');
  const [manpower, setManpower] = useState<ManpowerRow[]>([{ key: newKey(), category: 'Mason', count: '' }, { key: newKey(), category: 'Helper', count: '' }]);
  const [machinery, setMachinery] = useState<MachineryRow[]>([{ key: newKey(), name: '', hours: '' }]);
  const [materialReceived, setMaterialReceived] = useState('');
  const [workExecuted, setWorkExecuted] = useState('');
  const [tests, setTests] = useState('');
  const [safety, setSafety] = useState('');
  const [issues, setIssues] = useState('');
  const [nextDayPlan, setNextDayPlan] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<DailyReportDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  // Editing: prefill the form from the loaded report.
  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setProjectId(e.projectId);
    setDate(e.date);
    setWeather(e.weather);
    setSiteCondition(e.siteCondition ?? '');
    setManpower(e.manpower.length ? e.manpower.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })) : [{ key: newKey(), category: null, count: '' }]);
    setMachinery(e.machinery.length ? e.machinery.map((m) => ({ key: newKey(), name: m.name, hours: String(m.hours) })) : [{ key: newKey(), name: '', hours: '' }]);
    setMaterialReceived(e.materialReceived ?? '');
    setWorkExecuted(e.workExecuted);
    setTests(e.testsConducted ?? '');
    setSafety(e.safetyObservations ?? '');
    setIssues(e.issues ?? '');
    setNextDayPlan(e.nextDayPlan ?? '');
    setPhotos(attachmentsToPhotos(e.attachments));
  }, [existing.data]);

  const totalManpower = useMemo(() => manpower.reduce((s, r) => s + (Number(r.count) || 0), 0), [manpower]);

  // New DPR: manpower comes from the day's attendance (on the server, or still in this phone's outbox)
  // until the user edits it by hand.
  const [manpowerEdited, setManpowerEdited] = useState(false);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const attendanceDay = useFetch<AttendanceDayDto>((a) => a.get('/attendance/day', { projectId: projectId!, date }), [projectId, date], {
    enabled: !editId && !!projectId && isIsoDate(date) && online,
    refetchOnFocus: false,
  });
  const attendance = useMemo<{ id: string; manpower: ManpowerLine[]; text: string } | null>(() => {
    if (editId || !projectId) return null;
    const sheet = attendanceDay.data?.projectId === projectId && attendanceDay.data.date === date ? attendanceDay.data.sheet : null;
    if (sheet?.manpower.length) return { id: sheet.id, manpower: sheet.manpower, text: `From attendance: ${sheet.totalWorkers} workers recorded by ${sheet.recordedByName}` };
    const queuedSheet = outbox.find((i) => i.type === 'ATTENDANCE' && i.payload.projectId === projectId && i.payload.date === date);
    const lines = (queuedSheet?.payload.lines as AttendanceLineInput[] | undefined) ?? [];
    if (queuedSheet && lines.length) return { id: queuedSheet.id, manpower: attendanceToManpower(lines), text: 'From attendance saved on this phone' };
    return null;
  }, [editId, projectId, date, attendanceDay.data, outbox]);
  const applyAttendance = (a: NonNullable<typeof attendance>) => {
    setManpower(a.manpower.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })));
    setFilledFrom(a.id);
    setManpowerEdited(false);
  };
  useEffect(() => {
    if (attendance && !manpowerEdited && filledFrom !== attendance.id) applyAttendance(attendance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, manpowerEdited, filledFrom]);

  const updateMan = (key: string, patch: Partial<ManpowerRow>) => {
    setManpowerEdited(true);
    setManpower((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const updateMach = (key: string, patch: Partial<MachineryRow>) => setMachinery((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!isIsoDate(date)) e.date = 'Enter a valid date';
    if (!workExecuted.trim()) e.workExecuted = 'Describe the work executed today';
    for (const r of manpower) {
      if ((r.category && r.count.trim()) || (!r.category && !r.count.trim())) continue;
      e.manpower = 'Each manpower row needs a category and a count';
    }
    if (manpower.some((r) => r.count.trim() && !/^\d+$/.test(r.count.trim()))) e.manpower = 'Manpower counts must be whole numbers';
    for (const r of machinery) {
      if ((r.name.trim() && r.hours.trim()) || (!r.name.trim() && !r.hours.trim())) continue;
      e.machinery = 'Each machinery row needs a name and hours';
    }
    if (machinery.some((r) => r.hours.trim() && Number.isNaN(Number(r.hours)))) e.machinery = 'Hours must be a number';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    else if (editId && photosQueued(photos)) e.photos = 'Photos need a connection to upload before resubmitting';
    if (!editId && outbox.some((i) => i.type === 'DPR' && i.payload.projectId === projectId && i.payload.date === date)) e.date = 'A DPR for this date is already waiting in the outbox';
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
        date,
        weather: weather ?? blank,
        siteCondition: siteCondition.trim() || blank,
        manpower: manpower.filter((r) => r.category && r.count.trim()).map((r) => ({ category: r.category as string, count: Number(r.count) })),
        machinery: machinery.filter((r) => r.name.trim() && r.hours.trim()).map((r) => ({ name: r.name.trim(), hours: Number(r.hours) })),
        materialReceived: materialReceived.trim() || blank,
        workExecuted: workExecuted.trim(),
        testsConducted: tests.trim() || blank,
        safetyObservations: safety.trim() || blank,
        issues: issues.trim() || blank,
        nextDayPlan: nextDayPlan.trim() || blank,
      };
      if (editId) {
        setCreated(await api.patch<DailyReportDto>(`/dpr/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(
          await enqueue({
            type: 'DPR',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `DPR · ${formatDate(date)}`,
            subtitle: `${projectName} · ${totalManpower} manpower`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<DailyReportDto>('/dpr', { projectId, ...body, attachmentIds: attachmentIds(photos) }));
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

  if (queued) {
    return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} />;
  }
  if (created) {
    return <SubmitSuccess title={editId ? 'DPR resubmitted' : 'DPR submitted'} subtitle={`${created.projectName} · ${formatDate(created.date)} · ${created.totalManpower} manpower. Sent for approval.`} detailHref={`/dpr/${created.id}`} />;
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? 'Edit Daily Report' : 'New Daily Report' }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} disabled={!!editId} />
        <DatePicker label="Report date" required value={date} onChange={setDate} error={errors.date} />
        <Chips label="Weather" value={weather} options={WEATHER_CHIPS} onChange={setWeather} />
        <Input label="Site condition" value={siteCondition} onChangeText={setSiteCondition} placeholder="e.g. Workable, waterlogged at Km 16" containerStyle={styles.last} />
      </Card>

      <Card title="Manpower" right={<Text style={styles.total}>Total {totalManpower}</Text>}>
        {attendance ? (
          filledFrom === attendance.id && !manpowerEdited ? (
            <Text style={styles.fromAttendance}>{attendance.text}</Text>
          ) : (
            <Button title="Use attendance figures" variant="ghost" size="sm" icon="people-outline" onPress={() => applyAttendance(attendance)} />
          )
        ) : null}
        {manpower.map((r) => (
          <View key={r.key} style={styles.row}>
            <View style={styles.grow}>
              <Select value={r.category} options={withValue(CATEGORY_OPTIONS, r.category)} onChange={(v) => updateMan(r.key, { category: v })} placeholder="Category" />
            </View>
            <Input value={r.count} onChangeText={(v) => updateMan(r.key, { count: v })} keyboardType="number-pad" placeholder="Nos" containerStyle={styles.small} />
            <RemoveBtn
              onPress={() => {
                setManpowerEdited(true);
                setManpower((rows) => rows.filter((x) => x.key !== r.key));
              }}
            />
          </View>
        ))}
        {errors.manpower ? <Text style={styles.err}>{errors.manpower}</Text> : null}
        <Button
          title="Add category"
          variant="ghost"
          size="sm"
          icon="add"
          onPress={() => {
            setManpowerEdited(true);
            setManpower((rows) => [...rows, { key: newKey(), category: null, count: '' }]);
          }}
        />
      </Card>

      <Card title="Machinery">
        {machinery.map((r) => (
          <View key={r.key} style={styles.row}>
            <Input value={r.name} onChangeText={(v) => updateMach(r.key, { name: v })} placeholder="e.g. Excavator" containerStyle={styles.grow} />
            <Input value={r.hours} onChangeText={(v) => updateMach(r.key, { hours: v })} keyboardType="decimal-pad" placeholder="Hrs" containerStyle={styles.small} />
            <RemoveBtn onPress={() => setMachinery((rows) => rows.filter((x) => x.key !== r.key))} />
          </View>
        ))}
        {errors.machinery ? <Text style={styles.err}>{errors.machinery}</Text> : null}
        <Button title="Add machine" variant="ghost" size="sm" icon="add" onPress={() => setMachinery((rows) => [...rows, { key: newKey(), name: '', hours: '' }])} />
      </Card>

      <Card title="Work">
        <Input label="Work executed" required value={workExecuted} onChangeText={setWorkExecuted} multiline placeholder="What was done today, where, and how much" error={errors.workExecuted} />
        <Input label="Material received" value={materialReceived} onChangeText={setMaterialReceived} multiline placeholder="e.g. 200 bags cement, 20 MT steel" />
        <Input label="Tests conducted" value={tests} onChangeText={setTests} multiline placeholder="e.g. Cube test, FDD" />
        <Input label="Safety observations" value={safety} onChangeText={setSafety} multiline placeholder="Toolbox talk, PPE, incidents" />
        <Input label="Issues / hindrances" value={issues} onChangeText={setIssues} multiline placeholder="Anything blocking work" />
        <Input label="Next-day plan" value={nextDayPlan} onChangeText={setNextDayPlan} multiline placeholder="Planned activities for tomorrow" />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={editId ? 'Resubmit DPR for approval' : 'Submit DPR for approval'} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

function RemoveBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.remove} hitSlop={8} accessibilityLabel="Remove row">
      <Ionicons name="trash-outline" size={20} color={colors.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  last: { marginBottom: 0 },
  total: { ...typography.bodyStrong, color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, marginBottom: spacing.sm },
  small: { width: 84, marginBottom: spacing.sm },
  remove: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: 13 },
  fromAttendance: { ...typography.caption, color: colors.success, marginBottom: spacing.sm },
});
