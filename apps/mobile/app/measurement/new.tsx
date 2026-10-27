import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { BoqItemDto, MeasurementSheetDto, Paginated, WorkOrderDto } from '@erp/shared';
import { sectorLocation } from '@erp/shared';
import { canViewWorkOrders, hasDimensions, measurementLineQty, measurementTotal } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption, IconButton } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos, outboxToPhotos, OutboxRefusal, ReviewerNote, useOutboxEntry } from '../../src/forms/edit';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useSectorInputs, type SectorDraft } from '../../src/forms/sector';
import { useT } from '../../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, radius, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';
import { MeasureFromProgress, type ProgressPrefill } from '../../src/forms/MeasureFromProgress';

interface Line {
  key: string;
  description: string;
  nos: string;
  length: string;
  breadth: string;
  depth: string;
  deduct: boolean;
}

const NUM = /^\d+(\.\d{1,3})?$/;
let seq = 0;
const blankLine = (): Line => ({ key: `l${++seq}`, description: '', nos: '1', length: '', breadth: '', depth: '', deduct: false });
const dim = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * Record a measurement against a BOQ item (works offline through the outbox), or (with `editId`) fix and resubmit one,
 * or (with `outboxId`) fix one the server refused from the outbox. A new one is kept on the phone as a draft.
 */
