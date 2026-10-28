import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  DPR_BUILT_INS,
  STANDARD_DPR_FORM,
  WEATHER_LABELS,
  WEATHER_OPTIONS,
  attendanceToManpower,
  dprRequires,
  dprSetting,
  dprShows,
  ownFieldsOf,
  type AttendanceDayDto,
  type AttendanceLineInput,
  type DailyReportDto,
  type DprBuiltInKey,
  type DprLineInput,
  type DprWorkOptionsDto,
  type ManpowerLine,
  type Paginated,
  type Weather,
} from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, IconButton } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, outboxToPhotos, OutboxRefusal, ReviewerNote, useOutboxEntry } from '../../src/forms/edit';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { draftFor } from '../../src/ai/ask';
import { AskDraftNotice } from '../../src/ai/AskDraftNotice';
import { colors, fontSize, spacing, touch, typography } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';
import { DprLinesEditor, copiedRow, lineRowFrom, linesPayload, linesProblem, type DprLineRow } from '../../src/forms/dprLines';
import { OwnFieldInputs, ownPayload, ownProblems, ownValuesFrom, type OwnValues } from '../../src/forms/ownFields';

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
/** The phone's names of the built-in fields, which a company's form may rename (item 134 part 2). */
const PHONE_LABEL: Record<DprBuiltInKey, string> = {
  weather: 'Weather',
  siteCondition: 'Site condition',
  lines: 'Work done',
  manpower: 'Manpower',
  machinery: 'Machinery',
  materialReceived: 'Material received',
  testsConducted: 'Tests conducted',
  safetyObservations: 'Safety observations',
  issues: 'Issues / hindrances',
  nextDayPlan: 'Next-day plan',
  photos: 'Site photos',
};
/** Keep a free-text value (e.g. a trade typed on the web) selectable even when it is not in the standard list. */
const withValue = (options: { value: string; label: string }[], value: string | null) => (value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options);

/**
 * New DPR, or (with `editId`) edit a draft / rejected / changes-requested DPR and resubmit it, or (with `outboxId`) fix
 * one the server refused from the outbox, or (with `fromAsk`) check one filled in from notes dictated on the Ask tab.
 * A new DPR is kept on the phone as a draft while it is typed.
 */
