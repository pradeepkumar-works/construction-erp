import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { STAFF_ATTENDANCE_LABELS, STAFF_ATTENDANCE_STATUSES, manDays, type ActivityDto, type RollCallDto, type RollCallRowDto, type StaffAttendanceStatus } from '@erp/shared';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, Input, Loading, Screen, Select } from '../src/components';
import { useProjectOptions } from '../src/forms/common';
import { useT } from '../src/i18n/LanguageContext';
import { colors, spacing, typography } from '../src/theme';
import { isIsoDate, today } from '../src/utils/format';

interface Mark {
  status: StaffAttendanceStatus | null;
  ot: string;
}

const fromRow = (r: RollCallRowDto): Mark => ({ status: r.status, ot: r.otHours ?? '' });

/**
 * The roll call of the named workers at one site for one day (v4 item 44): mark each present, half day or absent,
 * with overtime. Saving also brings the day's head count in step. Needs a connection.
 */
export default function RollCallScreen() {
  const api = useApi();
  const t = useT();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [activityId, setActivityId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const valid = !!projectId && isIsoDate(date) && date <= today();
  const roll = useFetch<RollCallDto>((a) => a.get('/workers/roll-call', { projectId: projectId!, date }), [projectId, date], { enabled: valid, refetchOnFocus: false });
  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false });
  useEffect(() => {
    setMarks(Object.fromEntries((roll.data?.rows ?? []).map((r) => [r.workerId, fromRow(r)])));
  }, [roll.data]);

  const rows = roll.data?.rows ?? [];
  const changed = useMemo(() => rows.filter((r) => marks[r.workerId] && (marks[r.workerId].status !== r.status || marks[r.workerId].ot !== (r.otHours ?? ''))), [rows, marks]);
  const locked = !!roll.data?.locked;
  const set = (id: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const restPresent = () =>
    setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, x.status ? x : { ...x, status: 'PRESENT' as const }])));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const entries = changed.map((r) => {
        const m = marks[r.workerId];
        const ot = m.ot.trim() === '' ? null : Number(m.ot);
        return {
          workerId: r.workerId,
          status: m.status,
          inTime: r.inTime,
          outTime: r.outTime,
          otHours: ot !== null && Number.isFinite(ot) ? ot : null,
          activityId: m.status && m.status !== 'ABSENT' ? (activityId ?? r.activityId) : null,
          note: r.note,
        };
      });
      const d = await api.put<RollCallDto>('/workers/roll-call', { projectId, date, entries });
      roll.setData(d);
      const head = (d.headCount ?? []).reduce((s, l) => s + l.count, 0);
      Alert.alert(t('Roll call saved'), t('Head count for the day: {n}', { n: head }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const live = rows.map((r) => marks[r.workerId]?.status ?? null);
  const count = (s: StaffAttendanceStatus | null) => live.filter((x) => x === s).length;

  const row = (r: RollCallRowDto) => {
    const m = marks[r.workerId];
    return (
      <View key={r.workerId} style={styles.row}>
        <Text style={typography.bodyStrong}>{r.name}</Text>
        <Text style={typography.caption}>
          {r.workerNo} · {r.trade} · {r.contractor}
          {r.activityName ? ` · ${r.activityName}` : ''}
        </Text>
        <Chips
          value={m?.status ?? null}
          onChange={(v) => !locked && set(r.workerId, { status: v })}
          options={STAFF_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: t(STAFF_ATTENDANCE_LABELS[s]) }))}
        />
        {m && m.status && m.status !== 'ABSENT' ? (
          <Input label={t('Overtime hours')} value={m.ot} onChangeText={(v) => set(r.workerId, { ot: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="0" editable={!locked} containerStyle={styles.ot} />
        ) : null}
      </View>
    );
  };

  return (
    <Screen refreshing={roll.refreshing} onRefresh={roll.refresh}>
      <Select label={t('Project')} value={projectId} options={projects.options} onChange={setProjectId} searchable />
      <DatePicker label={t('Date')} value={date} onChange={setDate} error={isIsoDate(date) && date > today() ? t('Not a future day') : null} />
      <Select
        label={t('Working on (for those you mark)')}
        value={activityId}
        options={(activities.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
        onChange={setActivityId}
        searchable
        placeholder={t("Keep each worker's activity")}
      />
      <ErrorBanner message={error ?? roll.error} />
      {locked ? (
        <Card>
          <Text style={typography.caption}>{t('The DPR for this day is approved, so its roll call can no longer change.')}</Text>
        </Card>
      ) : null}
      {roll.data ? (
        <Text style={[typography.caption, styles.summary]}>
          {t('{total} on the roll · {present} present · {half} half day · {absent} absent · {unmarked} not marked · {md} man-days', {
            total: rows.length,
            present: count('PRESENT'),
            half: count('HALF_DAY'),
            absent: count('ABSENT'),
            unmarked: count(null),
            md: live.reduce((s, x) => s + manDays(x), 0),
          })}
        </Text>
      ) : null}
      {roll.loading && !roll.data ? <Loading /> : null}
      {roll.data && !rows.length ? <EmptyState title={t('No workers posted to this site')} subtitle={t("Add the contractors' workers by name on the web, under Attendance.")} icon="people-outline" /> : null}
      {rows.map(row)}
      {rows.length && !locked ? (
        <View style={styles.actions}>
          <Button title={t('Mark the rest present')} variant="secondary" onPress={restPresent} />
          <Button title={changed.length ? t('Save ({n})', { n: changed.length }) : t('Save')} loading={busy} disabled={!changed.length} onPress={() => void save()} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  summary: { marginBottom: spacing.sm },
  ot: { marginTop: spacing.sm, marginBottom: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
});
