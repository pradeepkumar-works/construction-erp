import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, EquipmentDto, MachineDayDto, MachineryLogDto, Paginated } from '@erp/shared';
import { MAX_PAGE_SIZE, engineLogDraft, hoursAboveEngine, machineryLogProblem } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { Button, Card, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, ReviewerNote } from '../../src/forms/edit';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, maxFontScale, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

const NUM = /^\d+(\.\d+)?$/;

/** Log a machine's day (works offline through the outbox), or (with `editId`) fix a returned log and resubmit it. */
export default function NewMachineryLogScreen() {
  const params = useLocalSearchParams<{ projectId?: string; equipmentId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice
  // (a new one for each entry made with Submit another).
  const clientId = useRef(newId());
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

  const draft = useFormDraft(
    editId ? null : 'machinery-log',
    { projectId, equipmentId, date, worked, idle, down, breakdownNote, meterStart, meterEnd, diesel, operator, activityId, workDone, remarks, photos },
    (d) => {
      setProjectId(d.projectId);
      setEquipmentId(d.equipmentId);
      setDate(d.date);
      setWorked(d.worked);
      setIdle(d.idle);
      setDown(d.down);
      setBreakdownNote(d.breakdownNote);
      setMeterStart(d.meterStart);
      setMeterEnd(d.meterEnd);
      setDiesel(d.diesel);
      setOperator(d.operator);
      setActivityId(d.activityId);
      setWorkDone(d.workDone);
      setRemarks(d.remarks);
      setPhotos(restorePhotos(d.photos));
    },
  );
  useLeaveGuard(draft, { keepsDraft: !editId, busy });

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [editId, projects.options, projectId, draft]);

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
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(() => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.unit })), [activities.data]);

  // Machines at the chosen project first; the rest of the fleet after them.
  const equipmentOptions = useMemo<SelectOption[]>(() => {
    const all = fleet.data?.items ?? [];
    const here = all.filter((e) => e.projectId === projectId);
    const other = all.filter((e) => e.projectId !== projectId);
    return [...here, ...other].map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, hint: e.projectId === projectId ? t('At this project') : e.projectName ?? t('Yard / unassigned') }));
  }, [fleet.data, projectId, t]);
  const machine = fleet.data?.items.find((e) => e.id === equipmentId) ?? null;

  // What the machine's tracker read that day (item 146) fills the hours and meter for the operator to check; a box
  // someone typed in is left as it is.
  const tracker = useFetch<MachineDayDto | ''>((a) => a.get(`/telematics/day`, { equipmentId, date }), [equipmentId, date], {
    enabled: !editId && online && !!equipmentId && isIsoDate(date),
    refetchOnFocus: false,
  });
  const day = (!editId && equipmentId && tracker.data) || null;
  const filled = useRef<Record<string, string>>({});
  useEffect(() => {
    if (editId) return;
    const engine = day ? engineLogDraft(day) : null;
    const fill = (key: string, set: React.Dispatch<React.SetStateAction<string>>, v: number | null | undefined) =>
      set((cur) => {
        if (cur && filled.current[key] !== cur) return cur;
        const next = v === null || v === undefined ? '' : String(v);
        filled.current[key] = next;
        return next;
      });
    fill('worked', setWorked, engine?.hoursWorked);
    fill('idle', setIdle, engine && engine.idleHours > 0 ? engine.idleHours : null);
    fill('meterStart', setMeterStart, engine?.meterStart);
    fill('meterEnd', setMeterEnd, engine?.meterEnd);
  }, [day, editId]);
  const above = day ? hoursAboveEngine(Number(worked || 0) + Number(idle || 0), Number(day.engineHours)) : null;

  const changeProject = (id: string) => {
    setProjectId(id);
    setActivityId(null);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!equipmentId) e.equipmentId = t('Choose a machine');
    if (!isIsoDate(date)) e.date = t('Pick the date from the calendar');
    if (!NUM.test(worked.trim())) e.worked = t('Enter the hours worked (0 if it did not work)');
    const numbers = [
      ['idle', idle, t('Enter the idle hours as a number')],
      ['down', down, t('Enter the breakdown hours as a number')],
      ['meterStart', meterStart, t('Enter the hour meter start as a number')],
      ['meterEnd', meterEnd, t('Enter the hour meter end as a number')],
      ['diesel', diesel, t('Enter the diesel litres as a number')],
    ] as const;
    for (const [k, v, message] of numbers) if (v.trim() && !NUM.test(v.trim())) e[k] = message;
    if (Object.keys(e).length === 0) {
      const problem = machineryLogProblem({ hoursWorked: worked, idleHours: idle || 0, breakdownHours: down || 0, meterStart: meterStart || null, meterEnd: meterEnd || null, breakdownNote });
      if (problem) e.worked = t(problem);
    }
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    else if (editId && photosQueued(photos)) e.photos = t('Photos need a connection to upload before resubmitting');
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
      const n = (v: string) => (v.trim() ? v.trim() : blank);
      const txt = (v: string) => v.trim() || blank;
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
        operatorName: txt(operator),
        activityId: activityId ?? blank,
        workDone: txt(workDone),
        remarks: txt(remarks),
      };
      if (editId) {
        setCreated(await api.patch<MachineryLogDto>(`/machinery-logs/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(
          await enqueue({
            id: clientId.current,
            type: 'MACHINERY',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${machine?.code ?? t('Machine')} · ${fmtQty(worked)} h`,
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<MachineryLogDto>('/machinery-logs', { id: clientId.current, projectId, ...body, attachmentIds: attachmentIds(photos) }));
        draft.clear();
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
    clientId.current = newId();
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
    draft.settle();
  };
  const startOver = () => {
    setEquipmentId(params.equipmentId ?? null);
    setDate(today());
    setWorked('');
    setIdle('');
    setDown('');
    setBreakdownNote('');
    setMeterStart('');
    setMeterEnd('');
    setDiesel('');
    setOperator('');
    setActivityId(null);
    setWorkDone('');
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? t('Machinery log resubmitted') : t('Machinery log submitted')}
        subtitle={t('{code}: {hours} h on {date}. Sent for approval.', { code: created.equipmentCode, hours: fmtQty(created.hoursWorked), date: created.date })}
        detailHref={`/machinery/${created.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: editId ? t('Edit machinery log') : t('New machinery log') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? fleet.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={changeProject} placeholder={t('Choose project')} error={errors.projectId} disabled={!!editId} />
        <Select
          label={t('Machine')}
          required
          searchable
          value={equipmentId}
          options={equipmentOptions}
          onChange={setEquipmentId}
          placeholder={fleet.loading && !fleet.data ? t('Loading equipment…') : t('Choose machine')}
          error={errors.equipmentId}
          emptyText={t('No equipment yet; ask the PM to add it')}
        />
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        <View style={styles.row}>
          <View style={styles.cell}>
            <Input {...field()} label={t('Hours worked')} required value={worked} onChangeText={setWorked} keyboardType="decimal-pad" placeholder="8" error={errors.worked} style={styles.bigInput} />
          </View>
          <View style={styles.cell}>
            <Input {...field()} label={t('Idle hours')} value={idle} onChangeText={setIdle} keyboardType="decimal-pad" placeholder="0" error={errors.idle} />
          </View>
          <View style={styles.cell}>
            <Input {...field()} label={t('Breakdown hours')} value={down} onChangeText={setDown} keyboardType="decimal-pad" placeholder="0" error={errors.down} />
          </View>
        </View>
        {day ? (
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('From the tracker: the engine ran {hours} h. Check it and change what is not right.', { hours: fmtQty(day.engineHours) })}
            {above !== null ? ` ${t('That is {hours} h more than the engine ran; the approver sees it.', { hours: fmtQty(String(above)) })}` : ''}
          </Text>
        ) : null}
        {Number(down) > 0 ? <Input {...field()} label={t('What broke down')} required value={breakdownNote} onChangeText={setBreakdownNote} placeholder={t('e.g. Hydraulic hose burst')} /> : null}
      </Card>
      <Card title={t('Meter and diesel')}>
        <View style={styles.row}>
          <View style={styles.cell}>
            <Input {...field()} label={t('Hour meter start')} value={meterStart} onChangeText={setMeterStart} keyboardType="decimal-pad" error={errors.meterStart} />
          </View>
          <View style={styles.cell}>
            <Input {...field()} label={t('Hour meter end')} value={meterEnd} onChangeText={setMeterEnd} keyboardType="decimal-pad" error={errors.meterEnd} />
          </View>
        </View>
        <Input {...field()} label={t('Diesel filled (litres)')} value={diesel} onChangeText={setDiesel} keyboardType="decimal-pad" placeholder={t('e.g. 60')} error={errors.diesel} />
      </Card>
      <Card title={t('Details (optional)')}>
        <Input {...field()} label={t('Operator')} value={operator} onChangeText={setOperator} />
        <Select label={t('Activity')} value={activityId} options={activityOptions} onChange={setActivityId} placeholder={projectId ? t('Choose activity') : t('Choose a project first')} disabled={!projectId} emptyText={t('No activities in this project')} />
        <Input {...field()} label={t('Work done')} value={workDone} onChangeText={setWorkDone} placeholder={t('e.g. Excavation for drain Ch. 2+400')} />
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={editId ? t('Resubmit for approval') : t('Submit for approval')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  bigInput: { fontSize: 20, fontWeight: '700' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
