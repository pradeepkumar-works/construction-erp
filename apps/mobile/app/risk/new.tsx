import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ActivityDto, DelayParty, ProjectDetail, RiskCategory, RiskDto, RiskKind, RiskStatus } from '@erp/shared';
import { DELAY_PARTIES, DELAY_PARTY_LABELS, RISK_CATEGORIES, RISK_CATEGORY_LABELS, RISK_LEVEL_LABELS, RISK_STATUSES, RISK_STATUS_LABELS, delayDays, riskLevel, riskScore } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto, type SelectOption } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, QueuedSuccess, SubmitSuccess, toOutboxPhotos, useProjectOptions } from '../../src/forms/common';
import { attachmentsToPhotos } from '../../src/forms/edit';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, radius, spacing, typography } from '../../src/theme';
import { addDays, formatDate, isIsoDate, today } from '../../src/utils/format';

const RATINGS = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));
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
  const { online, enqueue } = useOffline();
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

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

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
  }, [existing.data]);

  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `activities:${projectId}` });
  const project = useFetch<ProjectDetail>((a) => a.get(`/projects/${projectId}`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `project:${projectId}` });
  const activityOptions = useMemo<SelectOption[]>(() => (activities.data ?? []).map((a) => ({ value: a.id, label: a.name })), [activities.data]);
  const categoryOptions = useMemo<SelectOption<RiskCategory>[]>(() => RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABELS[c] })), []);
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
    if (!projectId) e.projectId = 'Choose a project';
    if (!title.trim()) e.title = isDelay ? 'Say what is holding up work' : 'Say what might happen';
    if (!category) e.category = 'Choose a category';
    if (isDelay) {
      if (!isIsoDate(delayStart) || delayStart > today()) e.delayStart = 'Enter a date up to today';
      if (resumed && (!isIsoDate(delayEnd) || delayEnd < delayStart || delayEnd > today())) e.delayEnd = 'Between the start and today';
    }
    if (editId && status === 'CLOSED' && !closureNote.trim()) e.closureNote = 'Say how it was resolved';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    else if (editId && photosQueued(photos)) e.photos = 'Photos need a connection to upload before saving';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const blank = editId ? null : undefined;
      const t = (v: string) => v.trim() || blank;
      const body = {
        kind,
        category,
        title: title.trim(),
        description: t(description),
        activityId: activityId ?? blank,
        ownerId: ownerId ?? blank,
        probability: Number(probability),
        impact: Number(impact),
        mitigation: t(mitigation),
        dueDate: due ?? blank,
        delayStart: isDelay ? delayStart : null,
        delayEnd: isDelay && resumed ? delayEnd : null,
        responsibleParty: isDelay ? party : null,
      };
      if (editId) {
        setSaved(await api.patch<RiskDto>(`/risks/${editId}`, { ...body, status, closureNote: status === 'CLOSED' ? closureNote.trim() : t(closureNote), attachmentIds: attachmentIds(photos) }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? 'Project';
        setQueued(
          await enqueue({
            type: 'RISK',
            payload: { projectId, ...body },
            photos: toOutboxPhotos(photos),
            title: `${isDelay ? 'Delay' : 'Risk'} · ${title.trim()}`,
            subtitle: `${projectName} · ${formatDate(today())}`,
          }),
        );
      };
      if (!online || photosQueued(photos)) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<RiskDto>('/risks', { projectId, ...body, attachmentIds: attachmentIds(photos) }));
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
    setSaved(null);
    setQueued(null);
    setTitle('');
    setDescription('');
    setActivityId(null);
    setMitigation('');
    setPhotos([]);
    setErrors({});
  };

  if (queued) return <QueuedSuccess title="Saved on this phone" subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved) {
    return (
      <SubmitSuccess
        title={editId ? 'Entry updated' : isDelay ? 'Delay recorded' : 'Risk raised'}
        subtitle={`${saved.riskNo}: ${saved.title}.${!editId && (isDelay || level === 'HIGH') ? ' The project manager has been told.' : ''}`}
        detailHref={`/risk/${saved.id}`}
        onAnother={editId ? undefined : reset}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? `Update ${existing.data?.riskNo ?? ''}` : isDelay ? 'Record a Delay' : 'Raise a Risk' }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <Card>
        <Chips
          label="This is"
          value={kind}
          clearable={false}
          onChange={(v) => {
            const k = v ?? 'DELAY';
            setKind(k);
            if (!editId) setProbability(k === 'DELAY' ? '5' : '3');
          }}
          options={[
            { value: 'DELAY', label: 'A delay: work held up' },
            { value: 'RISK', label: 'A risk: might happen' },
          ]}
        />
        <Select label="Project" required value={projectId} options={projects.options} onChange={(v) => { setProjectId(v); setActivityId(null); setOwnerId(null); }} placeholder="Choose project" error={errors.projectId} disabled={!!editId} />
        <Input label={isDelay ? 'What is holding up work' : 'What might happen'} required value={title} onChangeText={setTitle} placeholder={isDelay ? 'e.g. Encroachment at Ch 12+300' : 'e.g. HT line not shifted before WMM'} error={errors.title} />
        <Select label="Category" required value={category} options={categoryOptions} onChange={setCategory} placeholder="Choose category" error={errors.category} />
        <Select label="Activity affected" value={activityId} options={activityOptions} onChange={setActivityId} placeholder={projectId ? 'Choose activity (optional)' : 'Choose a project first'} disabled={!projectId} emptyText="No activities in this project" />
        <Input label="Details" value={description} onChangeText={setDescription} multiline />
      </Card>
      {isDelay ? (
        <Card title="Delay">
          <DatePicker label="Held up since" required value={delayStart} onChange={setDelayStart} error={errors.delayStart} />
          <Chips label="Work" value={resumed ? 'yes' : 'no'} clearable={false} onChange={(v) => setResumed(v === 'yes')} options={[{ value: 'no', label: 'Still held up' }, { value: 'yes', label: 'Has resumed' }]} />
          {resumed ? <DatePicker label="Resumed on" required value={delayEnd} onChange={setDelayEnd} error={errors.delayEnd} /> : null}
          {days !== null ? <Text style={styles.days}>{days} day{days === 1 ? '' : 's'} lost{resumed ? '' : ' so far'}</Text> : null}
          <Chips label="Caused by" value={party} onChange={setParty} options={DELAY_PARTIES.map((p) => ({ value: p, label: DELAY_PARTY_LABELS[p] }))} />
        </Card>
      ) : null}
      <Card title="Rating">
        <Chips label="Probability (1 very low to 5 very high)" value={probability} clearable={false} onChange={(v) => setProbability(v ?? '3')} options={RATINGS} />
        <Chips label="Impact on time / cost" value={impact} clearable={false} onChange={(v) => setImpact(v ?? '3')} options={RATINGS} />
        <View style={[styles.scoreBox, { borderColor: LEVEL_TONE[level] }]}>
          <Text style={typography.caption}>Score</Text>
          <Text style={[styles.score, { color: LEVEL_TONE[level] }]}>
            {score} · {RISK_LEVEL_LABELS[level]}
          </Text>
        </View>
      </Card>
      <Card title="Follow-up">
        <Input label={isDelay ? 'Action being taken' : 'Mitigation'} value={mitigation} onChangeText={setMitigation} multiline />
        <Select label="Owner" value={ownerId} options={ownerOptions} onChange={setOwnerId} placeholder={projectId ? 'Who follows it up (optional)' : 'Choose a project first'} disabled={!projectId} emptyText="No team members" />
        <Chips
          label={`Action due${due ? `: ${formatDate(due)}` : ''}`}
          value={dueIn}
          onChange={(v) => {
            setDueIn(v);
            if (!v) setDueDate(null);
          }}
          options={DUE_PRESETS}
        />
      </Card>
      {editId ? (
        <Card title="Status">
          <Chips value={status} clearable={false} onChange={(v) => setStatus(v ?? 'OPEN')} options={RISK_STATUSES.map((s) => ({ value: s, label: RISK_STATUS_LABELS[s] }))} />
          {status === 'CLOSED' ? <Input label="How was it resolved" required value={closureNote} onChangeText={setClosureNote} multiline error={errors.closureNote} /> : null}
        </Card>
      ) : null}
      <Card title="Photos / letters">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
      </Card>
      <Button title={editId ? 'Save' : isDelay ? 'Record delay' : 'Raise risk'} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { ...typography.bodyStrong, color: colors.danger, marginBottom: spacing.md },
  scoreBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, padding: spacing.md, borderRadius: radius.md },
  score: { fontSize: 20, fontWeight: '800' },
  err: { color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13 },
});