export default function NewMeasurementScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string; outboxId?: string }>();
  const editId = params.editId ?? null;
  const outboxId = params.outboxId ?? null;
  const t = useT();
  const field = useFieldChain();
  const api = useApi();
  const { online, enqueue, discard, newId } = useOffline();
  const refused = useOutboxEntry(outboxId);
  // The same id for a direct send and the outbox, so a send that timed out but arrived is never made twice
  // (a new one for each sheet made with Submit another).
  const clientId = useRef(outboxId ?? newId());
  const errorSummary = useErrorSummary();
  const projects = useProjectOptions();
  const existing = useFetch<MeasurementSheetDto>((a) => a.get(`/measurements/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [boqItemId, setBoqItemId] = useState<string | null>(null);
  const [workOrderId, setWorkOrderId] = useState<string>('');
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<MeasurementSheetDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);
  const sector = useSectorInputs(projectId);

  const draft = useFormDraft<{ projectId: string | null; boqItemId: string | null; workOrderId: string; date: string; location: string; sector: SectorDraft; lines: Line[]; remarks: string; photos: LocalPhoto[] }>(
    editId || outboxId ? null : 'measurement',
    { projectId, boqItemId, workOrderId, date, location, sector: sector.value, lines, remarks, photos },
    (d) => {
      setProjectId(d.projectId);
      setBoqItemId(d.boqItemId);
      setWorkOrderId(d.workOrderId);
      setDate(d.date);
      setLocation(d.location);
      sector.restore(d.sector);
      // New keys: the saved ones may clash with lines numbered since the app started.
      setLines(d.lines.length ? d.lines.map((l) => ({ ...l, key: `l${++seq}` })) : [blankLine()]);
      setRemarks(d.remarks);
      setPhotos(restorePhotos(d.photos));
    },
  );
  useLeaveGuard(draft, { keepsDraft: !editId && !outboxId, busy });
  const startOver = () => {
    setProjectId(params.projectId ?? (projects.options.length === 1 ? projects.options[0].value : null));
    setBoqItemId(null);
    setWorkOrderId('');
    setDate(today());
    setLocation('');
    sector.clear();
    setLines([blankLine()]);
    setRemarks('');
    setPhotos([]);
    setErrors({});
  };

  useEffect(() => {
    if (!editId && !outboxId && !projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      draft.settle();
    }
  }, [editId, outboxId, projects.options, projectId, draft.settle]);

  // Fixing a refused outbox entry: fill the form from what was queued.
  const [refusedLoaded, setRefusedLoaded] = useState(false);
  useEffect(() => {
    if (!refused || refusedLoaded) return;
    const p = refused.payload as {
      projectId: string;
      boqItemId: string;
      workOrderId?: string;
      date: string;
      location?: string;
      remarks?: string;
      chainageFrom?: number;
      chainageTo?: number;
      floor?: string;
      village?: string;
      lines?: { description: string; nos: string | null; length: string | null; breadth: string | null; depth: string | null; deduct: boolean }[];
    };
    setProjectId(p.projectId);
    setBoqItemId(p.boqItemId);
    setWorkOrderId(p.workOrderId ?? '');
    setDate(p.date);
    setLocation(p.location ?? '');
    sector.load(p);
    setRemarks(p.remarks ?? '');
    if (p.lines?.length) setLines(p.lines.map((l) => ({ key: `l${++seq}`, description: l.description, nos: l.nos ?? '', length: l.length ?? '', breadth: l.breadth ?? '', depth: l.depth ?? '', deduct: l.deduct })));
    setPhotos(outboxToPhotos(refused.photos));
    setRefusedLoaded(true);
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refused, refusedLoaded, draft.settle]);

  useEffect(() => {
    const m = existing.data;
    if (!m) return;
    setProjectId(m.projectId);
    setBoqItemId(m.boqItemId);
    setWorkOrderId(m.workOrderId ?? '');
    setDate(m.date);
    setLocation(m.location !== sectorLocation(m) ? m.location : '');
    sector.load(m);
    setRemarks(m.remarks ?? '');
    setLines(m.lines.map((l) => ({ key: `l${++seq}`, description: l.description, nos: l.nos ?? '', length: l.length ?? '', breadth: l.breadth ?? '', depth: l.depth ?? '', deduct: l.deduct })));
    setPhotos(attachmentsToPhotos(m.attachments));
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const boq = useFetch<BoqItemDto[]>((a) => a.get(`/projects/${projectId}/boq`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `boq:${projectId}` });
  const boqOptions = useMemo<SelectOption[]>(() => (boq.data ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} · ${b.description} (${b.unit})` })), [boq.data]);
  const item = boq.data?.find((b) => b.id === boqItemId);
  const { user } = useAuth();
  const wos = useFetch<Paginated<WorkOrderDto>>((a) => a.get('/work-orders', { projectId: projectId!, boqItemId: boqItemId!, open: true, pageSize: 50 }), [projectId, boqItemId], {
    enabled: !!projectId && !!boqItemId && !!user && canViewWorkOrders(user.roleKey),
    refetchOnFocus: false,
    cacheKey: projectId && boqItemId ? `work-orders:${projectId}:${boqItemId}` : undefined,
  });
  const woOptions = (wos.data?.items ?? []).map((w) => ({ value: w.id, label: `${w.woNo} · ${w.vendorName}` }));
  if (existing.data?.workOrderId && !woOptions.some((o) => o.value === existing.data?.workOrderId)) woOptions.push({ value: existing.data.workOrderId, label: `${existing.data.woNo} · ${existing.data.contractorName ?? ''}` });
  const asInput = lines.map((l) => ({ nos: dim(l.nos), length: dim(l.length), breadth: dim(l.breadth), depth: dim(l.depth), deduct: l.deduct }));
  const total = measurementTotal(asInput);
  const unit = item?.unit ?? existing.data?.unit ?? '';

  // A sheet started from the approved days: the item, one line per day, and where and when they were, for the
  // surveyor to check against the book (finding 14 of the October review).
  const startFromProgress = (p: ProgressPrefill) => {
    setBoqItemId(p.boqItemId);
    setWorkOrderId('');
    setLines(p.lines.map((l) => ({ ...blankLine(), description: l.description, nos: l.nos })));
    if (p.location) setLocation(p.location);
    setRemarks(p.remarks);
    setErrors({});
  };

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!boqItemId) e.boqItemId = t('Choose the BOQ item');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    sector.validate(e);
    const tagged = sector.body(false);
    if (!location.trim() && tagged.chainageFrom === undefined && !tagged.floor && !tagged.village) e.location = t('Say where, e.g. Ch 2+100 to 2+350 or Grid A1-C4');
    lines.forEach((l, i) => {
      if (!l.description.trim()) e[`d${l.key}`] = t('Line {n}: describe what was measured', { n: i + 1 });
      const bad = [l.nos, l.length, l.breadth, l.depth].some((v) => v.trim() !== '' && !NUM.test(v.trim()));
      if (bad) e[`n${l.key}`] = t('Line {n}: enter sizes as numbers with up to 3 decimals', { n: i + 1 });
      else if (!hasDimensions(asInput[i])) e[`n${l.key}`] = t('Line {n}: enter the nos or a size', { n: i + 1 });
    });
    if (!e.lines && total <= 0) e.total = t('Make the total more than zero: check the sizes and the deductions');
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
      const body = {
        boqItemId,
        workOrderId: workOrderId || (editId ? null : undefined),
        date,
        location: location.trim() || (editId ? '' : undefined),
        ...sector.body(!!editId),
        remarks: remarks.trim() || (editId ? null : undefined),
        lines: lines.map((l) => ({ description: l.description.trim(), nos: dim(l.nos), length: dim(l.length), breadth: dim(l.breadth), depth: dim(l.depth), deduct: l.deduct })),
      };
      if (editId) {
        setCreated(await api.patch<MeasurementSheetDto>(`/measurements/${editId}`, { ...body, attachmentIds: attachmentIds(photos), submit: true }));
        draft.clear();
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        draft.clear();
        setQueued(
          await enqueue({
            id: clientId.current,
            type: 'MEASUREMENT',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${item ? `${item.itemNo} · ` : ''}${fmtQty(total)} ${unit} · ${location.trim() || sectorLocation(sector.body(false)) || ''}`,
            subtitle: `${projectName} · ${formatDate(date)}`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        const sheet = await api.post<MeasurementSheetDto>('/measurements', { id: clientId.current, projectId, ...body, attachmentIds: attachmentIds(photos) });
        draft.clear();
        if (outboxId) await discard(outboxId);
        setCreated(sheet);
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
    setLocation('');
    sector.clear();
    setLines([blankLine()]);
    setRemarks('');
    setPhotos([]);
    setErrors({});
    // What stays (project, BOQ item, date) is the next sheet's starting point, not unsent work.
    draft.settle();
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={outboxId ? undefined : reset} />;
  if (created) {
    return (
      <SubmitSuccess
        title={editId ? t('Measurement resubmitted') : t('Measurement submitted')}
        subtitle={t('{mb}: {qty} {unit} of item {item} at {location}. Sent for approval.', { mb: created.mbNo, qty: fmtQty(created.totalQty), unit: created.unit, item: created.boqItemNo, location: created.location })}
        detailHref={`/measurement/${created.id}`}
        onAnother={editId || outboxId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: editId ? t('Edit Measurement') : outboxId ? t('Fix Measurement') : t('New Measurement') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? boq.error} />
      <ReviewerNote entry={existing.data} />
      <OutboxRefusal item={refused} />
      {projectId && !editId && !outboxId ? <MeasureFromProgress projectId={projectId} onStart={startFromProgress} /> : null}
      <Card>
        <Select
          label={t('Project')}
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setBoqItemId(null);
            setWorkOrderId('');
          }}
          placeholder={t('Choose project')}
          error={errors.projectId}
          disabled={!!editId}
        />
        <Select label={t('BOQ item')} required value={boqItemId} options={boqOptions} onChange={(v) => {
            setBoqItemId(v);
            setWorkOrderId('');
          }} placeholder={projectId ? t('Choose BOQ item') : t('Choose a project first')} disabled={!projectId} error={errors.boqItemId} emptyText={t('No BOQ items in this project')} />
        {item ? (
          <Text style={[typography.caption, styles.boqInfo]}>
            {t('Contract {contract} {unit} · measured {measured} · awaiting approval {pending}', {
              contract: fmtQty(item.revisedQty ?? item.originalQty),
              unit: item.unit,
              measured: fmtQty(item.measuredQty),
              pending: fmtQty(item.pendingMeasuredQty),
            })}
          </Text>
        ) : null}
        {woOptions.length ? (
          <Select label={t('Done by (work order)')} value={workOrderId} options={[{ value: '', label: t('Departmental (no work order)') }, ...woOptions]} onChange={setWorkOrderId} placeholder={t('Departmental (no work order)')} />
        ) : null}
        {sector.fields(errors, field)}
        <Input {...field()} label={t('Location')} value={location} onChangeText={setLocation} placeholder={t('Grid, side or zone')} error={errors.location} />
        <DatePicker label={t('Measured on')} required value={date} onChange={setDate} error={errors.date} />
      </Card>
      {lines.map((l, i) => {
        const qty = measurementLineQty(asInput[i]);
        return (
          <Card key={l.key}>
            <View style={styles.lineHead}>
              <Text style={typography.label}>{t('Line {n}', { n: i + 1 })}</Text>
              {lines.length > 1 ? (
                <IconButton icon="trash-outline" size={20} color={colors.danger} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} accessibilityLabel={t('Remove line {n}', { n: i + 1 })} />
              ) : null}
            </View>
            <Input {...field()} label={t('Description')} required value={l.description} onChangeText={(v) => setLine(l.key, { description: v })} placeholder={t('e.g. Footing F1')} error={errors[`d${l.key}`]} />
            <View style={styles.dims}>
              {(
                [
                  ['nos', 'Nos', 'Line {n}: number (nos)'],
                  ['length', 'L', 'Line {n}: length'],
                  ['breadth', 'B', 'Line {n}: breadth'],
                  ['depth', 'D / H', 'Line {n}: depth or height'],
                ] as const
              ).map(([k, label, name]) => (
                <Input {...field()} key={k} label={label} accessibilityLabel={t(name, { n: i + 1 })} value={l[k]} onChangeText={(v) => setLine(l.key, { [k]: v })} keyboardType="decimal-pad" containerStyle={styles.dim} />
              ))}
            </View>
            {errors[`n${l.key}`] ? <Text style={styles.err}>{errors[`n${l.key}`]}</Text> : null}
            <View style={styles.lineFoot}>
              <Chips value={l.deduct ? 'D' : 'A'} onChange={(v) => setLine(l.key, { deduct: v === 'D' })} clearable={false} options={[{ value: 'A', label: t('Add') }, { value: 'D', label: t('Deduct') }]} />
              <Text style={[styles.lineQty, qty < 0 && { color: colors.danger }]}>
                {fmtQty(qty)} {unit}
              </Text>
            </View>
          </Card>
        );
      })}
      <Button title={t('Add line')} variant="ghost" icon="add" onPress={() => setLines((ls) => [...ls, blankLine()])} />
      <View style={styles.totalBox}>
        <Text style={typography.caption}>{t('Total (blank sizes count as 1)')}</Text>
        <Text style={styles.total}>
          {fmtQty(total)} {unit}
        </Text>
      </View>
      {errors.total ? <Text style={styles.err}>{errors.total}</Text> : null}
      <Card title={t('Photos or sketch')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Card>
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline />
      </Card>
      <Button title={editId ? t('Resubmit for approval') : t('Submit for approval')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  boqInfo: { marginTop: -spacing.sm, marginBottom: spacing.md },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  dims: { flexDirection: 'row', gap: spacing.sm },
  dim: { flex: 1 },
  lineFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineQty: { fontSize: 18, fontWeight: '700', color: colors.text },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg },
  total: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
