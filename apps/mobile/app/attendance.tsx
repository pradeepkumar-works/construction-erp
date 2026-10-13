import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  DEPARTMENTAL_CONTRACTOR,
  MANPOWER_CATEGORIES,
  attendanceToManpower,
  canRecordAttendance,
  normalizeAttendanceLines,
  totalWorkers,
  type AttendanceDayDto,
  type AttendanceSheetDto,
  type AttendanceSuggestionsDto,
} from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, Screen, Select } from '../src/components';
import { QueuedSuccess, SubmitSuccess, useProjectOptions } from '../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../src/offline';
import { colors, radius, spacing, typography } from '../src/theme';
import { formatDate, isIsoDate, today } from '../src/utils/format';

interface TradeRow {
  key: string;
  category: string | null;
  count: string;
}
interface Group {
  key: string;
  contractor: string;
  rows: TradeRow[];
}

const newKey = () => Math.random().toString(36).slice(2, 9);
const emptyRow = (category: string | null = null): TradeRow => ({ key: newKey(), category, count: '' });
const defaultGroups = (): Group[] => [{ key: newKey(), contractor: DEPARTMENTAL_CONTRACTOR, rows: [emptyRow('Supervisor'), emptyRow('Helper')] }];

/** Sheet lines grouped by contractor, in first-appearance order. */
const toGroups = (sheet: AttendanceSheetDto): Group[] => {
  const groups: Group[] = [];
  for (const l of sheet.lines) {
    let g = groups.find((x) => x.contractor === l.contractor);
    if (!g) {
      g = { key: newKey(), contractor: l.contractor, rows: [] };
      groups.push(g);
    }
    g.rows.push({ key: newKey(), category: l.category, count: String(l.count) });
  }
  return groups.length ? groups : defaultGroups();
};

const toLines = (groups: Group[]) =>
  normalizeAttendanceLines(groups.flatMap((g) => g.rows.filter((r) => r.category && r.count.trim()).map((r) => ({ contractor: g.contractor, category: r.category as string, count: Number(r.count) }))));

/**
 * Daily attendance by contractor and trade for one project. Opens the day's existing sheet for correction
 * when there is one; a new sheet made without a connection waits in the outbox.
 */
