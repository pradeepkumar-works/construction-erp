import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canRaiseRfi, type Paginated, type RfiDto, type RfiStatus, type RfiSummaryDto } from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useFetch } from '../src/api/hooks';
import { Button, Card, Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Select, Stat, Touchable } from '../src/components';
import { rfiStatus } from '../src/components/rfiTone';
import { useProjectOptions } from '../src/forms/common';
import { colors, radius, spacing, touch, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

type Show = 'waiting' | 'answered' | 'all';

/** RFIs of one project (or all of the user's projects): questions to the client or consultant and their answers. */
export default function RfisScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [show, setShow] = useState<Show>('waiting');
  const mayRaise = !!user && canRaiseRfi(user.roleKey);

  const status: RfiStatus | undefined = show === 'waiting' ? 'OPEN' : show === 'answered' ? 'ANSWERED' : undefined;
  const list = useFetch<Paginated<RfiDto>>((a) => a.get('/rfis', { projectId: projectId ?? undefined, status, pageSize: 100 }), [projectId, show], { cacheKey: `rfis:${projectId ?? 'all'}:${show}` });
  const summary = useFetch<RfiSummaryDto>((a) => a.get('/rfis/summary', { projectId: projectId ?? undefined }), [projectId], { cacheKey: `rfis-summary:${projectId ?? 'all'}` });

  if (projects.loading && !projects.data) return <Loading />;
  const rows = list.data?.items ?? [];
  const s = summary.data;

  return (
    <Screen
      refreshing={list.refreshing}
      onRefresh={() => {
        list.refresh();
        summary.refresh();
      }}
    >
      <ErrorBanner message={projects.error ?? (list.data ? null : list.error)} />
      <Card>
        <Select label={t('Project')} value={projectId} options={[{ value: '', label: t('All my projects') }, ...projects.options]} onChange={(v) => setProjectId(v || null)} placeholder={t('All my projects')} />
        {mayRaise ? <Button title={t('Raise RFI')} icon="help-circle-outline" onPress={() => router.push(`/rfi/new${projectId ? `?projectId=${projectId}` : ''}`)} /> : null}
      </Card>
      {s ? (
        <View style={styles.stats}>
          <Stat label={t('Waiting')} value={s.open} tone={colors.primary} />
          <Stat label={t('Overdue')} value={s.overdue} tone={s.overdue ? colors.danger : colors.success} />
          <Stat label={t('Answered')} value={s.answered} tone={s.answered ? colors.warning : colors.neutral} />
        </View>
      ) : null}
      <Chips
        value={show}
        clearable={false}
        onChange={(v) => v && setShow(v)}
        options={[
          { value: 'waiting', label: t('Waiting for answer') },
          { value: 'answered', label: t('Answered') },
          { value: 'all', label: t('All') },
        ]}
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title={t(show === 'waiting' ? 'No RFIs waiting' : show === 'answered' ? 'No answered RFIs to act on' : 'No RFIs yet')} subtitle={t('Questions to the client or consultant, and their answers, show here.')} icon="help-circle-outline" />
      ) : (
        <>
          <SectionTitle title={rows.length === 1 ? t('1 RFI') : t('{n} RFIs', { n: rows.length })} />
          {rows.map((r) => {
            const st = rfiStatus(r.status, r.age, t);
            return (
              <Touchable key={r.id} accessibilityRole="button" onPress={() => router.push(`/rfi/${r.id}`)} style={styles.row}>
                <View style={styles.icon}>
                  <Ionicons name="help-circle" size={20} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={typography.bodyStrong} numberOfLines={2}>
                    {r.subject}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {r.rfiNo} · {t('answer by {date}', { date: formatDate(r.replyBy) })}
                    {r.priority === 'URGENT' ? ` · ${t('Urgent')}` : ''}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {projectId ? (r.location ?? r.toParty) : r.projectName}
                  </Text>
                </View>
                <View style={styles.side}>
                  <Pill text={st.text} fg={st.fg} bg={st.bg} icon={st.icon} />
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
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, minHeight: touch.min },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  side: { alignItems: 'flex-end', gap: 4 },
});
