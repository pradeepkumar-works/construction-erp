import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  type AttendanceLineInput,
  type AttendanceSheetDto,
  type AttendanceSuggestionsDto,
} from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, Input, Loading, Screen, Select, IconButton } from '../src/components';
import { QueuedSuccess, SubmitSuccess, useProjectOptions } from '../src/forms/common';
import { DraftNotice, useFormDraft, useLeaveGuard } from '../src/forms/draft';
import { OutboxRefusal, useOutboxEntry } from '../src/forms/edit';
import { ErrorSummary, useErrorSummary } from '../src/forms/errors';
import { useT } from '../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../src/offline';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../src/theme';
import { formatDate, isIsoDate, today } from '../src/utils/format';
import { useFieldChain } from '../src/forms/keyboard';

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
const toGroups = (lines: AttendanceLineInput[]): Group[] => {
  const groups: Group[] = [];
  for (const l of lines) {
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
 * when there is one; a new sheet made without a connection waits in the outbox, and is kept on the phone as a draft
 * while it is typed. With `outboxId` it opens a sheet the server refused (usually because the day was recorded on
 * another phone meanwhile), to correct and send again.
 */
export default function AttendanceScreen() {
  const params = useLocalSearchParams<{ projectId?: string; date?: string; outboxId?: string }>();
  const outboxId = params.outboxId ?? null;
  const { user } = useAuth();
  const t = useT();
  const field = useFieldChain();
  const api = useApi();
  const { online, enqueue, discard, newId, items: outbox } = useOffline();
  const refused = useOutboxEntry(outboxId);
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice.
  const clientId = useRef(outboxId ?? newId());
  const errorSummary = useErrorSummary();
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
  const [notice, setNotice] = useState<string | null>(null);
  /** "project|date" of a day whose new sheet the form holds by itself (a restored draft or a refused entry): loading that day keeps it. */
  const keepFor = useRef<string | null>(null);
  /** The form shows a sheet from the server (rather than a new one). */
  const showsSheet = useRef(false);

  const validDay = !!projectId && isIsoDate(date);
  const day = useFetch<AttendanceDayDto>((a) => a.get('/attendance/day', { projectId: projectId!, date }), [projectId, date], { enabled: validDay, refetchOnFocus: false });
  const suggestions = useFetch<AttendanceSuggestionsDto>((a) => a.get('/attendance/suggestions', { projectId: projectId! }), [projectId], {
    enabled: !!projectId,
    refetchOnFocus: false,
    cacheKey: projectId ? `attendance-suggestions:${projectId}` : undefined,
  });

  const sheet = validDay && day.data && day.data.projectId === projectId && day.data.date === date ? day.data.sheet : null;
  const locked = !!(validDay && day.data?.locked);
  const queuedForDay = outbox.find((i) => i.id !== outboxId && i.type === 'ATTENDANCE' && i.payload.projectId === projectId && i.payload.date === date) ?? null;

  // A new sheet is kept as a draft (with its project and day); a sheet already on the server, or a refused one, is not.
  const draft = useFormDraft<{ projectId: string | null; date: string; groups: Group[]; remarks: string }>(
    outboxId || sheet ? null : 'attendance',
    { projectId, date, groups, remarks },
    (d) => {
      setProjectId(d.projectId);
      setDate(d.date);
      setGroups(d.groups.length ? d.groups : defaultGroups());
      setRemarks(d.remarks);
      keepFor.current = `${d.projectId}|${d.date}`;
      showsSheet.current = false;
    },
  );
  useLeaveGuard(draft, { keepsDraft: !outboxId && !sheet, busy });
  const startOver = () => {
    setGroups(defaultGroups());
    setRemarks('');
    setErrors({});
    setNotice(null);
  };

  useEffect(() => {
    if (!outboxId && !projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      draft.settle();
    }
  }, [outboxId, projects.options, projectId, draft.settle]);

  // Fixing a refused outbox entry: fill the form from what was queued.
  const [refusedLoaded, setRefusedLoaded] = useState(false);
  useEffect(() => {
    if (!refused || refusedLoaded) return;
    const p = refused.payload as { projectId: string; date: string; lines?: AttendanceLineInput[]; remarks?: string | null };
    setProjectId(p.projectId);
    setDate(p.date);
    setGroups(toGroups(p.lines ?? []));
    setRemarks(p.remarks ?? '');
    keepFor.current = `${p.projectId}|${p.date}`;
    showsSheet.current = false;
    setRefusedLoaded(true);
    draft.settle();
  }, [refused, refusedLoaded, draft.settle]);

  // Load the day's sheet into the form whenever project or date change. A new sheet being typed stays as it is
  // when only the day changes, and a form that showed a recorded sheet starts a fresh one on a day without one.
  useEffect(() => {
    if (!validDay || day.loading) return;
    if (keepFor.current === `${projectId}|${date}`) {
      keepFor.current = null;
      // A refused sheet stays as queued: saving it replaces the day's sheet, if there is one now.
      if (!sheet || outboxId) return;
      // The draft's day was recorded on another phone while the draft waited: show that sheet instead.
      setGroups(toGroups(sheet.lines));
      setRemarks(sheet.remarks ?? '');
      showsSheet.current = true;
      setNotice(t('{name} recorded this day while your draft waited on this phone, so the form shows their sheet.', { name: sheet.recordedByName }));
      setErrors({});
      draft.clear();
      return;
    }
    if (sheet) {
      setGroups(toGroups(sheet.lines));
      setRemarks(sheet.remarks ?? '');
      showsSheet.current = true;
    } else if (showsSheet.current) {
      setGroups(defaultGroups());
      setRemarks('');
      showsSheet.current = false;
    } else return;
    setErrors({});
    setNotice(null);
    // Filled in by itself: not a change of the user's to keep or warn about. A restored draft that is no longer on
    // screen is dropped, so an empty sheet never replaces it on the phone.
    if (draft.restoredAt && !sheet) draft.clear();
    else draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id, sheet?.updatedAt, projectId, date, day.loading]);

  const lines = useMemo(() => toLines(groups), [groups]);
  const total = totalWorkers(lines);
  const byTrade = attendanceToManpower(lines);

  const categoryOptions = useMemo(() => {
    const names = suggestions.data?.categories?.length ? suggestions.data.categories : MANPOWER_CATEGORIES;
    return names.map((c) => ({ value: c, label: t(c) }));
  }, [suggestions.data, t]);
  const contractorNames = suggestions.data?.contractors ?? [DEPARTMENTAL_CONTRACTOR];

  const updateGroup = (key: string, patch: Partial<Group>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const updateRow = (gKey: string, rKey: string, patch: Partial<TradeRow>) =>
    setGroups((gs) => gs.map((g) => (g.key === gKey ? { ...g, rows: g.rows.map((r) => (r.key === rKey ? { ...r, ...patch } : r)) } : g)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!isIsoDate(date)) e.date = t('Pick the date from the calendar');
    else if (date > today()) e.date = t('Attendance cannot be recorded for a future date');
    for (const g of groups) {
      const used = g.rows.some((r) => r.category || r.count.trim());
      if (used && !g.contractor.trim()) e[`c-${g.key}`] = t('Enter the contractor');
      if (g.rows.some((r) => (r.category && !r.count.trim()) || (!r.category && r.count.trim()))) e[`r-${g.key}`] = t('Choose a trade and enter a count in each row');
      if (g.rows.some((r) => r.count.trim() && !/^\d+$/.test(r.count.trim()))) e[`r-${g.key}`] = t('Enter counts as whole numbers');
    }
    if (!lines.length && !remarks.trim()) e.lines = t('Enter at least one worker count, or a remark such as "Holiday"');
    if (!sheet && queuedForDay) e.date = t('Attendance for this day is already waiting in the outbox');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = { date, lines, remarks: remarks.trim() || null };
      if (sheet) {
        const updated = await api.patch<AttendanceSheetDto>(`/attendance/${sheet.id}`, body);
        draft.clear();
        if (outboxId) await discard(outboxId);
        setSaved(updated);
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        draft.clear();
        setQueued(await enqueue({ id: clientId.current, type: 'ATTENDANCE', payload: { projectId, ...body }, photos: [], title: `${t('Attendance')} · ${formatDate(date)}`, subtitle: `${projectName} · ${t('{n} workers', { n: total })}` }));
      };
      if (!online) {
        await queueIt();
        return;
      }
      try {
        const created = await api.post<AttendanceSheetDto>('/attendance', { id: clientId.current, projectId, ...body });
        draft.clear();
        if (outboxId) await discard(outboxId);
        setSaved(created);
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
    return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} note={t('It will be sent automatically as soon as the phone is back online. You can check it under Outbox.')} />;
  }
  if (saved) {
    return (
      <SubmitSuccess
        title={t('Attendance saved')}
        subtitle={`${saved.projectName} · ${formatDate(saved.date)} · ${t("{n} workers. The day's DPR takes its manpower from this sheet.", { n: saved.totalWorkers })}`}
        onAnother={() => {
          clientId.current = newId();
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
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: refused ? t('Fix attendance') : sheet ? t('Edit attendance') : t('Labour attendance') }} />
      {!sheet ? <DraftNotice draft={draft} onStartOver={startOver} /> : null}
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <OutboxRefusal item={refused} />
      {notice ? <Notice icon="information-circle-outline" text={notice} /> : null}
      {!mayRecord ? <Notice icon="eye-outline" text={t('Your role can view attendance but not record it.')} /> : null}
      {locked ? <Notice icon="lock-closed-outline" text={t('Payroll for this month is approved, so its attendance is locked.')} /> : null}
      {offlineUnknown ? <Notice icon="cloud-offline-outline" text={t('Offline: a new sheet will wait in the outbox. If this day was already recorded, it will be refused when the phone reconnects.')} /> : null}
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} />
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        {validDay && day.loading ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Checking this day…')}</Text> : null}
        {sheet && refused ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('{name} has already recorded this day. Saving replaces that sheet with the figures below.', { name: sheet.recordedByName })}</Text>
        ) : sheet ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
            {sheet.updatedByName
              ? t('Recorded by {name}, last changed by {editor}. Saving updates this sheet.', { name: sheet.recordedByName, editor: sheet.updatedByName })
              : t('Recorded by {name}. Saving updates this sheet.', { name: sheet.recordedByName })}
          </Text>
        ) : null}
      </Card>

      {groups.map((g) => (
        <Card
          key={g.key}
          title={g.contractor.trim() === DEPARTMENTAL_CONTRACTOR ? t('Own workers') : t('Contractor workers')}
          right={
            groups.length > 1 && !readOnly ? (
              <IconButton icon="trash-outline" size={20} color={colors.danger} onPress={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))} accessibilityLabel={t('Remove contractor')} />
            ) : null
          }
        >
          <Input {...field()} label={t('Contractor')} value={g.contractor} onChangeText={(v) => updateGroup(g.key, { contractor: v })} placeholder={t('Labour contractor')} error={errors[`c-${g.key}`]} editable={!readOnly} />
          {!readOnly && contractorNames.length > 1 ? (
            <Chips value={null} clearable={false} options={contractorNames.filter((c) => !groups.some((x) => x.contractor.trim() === c)).slice(0, 8).map((c) => ({ value: c, label: c }))} onChange={(v) => v && updateGroup(g.key, { contractor: v })} />
          ) : null}
          {g.rows.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.grow}>
                <Select value={r.category} options={r.category && !categoryOptions.some((o) => o.value === r.category) ? [...categoryOptions, { value: r.category, label: r.category }] : categoryOptions} onChange={(v) => updateRow(g.key, r.key, { category: v })} placeholder={t('Trade')} disabled={readOnly} />
              </View>
              <Input {...field()}
                value={r.count}
                onChangeText={(v) => updateRow(g.key, r.key, { count: v })}
                keyboardType="number-pad"
                placeholder="Nos"
                accessibilityLabel={r.category ? t('Number of {category}', { category: t(r.category) }) : t('Number of workers')}
                containerStyle={styles.small}
                editable={!readOnly}
              />
              {!readOnly ? (
                <IconButton icon="close-circle-outline" size={22} color={colors.textMuted} onPress={() => updateGroup(g.key, { rows: g.rows.filter((x) => x.key !== r.key) })} accessibilityLabel={r.category ? t('Remove {item}', { item: t(r.category) }) : t('Remove row')} style={styles.remove} />
              ) : null}
            </View>
          ))}
          {errors[`r-${g.key}`] ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors[`r-${g.key}`]}</Text> : null}
          {!readOnly ? <Button title={t('Add trade')} variant="ghost" size="sm" icon="add" onPress={() => updateGroup(g.key, { rows: [...g.rows, emptyRow()] })} /> : null}
        </Card>
      ))}
      {!readOnly ? (
        <Button
          title={t('Add contractor')}
          variant="secondary"
          icon="people-outline"
          size="sm"
          onPress={() => setGroups((gs) => [...gs, { key: newKey(), contractor: '', rows: [emptyRow('Mason'), emptyRow('Helper')] }])}
          style={styles.addContractor}
        />
      ) : null}

      <Card title={t('Total')} right={<Text maxFontSizeMultiplier={maxFontScale} style={styles.total}>{t('{n} workers', { n: total })}</Text>}>
        {byTrade.length ? (
          <View style={styles.tags}>
            {byTrade.map((m) => (
              <View key={m.category} style={styles.tag}>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.tagText}>
                  {t(m.category)} {m.count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.hint]}>{t("These totals fill the manpower of this day's DPR.")}</Text>
        {errors.lines ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors.lines}</Text> : null}
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline placeholder={t('e.g. Holiday, rain stopped work at 3 pm')} containerStyle={styles.last} editable={!readOnly} />
      </Card>
      {!readOnly ? <Button title={sheet ? t('Update attendance') : t('Save attendance')} icon="checkmark" onPress={save} loading={busy} disabled={validDay && day.loading} /> : null}
    </Screen>
  );
}

function Notice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name={icon} size={18} color={colors.text} />
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.noticeText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  last: { marginBottom: 0 },
  total: { ...typography.bodyStrong, color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, marginBottom: spacing.sm },
  small: { width: 84, marginBottom: spacing.sm },
  remove: { height: touch.height },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: fontSize.secondary },
  addContractor: { marginBottom: spacing.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  tag: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tagText: { fontSize: fontSize.secondary, color: colors.text, fontWeight: '600' },
  hint: { marginBottom: spacing.md },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  noticeText: { flex: 1, color: colors.text },
});
