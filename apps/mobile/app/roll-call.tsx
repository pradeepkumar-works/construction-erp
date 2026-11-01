import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { STAFF_ATTENDANCE_LABELS, STAFF_ATTENDANCE_STATUSES, manDays, type ActivityDto, type RollCallDto, type RollCallRowDto, type StaffAttendanceStatus } from '@erp/shared';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, Input, Loading, Screen, Select, useSnackbar } from '../src/components';
import { useProjectOptions } from '../src/forms/common';
import { DraftNotice, useFormDraft, useLeaveGuard } from '../src/forms/draft';
import { useT } from '../src/i18n/LanguageContext';
import { colors, spacing, typography } from '../src/theme';
import type { TranslateVars } from '../src/i18n/translate';
import { isIsoDate, today } from '../src/utils/format';

interface Mark {
  status: StaffAttendanceStatus | null;
  ot: string;
}

const fromRow = (r: RollCallRowDto): Mark => ({ status: r.status, ot: r.otHours ?? '' });

/**
 * The roll call of the named workers at one site for one day: mark each present, half day or absent,
 * with overtime. Saving also brings the day's head count in step. Needs a connection. A day nobody has marked yet is
 * kept on the phone as a draft while it is marked; changing a day already saved is not.
 */
export default function RollCallScreen() {
  const api = useApi();
  const t = useT();
  const snackbar = useSnackbar();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [activityId, setActivityId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const valid = !!projectId && isIsoDate(date) && date <= today();
  const roll = useFetch<RollCallDto>((a) => a.get('/workers/roll-call', { projectId: projectId!, date }), [projectId, date], { enabled: valid, refetchOnFocus: false });
  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false });
  const fresh = !roll.data || roll.data.rows.every((r) => !r.status);

  /** Marks of a restored draft, put on the roll once its day has loaded. */
  const restoredMarks = useRef<{ day: string; marks: Record<string, Mark> } | null>(null);
  const draft = useFormDraft<{ projectId: string | null; date: string; activityId: string | null; marks: Record<string, Mark> }>(
    fresh ? 'roll-call' : null,
    { projectId, date, activityId, marks },
    (d) => {
      setProjectId(d.projectId);
      setDate(d.date);
      setActivityId(d.activityId);
      setMarks(d.marks);
      restoredMarks.current = { day: `${d.projectId}|${d.date}`, marks: d.marks };
    },
  );
  useLeaveGuard(draft, { keepsDraft: fresh, busy });

  useEffect(() => {
    if (!projectId && projects.options.length) {
      // A project put back from a draft in the same frame wins.
      setProjectId((p) => p ?? projects.options[0].value);
      draft.settle();
    }
  }, [projects.options, projectId, draft.settle]);

  // The day's marks from the server; a restored draft's marks go on top when its day is still unmarked.
  useEffect(() => {
    if (!roll.data) return;
    const server = Object.fromEntries(roll.data.rows.map((r) => [r.workerId, fromRow(r)]));
    const kept = restoredMarks.current;
    if (kept && kept.day === `${roll.data.projectId}|${roll.data.date}`) {
      restoredMarks.current = null;
      if (roll.data.rows.every((r) => !r.status)) {
        setMarks({ ...server, ...Object.fromEntries(Object.entries(kept.marks).filter(([id]) => id in server)) });
        return;
      }
      setNotice(t('This day was marked on another phone while your draft waited, so the roll shows those marks.'));
      setMarks(server);
      draft.clear();
      return;
    }
    setMarks(server);
    // Loaded by itself: not a change of the user's to keep or warn about.
    draft.settle();
  }, [roll.data]);
  const startOver = () => {
    setActivityId(null);
    setMarks(Object.fromEntries((roll.data?.rows ?? []).map((r) => [r.workerId, fromRow(r)])));
    setNotice(null);
  };

  const rows = roll.data?.rows ?? [];
  const changed = useMemo(() => rows.filter((r) => marks[r.workerId] && (marks[r.workerId].status !== r.status || marks[r.workerId].ot !== (r.otHours ?? ''))), [rows, marks]);
  const locked = !!roll.data?.locked;
  // Stable, so a memoised row re-renders only when its own mark changes.
  const set = useCallback((id: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } })), []);

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
      draft.clear();
      roll.setData(d);
      const head = (d.headCount ?? []).reduce((s, l) => s + l.count, 0);
      snackbar.show(`${t('Roll call saved')}. ${t('Head count for the day: {n}', { n: head })}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const live = rows.map((r) => marks[r.workerId]?.status ?? null);
  const count = (s: StaffAttendanceStatus | null) => live.filter((x) => x === s).length;

  const statusOptions = useMemo(() => STAFF_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: t(STAFF_ATTENDANCE_LABELS[s]) })), [t]);

  const header = (
    <>
      <DraftNotice draft={draft} onStartOver={startOver} />
      {notice ? (
        <Card>
          <Text style={typography.caption}>{notice}</Text>
        </Card>
      ) : null}
      <Select label={t('Project')} value={projectId} options={projects.options} onChange={setProjectId} searchable />
      <DatePicker label={t('Date')} value={date} onChange={setDate} error={isIsoDate(date) && date > today() ? t('Choose a date up to today') : null} />
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
          <Text style={typography.caption}>{t('Payroll for this month is approved, so its roll call can no longer change.')}</Text>
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
    </>
  );

  // Up to a few hundred workers on a site: a virtualised list, with Save kept in reach below it.
  return (
    <Screen scroll={false} padded={false} keyboard>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.workerId}
        renderItem={({ item }) => <RollRow row={item} mark={marks[item.workerId]} locked={locked} options={statusOptions} onSet={set} t={t} />}
        extraData={marks}
        ListHeaderComponent={header}
        ListEmptyComponent={roll.data ? <EmptyState title={t('No workers posted to this site')} subtitle={t("Add the contractors' workers by name on the web, under Attendance.")} icon="people-outline" /> : null}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        refreshControl={<RefreshControl refreshing={roll.refreshing} onRefresh={roll.refresh} tintColor={colors.primary} />}
      />
      {rows.length && !locked ? (
        <View style={styles.actions}>
          <Button title={t('Mark the rest present')} variant="secondary" onPress={restPresent} style={styles.flex} />
          <Button title={changed.length ? t('Save ({n})', { n: changed.length }) : t('Save')} loading={busy} disabled={!changed.length} onPress={() => void save()} style={styles.flex} />
        </View>
      ) : null}
    </Screen>
  );
}

/** One worker on the roll; memoised so marking one of 300 redraws only that row. */
const RollRow = memo(function RollRow({
  row: r,
  mark: m,
  locked,
  options,
  onSet,
  t,
}: {
  row: RollCallRowDto;
  mark: Mark | undefined;
  locked: boolean;
  options: { value: StaffAttendanceStatus; label: string }[];
  onSet: (id: string, patch: Partial<Mark>) => void;
  t: (en: string, vars?: TranslateVars) => string;
}) {
  return (
    <View style={styles.row}>
      <Text style={typography.bodyStrong}>{r.name}</Text>
      <Text style={typography.caption}>
        {r.workerNo} · {r.trade} · {r.contractor}
        {r.activityName ? ` · ${r.activityName}` : ''}
      </Text>
      <Chips groupLabel={r.name} value={m?.status ?? null} onChange={(v) => !locked && onSet(r.workerId, { status: v })} options={options} />
      {m && m.status && m.status !== 'ABSENT' ? (
        <Input
          label={t('Overtime hours')}
          accessibilityLabel={t('Overtime hours for {name}', { name: r.name })}
          value={m.ot}
          onChangeText={(v) => onSet(r.workerId, { ot: v.replace(/[^0-9.]/g, '') })}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="0"
          editable={!locked}
          containerStyle={styles.ot}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  summary: { marginBottom: spacing.sm },
  ot: { marginTop: spacing.sm, marginBottom: 0 },
  // Pinned under the list, so Save is one tap away however far down the roll the user is.
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
