import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { PpeIssueResultDto, PpeKind, PpeRegisterDto } from '@erp/shared';
import { PPE_KINDS, PPE_KIND_LABELS } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, Input, Loading, Pill, Screen, Select, Touchable } from '../../src/components';
import { Checklist } from '../../src/components/safetyTone';
import { QueuedSuccess, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, radius, spacing, touch, typography } from '../../src/theme';
import { formatDate, isIsoDate, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';

type Show = 'missing' | 'present' | 'all';
const LABEL_TO_KIND = new Map(PPE_KINDS.map((k) => [PPE_KIND_LABELS[k], k] as const));

/** Hand PPE to workers at site: tick the kit and the workers (works offline through the outbox). */
export default function IssuePpeScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // One id for a direct send and the outbox, so a batch that timed out but arrived is never issued twice.
  const clientId = useRef(newId());
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [kinds, setKinds] = useState<PpeKind[] | null>(null);
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [show, setShow] = useState<Show>('missing');
  const [date, setDate] = useState(today());
  const [size, setSize] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<PpeIssueResultDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const register = useFetch<PpeRegisterDto>((a) => a.get(`/ppe/projects/${projectId}/register`), [projectId], { enabled: !!projectId, cacheKey: `ppe-register:${projectId ?? ''}` });
  const reg = register.data && register.data.projectId === projectId ? register.data : null;
  const ticked = kinds ?? reg?.required ?? [];

  const shown = useMemo(() => {
    const all = reg?.workers ?? [];
    if (show === 'missing') return all.filter((w) => w.missing.length);
    if (show === 'present') return all.filter((w) => w.presentToday && w.missing.length);
    return all;
  }, [reg, show]);
  const allShownPicked = shown.length > 0 && shown.every((w) => workerIds.includes(w.workerId));

  const toggle = (id: string) => setWorkerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const pickShown = () => setWorkerIds((ids) => (allShownPicked ? ids.filter((id) => !shown.some((w) => w.workerId === id)) : [...new Set([...ids, ...shown.map((w) => w.workerId)])]));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!ticked.length) e.kinds = t('Tick at least one item');
    if (!workerIds.length) e.workers = t('Choose at least one worker');
    if (!isIsoDate(date) || date > today()) e.date = t('Enter a date up to today');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = { projectId, workerIds, kinds: ticked, issuedOn: date, size: size.trim() || undefined, note: note.trim() || undefined };
      const items = ticked.map((k) => t(PPE_KIND_LABELS[k])).join(', ');
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(await enqueue({ id: clientId.current, type: 'PPE_ISSUE', payload: body, photos: [], title: `${t('PPE')} · ${items}`, subtitle: `${projectName} · ${formatDate(date)} · ${t('{n} workers', { n: workerIds.length })}` }));
      };
      if (!online) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<PpeIssueResultDto>('/ppe/issues', { id: clientId.current, ...body }));
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
    setWorkerIds([]);
    setSize('');
    setNote('');
    setErrors({});
    register.refresh();
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved)
    return (
      <SubmitSuccess
        title={t('PPE issued')}
        subtitle={saved.replaced ? t('{n} items issued, {r} older ones replaced.', { n: saved.issued, r: saved.replaced }) : t('{n} items issued.', { n: saved.issued })}
        detailHref={`/safety?projectId=${projectId}`}
        onAnother={reset}
      />
    );
  if (projects.loading && !projects.data) return <Loading />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef} refreshing={register.refreshing} onRefresh={register.refresh}>
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? (reg ? null : register.error)} />
      <Card>
        <Select
          label={t('Project')}
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setWorkerIds([]);
            setKinds(null);
          }}
          placeholder={t('Choose project')}
          error={errors.projectId}
        />
        <DatePicker label={t('Issued on')} required value={date} onChange={setDate} error={errors.date} />
      </Card>

      {projectId && !reg && register.loading ? <Loading /> : null}
      {reg ? (
        <>
          {reg.counts.presentMissing ? (
            <View style={styles.alert} accessibilityRole="alert">
              <Ionicons name="warning" size={20} color={colors.danger} />
              <Text style={[typography.body, styles.flex, { color: colors.danger }]}>{t('{n} on site today without the required kit', { n: reg.counts.presentMissing })}</Text>
            </View>
          ) : null}
          <Card title={t('Kit')}>
            <Checklist items={PPE_KINDS.map((k) => PPE_KIND_LABELS[k])} value={ticked.map((k) => PPE_KIND_LABELS[k])} onChange={(labels) => setKinds(labels.map((l) => LABEL_TO_KIND.get(l)!).filter(Boolean))} />
            {errors.kinds ? <Text style={styles.err}>{errors.kinds}</Text> : null}
          </Card>
          <Card title={t('Workers')}>
            <Chips
              value={show}
              clearable={false}
              onChange={(v) => v && setShow(v)}
              options={[
                { value: 'missing', label: t('Missing kit ({n})', { n: reg.counts.missingAny }) },
                { value: 'present', label: t('On site, missing ({n})', { n: reg.counts.presentMissing }) },
                { value: 'all', label: t('All ({n})', { n: reg.counts.workers }) },
              ]}
            />
            {shown.length ? (
              <Button title={t(allShownPicked ? 'Clear these' : 'Choose all of these')} icon={allShownPicked ? 'close' : 'checkmark-done'} variant="secondary" onPress={pickShown} style={styles.gap} />
            ) : (
              <EmptyState title={t(reg.counts.workers ? 'Nobody in this view' : 'No named workers here yet')} subtitle={t(reg.counts.workers ? 'Everyone has the required kit.' : 'Add workers on the roll call first.')} icon="shield-checkmark-outline" />
            )}
            {shown.map((w) => {
              const on = workerIds.includes(w.workerId);
              return (
                <Touchable key={w.workerId} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${w.name}, ${w.trade}`} onPress={() => toggle(w.workerId)} style={styles.row}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.success : colors.textMuted} />
                  <View style={styles.flex}>
                    <Text style={typography.bodyStrong}>{w.name}</Text>
                    <Text style={typography.caption}>
                      {w.workerNo} · {t(w.trade)}
                      {w.presentToday ? ` · ${t('On site')}` : ''}
                    </Text>
                    {w.missing.length ? (
                      <View style={styles.pills}>
                        {w.missing.map((k) => (
                          <Pill key={k} text={t('No {item}', { item: t(PPE_KIND_LABELS[k]).toLowerCase() })} fg={colors.danger} bg={colors.dangerSoft} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Touchable>
              );
            })}
            {errors.workers ? <Text style={styles.err}>{errors.workers}</Text> : null}
          </Card>
          <Card>
            <Input {...field()} label={t('Size')} value={size} onChangeText={setSize} maxLength={20} placeholder={t('When one size suits everyone, e.g. 9 or L')} />
            <Input {...field({ multiline: true })} label={t('Note')} value={note} onChangeText={setNote} multiline maxLength={500} />
          </Card>
          <Button title={workerIds.length ? t('Issue to {n} workers', { n: workerIds.length }) : t('Issue PPE')} icon="send" onPress={submit} loading={busy} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { marginBottom: spacing.sm },
  alert: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: touch.min, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  err: { color: colors.danger, marginTop: spacing.xs, fontSize: typography.caption.fontSize },
});
