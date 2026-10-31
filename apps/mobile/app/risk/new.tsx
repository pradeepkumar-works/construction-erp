import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, DelayParty, ProjectDetail, RiskCategory, RiskDto, RiskKind, RiskStatus } from '@erp/shared';
import { DELAY_PARTIES, DELAY_PARTY_LABELS, RISK_CATEGORIES, RISK_CATEGORY_LABELS, RISK_LEVEL_LABELS, RISK_STATUSES, RISK_STATUS_LABELS, delayDays, riskLevel, riskScore } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos } from '../../src/forms/edit';
import { DraftNotice, restorePhotos, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, radius, spacing, typography } from '../../src/theme';
import { addDays, formatDate, isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';

const RATINGS = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));
/** English labels; shown through t(). */
const DUE_PRESETS = [
  { value: '3', label: 'In 3 days' },
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
];
const LEVEL_TONE = { LOW: colors.success, MEDIUM: colors.warning, HIGH: colors.danger } as const;

/** Record a delay or raise a risk (works offline through the outbox), or (with `editId`) update one, including closing it. */
export default function RiskFormScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string; kind?: RiskKind; activityId?: string; title?: string }>();
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
  const existing = useFetch<RiskDto>((a) => a.get(`/risks/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [kind, setKind] = useState<RiskKind>(params.kind === 'RISK' ? 'RISK' : 'DELAY');
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [title, setTitle] = useState(params.title ?? '');
  const [category, setCategory] = useState<RiskCategory | null>(null);
  const [activityId, setActivityId] = useState<string | null>(params.activityId ?? null);
  const [description, setDescription] = useState('');
  const [delayStart, setDelayStart] = useState(today());
  const [resumed, setResumed] = useState(false);
  const [delayEnd, setDelayEnd] = useState(today());
  const [party, setParty] = useState<DelayParty | null>(null);
  const [probability, setProbability] = useState(params.kind === 'RISK' ? '3' : '5');
  const [impact, setImpact] = useState('3');
  const [mitigation, setMitigation] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueIn, setDueIn] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<RiskStatus>('OPEN');
  const [closureNote, setClosureNote] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<RiskDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  const draft = useFormDraft(
    editId ? null : 'risk',
    { kind, projectId, title, category, activityId, description, delayStart, resumed, delayEnd, party, probability, impact, mitigation, ownerId, dueIn, photos },
    (d) => {
      setKind(d.kind);
      setProjectId(d.projectId);
      setTitle(d.title);
      setCategory(d.category);
      setActivityId(d.activityId);
      setDescription(d.description);
      setDelayStart(d.delayStart);
      setResumed(d.resumed);
      setDelayEnd(d.delayEnd);
      setParty(d.party);
      setProbability(d.probability);
      setImpact(d.impact);
      setMitigation(d.mitigation);
      setOwnerId(d.ownerId);
      setDueIn(d.dueIn);
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
    const r = existing.data;
    if (!r) return;
    setKind(r.kind);
    setProjectId(r.projectId);
    setTitle(r.title);
    setCategory(r.category);
    setActivityId(r.activityId);
    setDescription(r.description ?? '');
    setDelayStart(r.delayStart ?? today());
    setResumed(!!r.delayEnd);
    setDelayEnd(r.delayEnd ?? today());
    setParty(r.responsibleParty);
    setProbability(String(r.probability));
    setImpact(String(r.impact));
    setMitigation(r.mitigation ?? '');
    setOwnerId(r.ownerId);
    setDueDate(r.dueDate);
    setStatus(r.status);
    setClosureNote(r.closureNote ?? '');
    setPhotos(attachmentsToPhotos(r.attachments));
    draft.settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const project = useFetch<ProjectDetail>((a) => a.get(`/projects/${projectId}`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `project:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(() => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name })), [activities.data]);
  const categoryOptions = useMemo<SelectOption<RiskCategory>[]>(() => RISK_CATEGORIES.map((c) => ({ value: c, label: t(RISK_CATEGORY_LABELS[c]) })), [t]);
  const ownerOptions = useMemo<SelectOption[]>(() => {
    const p = project.data;
    if (!p) return [];
    return [
      ...(p.projectManagerId ? [{ value: p.projectManagerId, label: `${p.projectManagerName} (PM)` }] : []),
      ...p.members.filter((m) => m.userId !== p.projectManagerId).map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` })),
    ];
  }, [project.data]);

  const isDelay = kind === 'DELAY';
  const score = riskScore(Number(probability), Number(impact));
  const level = riskLevel(score);
  const days = isDelay && isIsoDate(delayStart) ? delayDays(delayStart, resumed ? delayEnd : null, today()) : null;
  const due = dueIn ? addDays(today(), Number(dueIn)) : dueDate;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!title.trim()) e.title = t(isDelay ? 'Say what is holding up work' : 'Say what might happen');
    if (!category) e.category = t('Choose a category');
    if (isDelay) {
      if (!isIsoDate(delayStart) || delayStart > today()) e.delayStart = t('Choose a date up to today');
      if (resumed && (!isIsoDate(delayEnd) || delayEnd < delayStart || delayEnd > today())) e.delayEnd = t('Enter a date between the start and today');
    }
    if (editId && status === 'CLOSED' && !closureNote.trim()) e.closureNote = t('Say how it was resolved');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    else if (editId && photosQueued(photos)) e.photos = t('Photos need a connection to upload before saving');
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
      const opt = (v: string) => v.trim() || blank;
      const body = {
        kind,
        category,
        title: title.trim(),
        description: opt(description),
        activityId: activityId ?? blank,
        ownerId: ownerId ?? blank,
        probability: Number(probability),
        impact: Number(impact),
        mitigation: opt(mitigation),
        dueDate: due ?? blank,
        delayStart: isDelay ? delayStart : null,
        delayEnd: isDelay && resumed ? delayEnd : null,
        responsibleParty: isDelay ? party : null,
      };
      if (editId) {
        setSaved(await api.patch<RiskDto>(`/risks/${editId}`, { ...body, status, closureNote: status === 'CLOSED' ? closureNote.trim() : opt(closureNote), attachmentIds: attachmentIds(photos) }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(
          await enqueue({
            id: clientId.current,
            type: 'RISK',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${t(isDelay ? 'Delay' : 'Risk')} · ${title.trim()}`,
            subtitle: `${projectName} · ${formatDate(today())}`,
          }),
        );
        draft.clear();
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<RiskDto>('/risks', { id: clientId.current, projectId, ...body, attachmentIds: attachmentIds(photos) }));
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
    setSaved(null);
    setQueued(null);
    setTitle('');
    setDescription('');
    setActivityId(null);
    setMitigation('');
    setPhotos([]);
    setErrors({});
    draft.settle();
  };
  const startOver = () => {
    setTitle('');
    setCategory(null);
    setActivityId(null);
    setDescription('');
    setDelayStart(today());
    setResumed(false);
    setDelayEnd(today());
    setParty(null);
    setProbability(kind === 'RISK' ? '3' : '5');
    setImpact('3');
    setMitigation('');
    setOwnerId(null);
    setDueIn(null);
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) {
    return (
      <SubmitSuccess
        title={t(editId ? 'Entry updated' : isDelay ? 'Delay recorded' : 'Risk saved')}
        subtitle={`${saved.riskNo}: ${saved.title}.${!editId && (isDelay || level === 'HIGH') ? ` ${t('The project manager has been told.')}` : ''}`}
        detailHref={`/risk/${saved.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: editId ? t('Update {no}', { no: existing.data?.riskNo ?? '' }) : t(isDelay ? 'Record delay' : 'New risk') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Chips
          label={t('This is')}
          value={kind}
          clearable={false}
          onChange={(v) => {
            const k = v ?? 'DELAY';
            setKind(k);
            if (!editId) setProbability(k === 'DELAY' ? '5' : '3');
          }}
          options={[
            { value: 'DELAY', label: t('A delay: work held up') },
            { value: 'RISK', label: t('A risk: might happen') },
          ]}
        />
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={(v) => { setProjectId(v); setActivityId(null); setOwnerId(null); }} placeholder={t('Choose project')} error={errors.projectId} disabled={!!editId} />
        <Input {...field()} label={t(isDelay ? 'What is holding up work' : 'What might happen')} required value={title} onChangeText={setTitle} placeholder={t(isDelay ? 'e.g. Encroachment at Ch 12+300' : 'e.g. HT line not shifted before WMM')} error={errors.title} />
        <Select label={t('Category')} required value={category} options={categoryOptions} onChange={setCategory} placeholder={t('Choose category')} error={errors.category} />
        <Select label={t('Activity affected')} value={activityId} options={activityOptions} onChange={setActivityId} placeholder={t(projectId ? 'Choose activity (optional)' : 'Choose a project first')} disabled={!projectId} emptyText={t('No activities in this project')} />
        <Input {...field({ multiline: true })} label={t('Details')} value={description} onChangeText={setDescription} multiline />
      </Card>
      {isDelay ? (
        <Card title={t('Delay')}>
          <DatePicker label={t('Held up since')} required value={delayStart} onChange={setDelayStart} error={errors.delayStart} />
          <Chips label={t('Work')} value={resumed ? 'yes' : 'no'} clearable={false} onChange={(v) => setResumed(v === 'yes')} options={[{ value: 'no', label: t('Still held up') }, { value: 'yes', label: t('Has resumed') }]} />
          {resumed ? <DatePicker label={t('Resumed on')} required value={delayEnd} onChange={setDelayEnd} error={errors.delayEnd} /> : null}
          {days !== null ? <Text style={styles.days}>{days === 1 ? t(resumed ? '1 day lost' : '1 day lost so far') : t(resumed ? '{n} days lost' : '{n} days lost so far', { n: days })}</Text> : null}
          <Chips label={t('Caused by')} value={party} onChange={setParty} options={DELAY_PARTIES.map((p) => ({ value: p, label: t(DELAY_PARTY_LABELS[p]) }))} />
        </Card>
      ) : null}
      <Card title={t('Rating')}>
        <Chips label={t('Probability (1 very low to 5 very high)')} value={probability} clearable={false} onChange={(v) => setProbability(v ?? '3')} options={RATINGS} />
        <Chips label={t('Impact on time / cost')} value={impact} clearable={false} onChange={(v) => setImpact(v ?? '3')} options={RATINGS} />
        <View style={[styles.scoreBox, { borderColor: LEVEL_TONE[level] }]}>
          <Text style={typography.caption}>{t('Score')}</Text>
          <Text style={[styles.score, { color: LEVEL_TONE[level] }]}>
            {score} · {t(RISK_LEVEL_LABELS[level])}
          </Text>
        </View>
      </Card>
      <Card title={t('Follow-up')}>
        <Input {...field({ multiline: true })} label={t(isDelay ? 'Action being taken' : 'Mitigation')} value={mitigation} onChangeText={setMitigation} multiline />
        <Select label={t('Owner')} value={ownerId} options={ownerOptions} onChange={setOwnerId} placeholder={t(projectId ? 'Who follows it up (optional)' : 'Choose a project first')} disabled={!projectId} emptyText={t('No team members')} />
        <Chips
          label={`${t('Action due')}${due ? `: ${formatDate(due)}` : ''}`}
          value={dueIn}
          onChange={(v) => {
            setDueIn(v);
            if (!v) setDueDate(null);
          }}
          options={DUE_PRESETS.map((p) => ({ ...p, label: t(p.label) }))}
        />
      </Card>
      {editId ? (
        <Card title={t('Status')}>
          <Chips value={status} clearable={false} onChange={(v) => setStatus(v ?? 'OPEN')} options={RISK_STATUSES.map((s) => ({ value: s, label: t(RISK_STATUS_LABELS[s]) }))} />
          {status === 'CLOSED' ? <Input {...field({ multiline: true })} label={t('How was it resolved')} required value={closureNote} onChangeText={setClosureNote} multiline error={errors.closureNote} /> : null}
        </Card>
      ) : null}
      <Card title={t('Photos / letters')}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={t(editId ? 'Save' : isDelay ? 'Record delay' : 'New risk')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { ...typography.bodyStrong, color: colors.danger, marginBottom: spacing.md },
  scoreBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, padding: spacing.md, borderRadius: radius.md },
  score: { fontSize: 20, fontWeight: '800' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