export default function NewDprScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string; outboxId?: string; fromAsk?: string }>();
  const editId = params.editId ?? null;
  const outboxId = params.outboxId ?? null;
  // Filled in by Ask Nirmaan (AI item 72): it takes the place of a draft kept on the phone and is itself kept as one.
  const [askDraft] = useState(() => (editId || outboxId ? null : draftFor(params.fromAsk)));
  const t = useT();
  const { language } = useLanguage();
  const field = useFieldChain();
  const api = useApi();
  const { online, enqueue, discard, newId, items: outbox } = useOffline();
  const refused = useOutboxEntry(outboxId);
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice.
  const clientId = useRef(outboxId ?? newId()).current;
  const errorSummary = useErrorSummary();
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
  const [manpowerEdited, setManpowerEdited] = useState(false);
  const [lines, setLines] = useState<DprLineRow[]>([]);
  const [extra, setExtra] = useState<OwnValues>({});

  const draft = useFormDraft(
    editId || outboxId ? null : 'dpr',
    { projectId, date, weather, siteCondition, manpower, machinery, materialReceived, workExecuted, tests, safety, issues, nextDayPlan, photos, manpowerEdited, lines, extra },
    (d) => {
      setLines((d.lines ?? []).map((l) => ({ ...l, photos: restorePhotos(l.photos ?? []) })));
      setExtra(d.extra ?? {});
      setProjectId(d.projectId);
      setDate(d.date);
      setWeather(d.weather);
      setSiteCondition(d.siteCondition);
      setManpower(d.manpower);
      setMachinery(d.machinery);
      setMaterialReceived(d.materialReceived);
      setWorkExecuted(d.workExecuted);
      setTests(d.tests);
      setSafety(d.safety);
      setIssues(d.issues);
      setNextDayPlan(d.nextDayPlan);
      setPhotos(restorePhotos(d.photos));
      setManpowerEdited(d.manpowerEdited);
    },
  );
  useLeaveGuard(draft, { keepsDraft: !editId && !outboxId, busy });
  const startOver = () => {
    setProjectId(params.projectId ?? (projects.options.length === 1 ? projects.options[0].value : null));
    setDate(today());
    setWeather(null);
    setSiteCondition('');
    setManpower([{ key: newKey(), category: 'Mason', count: '' }, { key: newKey(), category: 'Helper', count: '' }]);
    setMachinery([{ key: newKey(), name: '', hours: '' }]);
    setMaterialReceived('');
    setWorkExecuted('');
    setTests('');
    setSafety('');
    setIssues('');
    setNextDayPlan('');
    setPhotos([]);
    setManpowerEdited(false);
    setLines([]);
    setExtra({});
    setErrors({});
  };

  useEffect(() => {
    if (!editId && !outboxId && !askDraft && !projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      draft.settle();
    }
  }, [editId, outboxId, askDraft, projects.options, projectId, draft.settle]);

  // Fixing a refused outbox entry: fill the form from what was queued.
  const [refusedLoaded, setRefusedLoaded] = useState(false);
  useEffect(() => {
    if (!refused || refusedLoaded) return;
    const p = refused.payload as { projectId: string; date: string; weather?: Weather | null; siteCondition?: string; manpower?: ManpowerLine[]; machinery?: { name: string; hours: number }[]; materialReceived?: string; workExecuted?: string; testsConducted?: string; safetyObservations?: string; issues?: string; nextDayPlan?: string; lines?: DprLineInput[]; extra?: Record<string, unknown> };
    // A line's photos go back on the line they were taken for.
    setLines((p.lines ?? []).map((l) => ({ ...lineRowFrom(l, newId()), photos: outboxToPhotos(refused.photos.filter((x) => x.line && x.line === l.id)) })));
    setExtra(ownValuesFrom(p.extra));
    setProjectId(p.projectId);
    setDate(p.date);
    setWeather(p.weather ?? null);
    setSiteCondition(p.siteCondition ?? '');
    if (p.manpower?.length) setManpower(p.manpower.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })));
    if (p.machinery?.length) setMachinery(p.machinery.map((m) => ({ key: newKey(), name: m.name, hours: String(m.hours) })));
    setMaterialReceived(p.materialReceived ?? '');
    setWorkExecuted(p.workExecuted ?? '');
    setTests(p.testsConducted ?? '');
    setSafety(p.safetyObservations ?? '');
    setIssues(p.issues ?? '');
    setNextDayPlan(p.nextDayPlan ?? '');
    setPhotos(outboxToPhotos(refused.photos.filter((x) => !x.line)));
    setManpowerEdited(true);
    setRefusedLoaded(true);
    draft.settle();
  }, [refused, refusedLoaded, draft.settle]);

  // From the Ask tab: the dictated day, over any draft the form brought back. Not settled, so it is kept and leaving asks.
  useEffect(() => {
    if (!askDraft) return;
    const v = askDraft.values as { date?: string; weather?: Weather | null; siteCondition?: string; manpower?: ManpowerLine[]; machinery?: { name: string; hours: number }[]; materialReceived?: string; workExecuted?: string; testsConducted?: string; safetyObservations?: string; issues?: string; nextDayPlan?: string; extra?: Record<string, unknown> };
    setExtra(ownValuesFrom(v.extra));
    setProjectId(askDraft.projectId);
    setDate(v.date && isIsoDate(v.date) ? v.date : today());
    setWeather(v.weather ?? null);
    setSiteCondition(v.siteCondition ?? '');
    setManpower(v.manpower?.length ? v.manpower.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })) : [{ key: newKey(), category: 'Mason', count: '' }, { key: newKey(), category: 'Helper', count: '' }]);
    setMachinery(v.machinery?.length ? v.machinery.map((m) => ({ key: newKey(), name: m.name, hours: String(m.hours) })) : [{ key: newKey(), name: '', hours: '' }]);
    setMaterialReceived(v.materialReceived ?? '');
    setWorkExecuted(v.workExecuted ?? '');
    setTests(v.testsConducted ?? '');
    setSafety(v.safetyObservations ?? '');
    setIssues(v.issues ?? '');
    setNextDayPlan(v.nextDayPlan ?? '');
    setPhotos([]);
    // Manpower said in the notes stays; with none, the day's attendance fills it as for any new DPR.
    setManpowerEdited(!!v.manpower?.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askDraft]);

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
    setLines((e.lines ?? []).map((l) => lineRowFrom(l, newId())));
    setExtra(ownValuesFrom(e.extra));
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  // Work lines (item 127): what the picker offers, kept on the phone for offline use, with the type's form (item 134).
  const workOptions = useFetch<DprWorkOptionsDto>((a) => a.get('/dpr/work-options', { projectId: projectId!, date: isIsoDate(date) ? date : today() }), [projectId], {
    enabled: !!projectId,
    refetchOnFocus: false,
    cacheKey: `dpr-options:${projectId}`,
  });
  // A new report takes the type's latest form; an edit keeps the one it was made on.
  const def = (editId ? existing.data?.form : workOptions.data?.form)?.def ?? STANDARD_DPR_FORM;
  const shows = (key: DprBuiltInKey) => dprShows(def, key, { progressFromDpr: workOptions.data?.progressFromDpr });
  const L = (key: DprBuiltInKey) => dprSetting(def, key).label ?? t(PHONE_LABEL[key]);
  const ownDay = ownFieldsOf(def, 'DAY');
  const allPhotos = useMemo(() => [...photos, ...lines.flatMap((l) => l.photos)], [photos, lines]);

  const categoryOptions = useMemo(() => def.lines.crewCategories.map((c) => ({ value: c, label: t(c) })), [def.lines.crewCategories, t]);
  const machineOptions = useMemo(() => def.lines.machineNames.map((m) => ({ value: m, label: m })), [def.lines.machineNames]);
  const weatherChips = useMemo(() => WEATHER_OPTIONS.map((w) => ({ value: w, label: t(WEATHER_LABELS[w]) })), [t]);
  const totalManpower = useMemo(() => manpower.reduce((s, r) => s + (Number(r.count) || 0), 0), [manpower]);

  // New DPR: manpower comes from the day's attendance (on the server, or still in this phone's outbox)
  // until the user edits it by hand.
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const attendanceDay = useFetch<AttendanceDayDto>((a) => a.get('/attendance/day', { projectId: projectId!, date }), [projectId, date], {
    enabled: !editId && !!projectId && isIsoDate(date) && online,
    refetchOnFocus: false,
  });
  const attendance = useMemo<{ id: string; manpower: ManpowerLine[]; text: string } | null>(() => {
    if (editId || outboxId || !projectId) return null;
    const sheet = attendanceDay.data?.projectId === projectId && attendanceDay.data.date === date ? attendanceDay.data.sheet : null;
    if (sheet?.manpower.length) return { id: sheet.id, manpower: sheet.manpower, text: t('From attendance: {n} workers recorded by {name}', { n: sheet.totalWorkers, name: sheet.recordedByName }) };
    const queuedSheet = outbox.find((i) => i.type === 'ATTENDANCE' && i.payload.projectId === projectId && i.payload.date === date);
    const lines = (queuedSheet?.payload.lines as AttendanceLineInput[] | undefined) ?? [];
    if (queuedSheet && lines.length) return { id: queuedSheet.id, manpower: attendanceToManpower(lines), text: t('From attendance saved on this phone') };
    return null;
  }, [editId, projectId, date, attendanceDay.data, outbox, t]);
  const applyAttendance = (a: NonNullable<typeof attendance>) => {
    setManpower(a.manpower.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })));
    setFilledFrom(a.id);
    setManpowerEdited(false);
  };
  useEffect(() => {
    if (attendance && !manpowerEdited && filledFrom !== attendance.id) {
      applyAttendance(attendance);
      // Filled in by itself: not a change of the user's to keep or warn about.
      if (!draft.restoredAt && !askDraft) draft.settle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, manpowerEdited, filledFrom]);

  const headCount = useMemo(() => manpower.filter((r) => r.category && /^\d+$/.test(r.count.trim())).map((r) => ({ category: r.category as string, count: Number(r.count) })), [manpower]);
  const hasLines = lines.some((l) => l.activityId);
  const [copying, setCopying] = useState(false);
  const copyYesterday = async () => {
    if (!projectId) return;
    setCopying(true);
    try {
      const prev = new Date(`${date}T00:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() - 1);
      const list = await api.get<Paginated<DailyReportDto>>('/dpr', { projectId, to: prev.toISOString().slice(0, 10), pageSize: 1 });
      const last = list.items[0];
      const full = last?.lineCount ? await api.get<DailyReportDto>(`/dpr/${last.id}`) : null;
      if (!full?.lines?.length) {
        setSubmitError(t('No work lines on the last DPR to copy'));
        return;
      }
      setLines((rows) => [...rows.filter((r) => r.activityId), ...full.lines!.map((l) => copiedRow(l, newId()))]);
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setCopying(false);
    }
  };

  const updateMan = (key: string, patch: Partial<ManpowerRow>) => {
    setManpowerEdited(true);
    setManpower((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const updateMach = (key: string, patch: Partial<MachineryRow>) => setMachinery((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    if (!workExecuted.trim() && !hasLines) e.workExecuted = t('Describe the work executed today, or add a work line');
    const lineProblem = linesProblem(lines, t, workOptions.data ?? null, def, language);
    if (lineProblem) e.lines = lineProblem;
    // What the type's form requires (item 134 part 2); the server checks the same when the report is sent.
    const ownProblem = ownProblems(ownDay, extra, t, language);
    if (ownProblem) e.extra = ownProblem;
    const missing = (key: DprBuiltInKey) => (dprSetting(def, key).label ? t('Fill in {label}', { label: dprSetting(def, key).label! }) : t(DPR_BUILT_INS[key].missing));
    const need = (key: DprBuiltInKey) => shows(key) && dprRequires(def, key);
    if (need('weather') && !weather) e.weather = missing('weather');
    if (need('siteCondition') && !siteCondition.trim()) e.siteCondition = missing('siteCondition');
    if (need('lines') && !hasLines) e.lines = e.lines ?? missing('lines');
    if (need('manpower') && totalManpower <= 0) e.manpower = missing('manpower');
    if (need('machinery') && !machinery.some((r) => r.name.trim())) e.machinery = missing('machinery');
    if (need('materialReceived') && !materialReceived.trim()) e.materialReceived = missing('materialReceived');
    if (need('testsConducted') && !tests.trim()) e.tests = missing('testsConducted');
    if (need('safetyObservations') && !safety.trim()) e.safety = missing('safetyObservations');
    if (need('issues') && !issues.trim()) e.issues = missing('issues');
    if (need('nextDayPlan') && !nextDayPlan.trim()) e.nextDayPlan = missing('nextDayPlan');
    for (const r of manpower) {
      if ((r.category && r.count.trim()) || (!r.category && !r.count.trim())) continue;
      e.manpower = t('Choose a category and enter a count in each manpower row');
    }
    if (manpower.some((r) => r.count.trim() && !/^\d+$/.test(r.count.trim()))) e.manpower = t('Enter manpower counts as whole numbers');
    for (const r of machinery) {
      if ((r.name.trim() && r.hours.trim()) || (!r.name.trim() && !r.hours.trim())) continue;
      e.machinery = t('Enter a name and hours in each machinery row');
    }
    if (machinery.some((r) => r.hours.trim() && Number.isNaN(Number(r.hours)))) e.machinery = t('Enter machinery hours as a number');
    if (photosUploading(allPhotos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(allPhotos)) e.photos = t('Remove or retry failed photos');
    else if (editId && photosQueued(allPhotos)) e.photos = t('Photos need a connection to upload before resubmitting');
    else if (shows('photos') && def.minPhotos > 0 && allPhotos.filter((p) => !p.error).length < def.minPhotos) e.photos = def.minPhotos === 1 ? t('Add a site photo') : t('Add at least {n} site photos', { n: def.minPhotos });
    if (!editId && outbox.some((i) => i.id !== outboxId && i.type === 'DPR' && i.payload.projectId === projectId && i.payload.date === date)) e.date = t('A DPR for this date is already waiting in the outbox');
    setErrors(e);
    errorSummary.report(e);
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
        lines: linesPayload(lines, def),
        testsConducted: tests.trim() || blank,
        safetyObservations: safety.trim() || blank,
        issues: issues.trim() || blank,
        nextDayPlan: nextDayPlan.trim() || blank,
        extra: ownPayload(ownDay, extra),
        // The form version filled in, so a report typed offline goes in on it (an edit keeps its own).
        ...(editId ? {} : { formId: workOptions.data?.form.id ?? undefined }),
      };
      // Sent directly, each line takes its uploaded photos' ids; queued, the outbox puts them on the line.
      const withLinePhotos = { ...body, lines: body.lines.map((l, i) => ({ ...l, attachmentIds: attachmentIds(lines.filter((r) => r.activityId)[i]?.photos ?? []) })) };
      if (editId) {
        setCreated(await api.patch<DailyReportDto>(`/dpr/${editId}`, { ...withLinePhotos, attachmentIds: attachmentIds(photos), submit: true }));
        draft.clear();
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        draft.clear();
        setQueued(
          await enqueue({
            id: clientId,
            type: 'DPR',
            payload: { projectId, ...body },
            photos: [...toOutboxPhotos(photos), ...lines.filter((r) => r.activityId).flatMap((r) => toOutboxPhotos(r.photos, r.id))],
            title: `DPR · ${formatDate(date)}`,
            subtitle: `${projectName} · ${t('{n} manpower', { n: totalManpower })}`,
          }),
        );
      };
      if (!online || photosQueued(allPhotos)) {
        await queueIt();
        return;
      }
      try {
        const dpr = await api.post<DailyReportDto>('/dpr', { id: clientId, projectId, ...withLinePhotos, attachmentIds: attachmentIds(photos) });
        draft.clear();
        if (outboxId) await discard(outboxId);
        setCreated(dpr);
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
    return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} />;
  }
  if (created) {
    return <SubmitSuccess title={editId ? t('DPR resubmitted') : t('DPR submitted')} subtitle={`${created.projectName} · ${formatDate(created.date)} · ${t('{n} manpower. Sent for approval.', { n: created.totalManpower })}`} detailHref={`/dpr/${created.id}`} />;
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: editId ? t('Edit Daily Report') : outboxId ? t('Fix Daily Report') : t('New Daily Report') }} />
      {askDraft ? <AskDraftNotice draft={askDraft} /> : <DraftNotice draft={draft} onStartOver={startOver} />}
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <OutboxRefusal item={refused} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} disabled={!!editId} />
        <DatePicker label={t('Report date')} required value={date} onChange={setDate} error={errors.date} />
        {shows('weather') ? <Chips label={L('weather')} required={dprRequires(def, 'weather')} value={weather} options={weatherChips} onChange={setWeather} /> : null}
        {errors.weather ? <Text style={styles.err}>{errors.weather}</Text> : null}
        {shows('siteCondition') ? (
          <Input {...field()} label={L('siteCondition')} required={dprRequires(def, 'siteCondition')} value={siteCondition} onChangeText={setSiteCondition} placeholder={t('e.g. Workable, waterlogged at Km 16')} error={errors.siteCondition} containerStyle={ownDay.length ? undefined : styles.last} />
        ) : null}
        <OwnFieldInputs fields={ownDay} values={extra} onChange={setExtra} />
        {errors.extra ? <Text style={styles.err}>{errors.extra}</Text> : null}
      </Card>

      {shows('manpower') ? (
        <Card title={L('manpower')} right={<Text style={styles.total}>{t('Total {n}', { n: totalManpower })}</Text>}>
          {attendance ? (
            filledFrom === attendance.id && !manpowerEdited ? (
              <Text style={styles.fromAttendance}>{attendance.text}</Text>
            ) : (
              <Button title={t('Use attendance figures')} variant="ghost" size="sm" icon="people-outline" onPress={() => applyAttendance(attendance)} />
            )
          ) : null}
          {manpower.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.grow}>
                <Select value={r.category} options={withValue(categoryOptions, r.category)} onChange={(v) => updateMan(r.key, { category: v })} placeholder={t('Category')} />
              </View>
              <Input {...field()}
                value={r.count}
                onChangeText={(v) => updateMan(r.key, { count: v })}
                keyboardType="number-pad"
                placeholder="Nos"
                accessibilityLabel={r.category ? t('Number of {category}', { category: t(r.category) }) : t('Number of workers')}
                containerStyle={styles.small}
              />
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
            title={t('Add category')}
            variant="ghost"
            size="sm"
            icon="add"
            onPress={() => {
              setManpowerEdited(true);
              setManpower((rows) => [...rows, { key: newKey(), category: null, count: '' }]);
            }}
          />
        </Card>
      ) : null}

      {shows('machinery') ? (
        <Card title={L('machinery')}>
          {machinery.map((r) => (
            <View key={r.key} style={styles.row}>
              {machineOptions.length ? (
                <View style={styles.grow}>
                  <Select value={r.name || null} options={withValue(machineOptions, r.name || null)} onChange={(v) => updateMach(r.key, { name: v })} placeholder={t('Machine')} />
                </View>
              ) : (
                <Input {...field()} value={r.name} onChangeText={(v) => updateMach(r.key, { name: v })} placeholder={t('e.g. Excavator')} accessibilityLabel={t('Machine')} containerStyle={styles.grow} />
              )}
              <Input {...field()}
                value={r.hours}
                onChangeText={(v) => updateMach(r.key, { hours: v })}
                keyboardType="decimal-pad"
                placeholder={t('Hrs')}
                accessibilityLabel={r.name.trim() ? t('Hours worked by {machine}', { machine: r.name.trim() }) : t('Hours worked')}
                containerStyle={styles.small}
              />
              <RemoveBtn onPress={() => setMachinery((rows) => rows.filter((x) => x.key !== r.key))} />
            </View>
          ))}
          {errors.machinery ? <Text style={styles.err}>{errors.machinery}</Text> : null}
          <Button title={t('Add machine')} variant="ghost" size="sm" icon="add" onPress={() => setMachinery((rows) => [...rows, { key: newKey(), name: '', hours: '' }])} />
        </Card>
      ) : null}

      {shows('lines') ? (
        <Card
          title={L('lines')}
          right={!editId && online && projectId ? <Button title={t('Copy yesterday')} variant="ghost" size="sm" icon="copy-outline" onPress={copyYesterday} loading={copying} /> : null}
        >
          <DprLinesEditor rows={lines} onChange={setLines} options={workOptions.data} def={def} headCount={headCount} newId={newId} error={errors.lines} />
        </Card>
      ) : null}

      <Card title={t('Work')}>
        <Input {...field({ multiline: true })} label={hasLines ? t('Other work and notes') : t('Work executed')} required={!hasLines} value={workExecuted} onChangeText={setWorkExecuted} multiline placeholder={t('What was done today, where, and how much')} error={errors.workExecuted} />
        {shows('materialReceived') ? (
          <Input {...field({ multiline: true })} label={L('materialReceived')} required={dprRequires(def, 'materialReceived')} value={materialReceived} onChangeText={setMaterialReceived} multiline placeholder={t('e.g. 200 bags cement, 20 MT steel')} error={errors.materialReceived} />
        ) : null}
        {shows('testsConducted') ? (
          <Input {...field({ multiline: true })} label={L('testsConducted')} required={dprRequires(def, 'testsConducted')} value={tests} onChangeText={setTests} multiline placeholder={t('e.g. Cube test, FDD')} error={errors.tests} />
        ) : null}
        {shows('safetyObservations') ? (
          <Input {...field({ multiline: true })} label={L('safetyObservations')} required={dprRequires(def, 'safetyObservations')} value={safety} onChangeText={setSafety} multiline placeholder={t('Toolbox talk, PPE, incidents')} error={errors.safety} />
        ) : null}
        <Input {...field({ multiline: true })} label={L('issues')} required={dprRequires(def, 'issues')} value={issues} onChangeText={setIssues} multiline placeholder={t('Anything blocking work')} error={errors.issues} />
        {shows('nextDayPlan') ? (
          <Input {...field({ multiline: true })} label={L('nextDayPlan')} required={dprRequires(def, 'nextDayPlan')} value={nextDayPlan} onChangeText={setNextDayPlan} multiline placeholder={t('Planned activities for tomorrow')} error={errors.nextDayPlan} />
        ) : null}
        {shows('photos') ? <PhotoPicker label={def.minPhotos ? `${L('photos')} (${t('at least {n}', { n: def.minPhotos })})` : undefined} photos={photos} onChange={setPhotos} /> : null}
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={editId ? t('Resubmit DPR for approval') : t('Submit DPR for approval')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

function RemoveBtn({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <IconButton icon="trash-outline" size={20} color={colors.danger} onPress={onPress} accessibilityLabel={t('Remove row')} style={styles.remove} />
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
  fromAttendance: { ...typography.caption, color: colors.success, marginBottom: spacing.sm },
});
