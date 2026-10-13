import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MANPOWER_CATEGORIES, WEATHER_LABELS, WEATHER_OPTIONS, type DailyReportDto, type Weather } from '@erp/shared';
import { useApi } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosUploading, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
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
const WEATHER_CHIPS = WEATHER_OPTIONS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }));

export default function NewDprScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const projects = useProjectOptions();

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

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const totalManpower = useMemo(() => manpower.reduce((s, r) => s + (Number(r.count) || 0), 0), [manpower]);

  const updateMan = (key: string, patch: Partial<ManpowerRow>) => setManpower((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
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
        date,
        weather: weather ?? undefined,
        siteCondition: siteCondition.trim() || undefined,
        manpower: manpower.filter((r) => r.category && r.count.trim()).map((r) => ({ category: r.category as string, count: Number(r.count) })),
        machinery: machinery.filter((r) => r.name.trim() && r.hours.trim()).map((r) => ({ name: r.name.trim(), hours: Number(r.hours) })),
        materialReceived: materialReceived.trim() || undefined,
        workExecuted: workExecuted.trim(),
        testsConducted: tests.trim() || undefined,
        safetyObservations: safety.trim() || undefined,
        issues: issues.trim() || undefined,
        nextDayPlan: nextDayPlan.trim() || undefined,
        attachmentIds: attachmentIds(photos),
      };
      setCreated(await api.post<DailyReportDto>('/dpr', body));
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return <SubmitSuccess title="DPR submitted" subtitle={`${created.projectName} · ${formatDate(created.date)} · ${created.totalManpower} manpower. Sent for approval.`} detailHref={`/dpr/${created.id}`} />;
  }
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard>
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} />
        <DatePicker label="Report date" required value={date} onChange={setDate} error={errors.date} />
        <Chips label="Weather" value={weather} options={WEATHER_CHIPS} onChange={setWeather} />
        <Input label="Site condition" value={siteCondition} onChangeText={setSiteCondition} placeholder="e.g. Workable, waterlogged at Km 16" containerStyle={styles.last} />
      </Card>

      <Card title="Manpower" right={<Text style={styles.total}>Total {totalManpower}</Text>}>
        {manpower.map((r) => (
          <View key={r.key} style={styles.row}>
            <View style={styles.grow}>
              <Select value={r.category} options={CATEGORY_OPTIONS} onChange={(v) => updateMan(r.key, { category: v })} placeholder="Category" />
            </View>
            <Input value={r.count} onChangeText={(v) => updateMan(r.key, { count: v })} keyboardType="number-pad" placeholder="Nos" containerStyle={styles.small} />
            <RemoveBtn onPress={() => setManpower((rows) => rows.filter((x) => x.key !== r.key))} />
          </View>
        ))}
        {errors.manpower ? <Text style={styles.err}>{errors.manpower}</Text> : null}
        <Button title="Add category" variant="ghost" size="sm" icon="add" onPress={() => setManpower((rows) => [...rows, { key: newKey(), category: null, count: '' }])} />
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
      <Button title="Submit DPR for approval" icon="send" onPress={submit} loading={busy} />
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
});
