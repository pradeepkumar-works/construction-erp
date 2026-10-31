import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, RISK_STATUS_LABELS, canRaiseRisk, riskLevel, type DelaySuggestionDto, type Paginated, type RiskDto, type RiskKind, type RiskSummaryDto } from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useFetch } from '../src/api/hooks';
import { Button, Card, Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Select, Stat, Touchable } from '../src/components';
import { LEVEL_TONE, RISK_STATUS_TONE } from '../src/components/riskTone';
import { useProjectOptions } from '../src/forms/common';
import { colors, maxFontScale, radius, spacing, touch, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

type Show = 'active' | 'closed' | 'all';

/** The delay and risk register of one project (or all of the user's projects): active entries first by score. */
export default function RisksScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [show, setShow] = useState<Show>('active');
  const [kind, setKind] = useState<RiskKind | null>(null);
  const mayRaise = !!user && canRaiseRisk(user.roleKey);

  const query = { projectId: projectId ?? undefined, kind: kind ?? undefined, active: show === 'active' ? true : undefined, status: show === 'closed' ? 'CLOSED' : undefined, pageSize: 100 };
  const list = useFetch<Paginated<RiskDto>>((a) => a.get('/risks', query), [projectId, show, kind], { cacheKey: `risks:${projectId ?? 'all'}:${show}:${kind ?? 'all'}` });
  const summary = useFetch<RiskSummaryDto>((a) => a.get('/risks/summary', { projectId: projectId ?? undefined }), [projectId], { cacheKey: `risks-summary:${projectId ?? 'all'}` });
  const suggestions = useFetch<DelaySuggestionDto[]>((a) => a.get('/risks/suggestions', { projectId: projectId ?? undefined }), [projectId], { enabled: mayRaise });

  const newHref = (k: RiskKind, extra = '') => `/risk/new?kind=${k}${projectId ? `&projectId=${projectId}` : ''}${extra}`;
  if (projects.loading && !projects.data) return <Loading />;
  const rows = list.data?.items ?? [];
  const s = summary.data;

  return (
    <Screen
      refreshing={list.refreshing}
      onRefresh={() => {
        list.refresh();
        summary.refresh();
        suggestions.refresh();
      }}
    >
      <ErrorBanner message={projects.error ?? (list.data ? null : list.error)} />
      <Card>
        <Select label={t('Project')} value={projectId} options={[{ value: '', label: t('All my projects') }, ...projects.options]} onChange={(v) => setProjectId(v || null)} placeholder={t('All my projects')} />
        <Chips value={show} clearable={false} onChange={(v) => v && setShow(v)} options={[{ value: 'active', label: t('Open and monitoring') }, { value: 'closed', label: t('Closed') }, { value: 'all', label: t('All') }]} />
        <Chips value={kind} onChange={setKind} options={[{ value: 'DELAY', label: t('Delays') }, { value: 'RISK', label: t('Risks') }]} />
        {mayRaise ? (
          <View style={styles.actions}>
            <Button title={t('Record delay')} icon="time-outline" onPress={() => router.push(newHref('DELAY'))} style={styles.flex} />
            <Button title={t('New risk')} icon="alert-circle-outline" variant="secondary" onPress={() => router.push(newHref('RISK'))} style={styles.flex} />
          </View>
        ) : null}
      </Card>

      {s ? (
        <View style={styles.stats}>
          <Stat label={t('Holding up work')} value={s.openDelays} tone={s.openDelays ? colors.danger : colors.success} />
          <Stat label={t('High risks')} value={s.highRisks} tone={s.highRisks ? colors.danger : colors.success} />
          <Stat label={t('Days lost')} value={s.daysLost} tone={colors.warning} />
        </View>
      ) : null}

      {mayRaise && suggestions.data?.length ? (
        <Card title={t('Behind schedule, no delay recorded')}>
          {suggestions.data.slice(0, 5).map((x) => (
            <Touchable
              key={x.activityId}
              accessibilityRole="button"
              style={styles.suggestion}
              onPress={() => router.push(`/risk/new?kind=DELAY&projectId=${x.projectId}&activityId=${x.activityId}&title=${encodeURIComponent(t('{activity} behind schedule', { activity: x.activityName }))}`)}
            >
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.bodyStrong}>{x.activityName}</Text>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                  {t('{days} d past {date} · {pct}% done', { days: x.daysLate, date: formatDate(x.plannedEnd), pct: x.progressPct })}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.link}>{t('Record')}</Text>
            </Touchable>
          ))}
        </Card>
      ) : null}

      {list.loading && !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title={t(show === 'closed' ? 'Nothing closed yet' : 'Nothing open')} subtitle={t('Delays and risks raised for your projects show here.')} icon="alert-circle-outline" />
      ) : (
        <>
          <SectionTitle title={(list.data?.total ?? rows.length) === 1 ? t('1 entry') : t('{n} entries', { n: list.data?.total ?? rows.length })} />
          {rows.map((r) => {
            const tone = LEVEL_TONE[riskLevel(r.score)];
            return (
              <Touchable key={r.id} accessibilityRole="button" onPress={() => router.push(`/risk/${r.id}`)} style={styles.row}>
                <View style={[styles.score, { backgroundColor: tone.bg }]}>
                  <Text maxFontSizeMultiplier={maxFontScale} style={[styles.scoreText, { color: tone.fg }]}>{r.score}</Text>
                </View>
                <View style={styles.flex}>
                  <Text maxFontSizeMultiplier={maxFontScale} style={typography.bodyStrong} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption} numberOfLines={1}>
                    {r.riskNo} · {r.kind === 'DELAY' ? `${t('{n} d lost', { n: r.daysLost ?? 0 })}${r.responsibleParty ? ` · ${t(DELAY_PARTY_LABELS[r.responsibleParty])}` : ''}` : t(RISK_CATEGORY_LABELS[r.category])}
                  </Text>
                  <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, r.overdue && styles.overdue]} numberOfLines={1}>
                    {projectId ? '' : `${r.projectName} · `}
                    {r.ownerName ?? t('No owner')}
                    {r.dueDate ? ` · ${t('due {date}', { date: formatDate(r.dueDate) })}` : ''}
                  </Text>
                </View>
                <View style={styles.side}>
                  <Pill text={t(r.kind === 'DELAY' ? 'Delay' : 'Risk')} fg={r.kind === 'DELAY' ? colors.accent : colors.primary} bg={r.kind === 'DELAY' ? colors.accentSoft : colors.primarySoft} />
                  {r.status !== 'OPEN' ? <Pill text={t(RISK_STATUS_LABELS[r.status])} {...RISK_STATUS_TONE[r.status]} /> : null}
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Touchable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  suggestion: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: touch.min },
  link: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, minHeight: touch.min },
  pressed: { opacity: 0.7 },
  score: { minWidth: 44, minHeight: 44, paddingHorizontal: 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 18, fontWeight: '800' },
  side: { alignItems: 'flex-end', gap: 4 },
  overdue: { color: colors.danger, fontWeight: '700' },
});