export default function AttendanceScreen() {
  const params = useLocalSearchParams<{ projectId?: string; date?: string }>();
  const { user } = useAuth();
  const api = useApi();
  const { online, enqueue, items: outbox } = useOffline();
  const projects = useProjectOptions();
  const mayRecord = !!user && canRecordAttendance(user.roleKey);

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(params.date && isIsoDate(params.date) ? params.date : today());
  const [groups, setGroups] = useState<Group[]>(defaultGroups);
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<AttendanceSheetDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const validDay = !!projectId && isIsoDate(date);
  const day = useFetch<AttendanceDayDto>((a) => a.get('/attendance/day', { projectId: projectId!, date }), [projectId, date], { enabled: validDay, refetchOnFocus: false });
  const suggestions = useFetch<AttendanceSuggestionsDto>((a) => a.get('/attendance/suggestions', { projectId: projectId! }), [projectId], {
    enabled: !!projectId,
    refetchOnFocus: false,
    cacheKey: projectId ? `attendance-suggestions:${projectId}` : undefined,
  });

  const sheet = validDay && day.data && day.data.projectId === projectId && day.data.date === date ? day.data.sheet : null;
  const locked = !!(validDay && day.data?.locked);
  const queuedForDay = outbox.find((i) => i.type === 'ATTENDANCE' && i.payload.projectId === projectId && i.payload.date === date) ?? null;

  // Load the day's sheet into the form (or start a fresh one) whenever project or date change.
  useEffect(() => {
    if (!validDay || day.loading) return;
    if (sheet) {
      setGroups(toGroups(sheet));
      setRemarks(sheet.remarks ?? '');
    } else {
      setGroups(defaultGroups());
      setRemarks('');
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id, sheet?.updatedAt, projectId, date, day.loading]);

  const lines = useMemo(() => toLines(groups), [groups]);
  const total = totalWorkers(lines);
  const byTrade = attendanceToManpower(lines);

  const categoryOptions = useMemo(() => {
    const names = suggestions.data?.categories?.length ? suggestions.data.categories : MANPOWER_CATEGORIES;
    return names.map((c) => ({ value: c, label: c }));
  }, [suggestions.data]);
  const contractorNames = suggestions.data?.contractors ?? [DEPARTMENTAL_CONTRACTOR];

  const updateGroup = (key: string, patch: Partial<Group>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const updateRow = (gKey: string, rKey: string, patch: Partial<TradeRow>) =>
    setGroups((gs) => gs.map((g) => (g.key === gKey ? { ...g, rows: g.rows.map((r) => (r.key === rKey ? { ...r, ...patch } : r)) } : g)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = 'Choose a project';
    if (!isIsoDate(date)) e.date = 'Enter a valid date';
    else if (date > today()) e.date = 'Attendance cannot be recorded for a future date';
    for (const g of groups) {
      const used = g.rows.some((r) => r.category || r.count.trim());
      if (used && !g.contractor.trim()) e[`c-${g.key}`] = 'Enter the contractor';
      if (g.rows.some((r) => (r.category && !r.count.trim()) || (!r.category && r.count.trim()))) e[`r-${g.key}`] = 'Each row needs a trade and a count';
      if (g.rows.some((r) => r.count.trim() && !/^\d+$/.test(r.count.trim()))) e[`r-${g.key}`] = 'Counts must be whole numbers';
    }
    if (!lines.length && !remarks.trim()) e.lines = 'Enter at least one worker count, or a remark such as "Holiday"';
    if (!sheet && queuedForDay) e.date = 'Attendance for this day is already waiting in the outbox';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = { date, lines, remarks: remarks.trim() || null };
      if (sheet) {
        setSaved(await api.patch<AttendanceSheetDto>(`/attendance/${sheet.id}`, body));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(await enqueue({ type: 'ATTENDANCE', payload: { projectId, ...body }, photos: [], title: `Attendance · ${formatDate(date)}`, subtitle: `${projectName} · ${total} workers` }));
      };
      if (!online) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<AttendanceSheetDto>('/attendance', { projectId, ...body }));
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
    return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} note="It will be sent automatically as soon as the phone is back online. You can check it under Outbox." />;
  }
  if (saved) {
    return (
      <SubmitSuccess
        title="Attendance saved"
        subtitle={`${saved.projectName} · ${formatDate(saved.date)} · ${saved.totalWorkers} workers. The day's DPR takes its manpower from this sheet.`}
        onAnother={() => {
          setSaved(null);
          day.reload();
        }}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;

  const readOnly = !mayRecord || locked;
  const offlineUnknown = validDay && !online && !day.data;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: sheet ? 'Edit Attendance' : 'Attendance' }} />
      <ErrorBanner message={submitError ?? projects.error} />
      {!mayRecord ? <Notice icon="eye-outline" text="Your role can view attendance but not record it." /> : null}
      {locked ? <Notice icon="lock-closed-outline" text="The DPR for this day is approved, so its attendance is locked." /> : null}
      {offlineUnknown ? <Notice icon="cloud-offline-outline" text="Offline: a new sheet will wait in the outbox. If this day was already recorded, it will be refused when the phone reconnects." /> : null}
      <Card>
        <Select label="Project" required value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" error={errors.projectId} />
        <DatePicker label="Date" required value={date} onChange={setDate} error={errors.date} />
        {validDay && day.loading ? <Text style={typography.caption}>Checking this day…</Text> : null}
        {sheet ? (
          <Text style={typography.caption}>
            Recorded by {sheet.recordedByName}
            {sheet.updatedByName ? `, last changed by ${sheet.updatedByName}` : ''}. Saving updates this sheet.
          </Text>
        ) : null}
      </Card>

      {groups.map((g) => (
        <Card
          key={g.key}
          title={g.contractor.trim() === DEPARTMENTAL_CONTRACTOR ? 'Own workers' : 'Contractor workers'}
          right={
            groups.length > 1 && !readOnly ? (
              <Pressable onPress={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))} hitSlop={8} accessibilityLabel="Remove contractor">
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            ) : null
          }
        >
          <Input label="Contractor" value={g.contractor} onChangeText={(v) => updateGroup(g.key, { contractor: v })} placeholder="Labour contractor" error={errors[`c-${g.key}`]} editable={!readOnly} />
          {!readOnly && contractorNames.length > 1 ? (
            <Chips value={null} clearable={false} options={contractorNames.filter((c) => !groups.some((x) => x.contractor.trim() === c)).slice(0, 8).map((c) => ({ value: c, label: c }))} onChange={(v) => v && updateGroup(g.key, { contractor: v })} />
          ) : null}
          {g.rows.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.grow}>
                <Select value={r.category} options={r.category && !categoryOptions.some((o) => o.value === r.category) ? [...categoryOptions, { value: r.category, label: r.category }] : categoryOptions} onChange={(v) => updateRow(g.key, r.key, { category: v })} placeholder="Trade" disabled={readOnly} />
              </View>
              <Input value={r.count} onChangeText={(v) => updateRow(g.key, r.key, { count: v })} keyboardType="number-pad" placeholder="Nos" containerStyle={styles.small} editable={!readOnly} />
              {!readOnly ? (
                <Pressable onPress={() => updateGroup(g.key, { rows: g.rows.filter((x) => x.key !== r.key) })} style={styles.remove} hitSlop={8} accessibilityLabel="Remove row">
                  <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {errors[`r-${g.key}`] ? <Text style={styles.err}>{errors[`r-${g.key}`]}</Text> : null}
          {!readOnly ? <Button title="Add trade" variant="ghost" size="sm" icon="add" onPress={() => updateGroup(g.key, { rows: [...g.rows, emptyRow()] })} /> : null}
        </Card>
      ))}
      {!readOnly ? (
        <Button
          title="Add contractor"
          variant="secondary"
          icon="people-outline"
          size="sm"
          onPress={() => setGroups((gs) => [...gs, { key: newKey(), contractor: '', rows: [emptyRow('Mason'), emptyRow('Helper')] }])}
          style={styles.addContractor}
        />
      ) : null}

      <Card title="Total" right={<Text style={styles.total}>{total} workers</Text>}>
        {byTrade.length ? (
          <View style={styles.tags}>
            {byTrade.map((m) => (
              <View key={m.category} style={styles.tag}>
                <Text style={styles.tagText}>
                  {m.category} {m.count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={[typography.caption, styles.hint]}>These totals fill the manpower of this day's DPR.</Text>
        {errors.lines ? <Text style={styles.err}>{errors.lines}</Text> : null}
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="e.g. Holiday, rain stopped work at 3 pm" containerStyle={styles.last} editable={!readOnly} />
      </Card>
      {!readOnly ? <Button title={sheet ? 'Update attendance' : 'Save attendance'} icon="checkmark" onPress={save} loading={busy} disabled={validDay && day.loading} /> : null}
    </Screen>
  );
}

function Notice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name={icon} size={18} color={colors.text} />
      <Text style={[typography.caption, styles.noticeText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  last: { marginBottom: 0 },
  total: { ...typography.bodyStrong, color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, marginBottom: spacing.sm },
  small: { width: 84, marginBottom: spacing.sm },
  remove: { width: 32, height: 52, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: 13 },
  addContractor: { marginBottom: spacing.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  tag: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tagText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  hint: { marginBottom: spacing.md },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  noticeText: { flex: 1, color: colors.text },
});
