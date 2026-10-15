import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Paginated, SafetyIncidentDto, SafetySummaryDto, ToolboxTalkDto, WorkPermitDto } from '@erp/shared';
import { SAFETY_INCIDENT_STATUS_LABELS, SAFETY_INCIDENT_TYPE_LABELS, WORK_PERMIT_TYPE_LABELS, canReportSafety } from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useFetch } from '../src/api/hooks';
import { Button, Card, Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Select, Stat } from '../src/components';
import { INCIDENT_TONE, permitStatus, permitWindow } from '../src/components/safetyTone';
import { useProjectOptions } from '../src/forms/common';
import { colors, radius, spacing, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';

type Show = 'incidents' | 'permits' | 'talks';

/** Safety at site: days without a lost-time injury, incidents and near misses, permits to work and toolbox talks. */
export default function SafetyScreen() {
  const params = useLocalSearchParams<{ projectId?: string; show?: Show }>();
  const router = useRouter();
  const { user } = useAuth();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [show, setShow] = useState<Show>(params.show ?? 'incidents');
  const mayReport = !!user && canReportSafety(user.roleKey);

  const p = projectId ?? undefined;
  const key = projectId ?? 'all';
  const summary = useFetch<SafetySummaryDto>((a) => a.get('/safety/summary', { projectId: p }), [projectId], { cacheKey: `safety-summary:${key}` });
  const incidents = useFetch<Paginated<SafetyIncidentDto>>((a) => a.get('/safety/incidents', { projectId: p, pageSize: 50 }), [projectId], { enabled: show === 'incidents', cacheKey: `safety-incidents:${key}` });
  const permits = useFetch<Paginated<WorkPermitDto>>((a) => a.get('/safety/permits', { projectId: p, active: true, pageSize: 50 }), [projectId], { enabled: show === 'permits', cacheKey: `safety-permits:${key}` });
  const talks = useFetch<Paginated<ToolboxTalkDto>>((a) => a.get('/safety/talks', { projectId: p, pageSize: 50 }), [projectId], { enabled: show === 'talks', cacheKey: `safety-talks:${key}` });
  const list = show === 'incidents' ? incidents : show === 'permits' ? permits : talks;

  const href = (path: string, extra = '') => `${path}${projectId || extra ? '?' : ''}${projectId ? `projectId=${projectId}` : ''}${projectId && extra ? '&' : ''}${extra}`;
  if (projects.loading && !projects.data) return <Loading />;
  const s = summary.data;
  const total = list.data?.total ?? 0;

  return (
    <Screen
      refreshing={list.refreshing}
      onRefresh={() => {
        summary.refresh();
        list.refresh();
      }}
    >
      <ErrorBanner message={projects.error ?? (list.data ? null : list.error)} />
      <Card>
        <Select label="Project" value={projectId} options={[{ value: '', label: 'All my projects' }, ...projects.options]} onChange={(v) => setProjectId(v || null)} placeholder="All my projects" />
        {mayReport ? (
          <>
            <View style={styles.actions}>
              <Button title="Near miss" icon="eye-outline" variant="secondary" onPress={() => router.push(href('/incident/new', 'nearMiss=1'))} style={styles.flex} />
              <Button title="Incident" icon="medkit-outline" onPress={() => router.push(href('/incident/new'))} style={styles.flex} />
            </View>
            <View style={styles.actions}>
              <Button title="Toolbox talk" icon="megaphone-outline" variant="secondary" onPress={() => router.push(href('/talk/new'))} style={styles.flex} />
              <Button title="Ask for permit" icon="key-outline" variant="secondary" onPress={() => router.push(href('/permit/new'))} style={styles.flex} />
            </View>
          </>
        ) : null}
      </Card>

      {s ? (
        <>
          <View style={[styles.banner, { backgroundColor: s.daysSinceLostTime !== null && s.daysSinceLostTime < 30 ? colors.dangerSoft : colors.successSoft }]}>
            <Text style={[styles.bannerValue, { color: s.daysSinceLostTime !== null && s.daysSinceLostTime < 30 ? colors.danger : colors.success }]}>{s.daysSinceLostTime ?? 'No'}</Text>
            <Text style={typography.caption}>
              {s.daysSinceLostTime === null ? 'lost-time injury recorded' : `day${s.daysSinceLostTime === 1 ? '' : 's'} without a lost-time injury`}
              {s.lastLostTimeDate ? ` (last ${formatDate(s.lastLostTimeDate)})` : ''}
            </Text>
          </View>
          <View style={styles.stats}>
            <Stat label="Incidents this month" value={s.incidentsThisMonth} tone={s.incidentsThisMonth ? colors.danger : colors.success} />
            <Stat label="Near misses" value={s.nearMissesThisMonth} tone={colors.primary} />
            <Stat label="Open" value={s.openIncidents} tone={s.openIncidents ? colors.warning : colors.success} />
          </View>
          <View style={styles.stats}>
            <Stat label="Talks this month" value={s.toolboxTalksThisMonth} />
            <Stat label="Attended" value={s.attendeesThisMonth} />
            <Stat label="Permits waiting / live" value={`${s.permitsRequested} / ${s.permitsActive}`} tone={s.permitsRequested ? colors.warning : colors.primary} />
          </View>
        </>
      ) : null}

      <Chips
        value={show}
        clearable={false}
        onChange={(v) => v && setShow(v)}
        options={[
          { value: 'incidents', label: 'Incidents' },
          { value: 'permits', label: `Permits${s?.permitsRequested ? ` (${s.permitsRequested})` : ''}` },
          { value: 'talks', label: 'Toolbox talks' },
        ]}
      />

      {list.loading && !list.data ? (
        <Loading />
      ) : total === 0 ? (
        <EmptyState
          title={show === 'incidents' ? 'No incidents' : show === 'permits' ? 'No permits waiting or live' : 'No toolbox talks'}
          subtitle={show === 'incidents' ? 'Incidents and near misses reported at your sites show here.' : show === 'permits' ? 'Permits to work asked for and issued show here.' : 'Talks recorded at your sites show here.'}
          icon="medkit-outline"
        />
      ) : (
        <>
          <SectionTitle title={`${total} ${show === 'incidents' ? `incident${total === 1 ? '' : 's'}` : show === 'permits' ? `permit${total === 1 ? '' : 's'} waiting or live` : `talk${total === 1 ? '' : 's'}`}`} />
          {show === 'incidents'
            ? (incidents.data?.items ?? []).map((r) => (
                <Row key={r.id} onPress={() => router.push(`/incident/${r.id}`)} icon="medkit" title={`${SAFETY_INCIDENT_TYPE_LABELS[r.type]} · ${r.location}`} sub={`${r.incidentNo} · ${formatDate(r.date)}${r.injuredCount ? ` · ${r.injuredCount} hurt` : ''}`} meta={projectId ? r.reportedByName : `${r.projectName} · ${r.reportedByName}`}>
                  <Pill text={SAFETY_INCIDENT_STATUS_LABELS[r.status]} fg={r.status === 'OPEN' ? INCIDENT_TONE[r.type].fg : colors.neutral} bg={r.status === 'OPEN' ? INCIDENT_TONE[r.type].bg : colors.neutralSoft} />
                </Row>
              ))
            : show === 'permits'
              ? (permits.data?.items ?? []).map((r) => {
                  const st = permitStatus(r);
                  return (
                    <Row key={r.id} onPress={() => router.push(`/permit/${r.id}`)} icon="key" title={`${WORK_PERMIT_TYPE_LABELS[r.type]} · ${r.location}`} sub={`${r.permitNo} · ${permitWindow(r)}`} meta={projectId ? r.requestedByName : `${r.projectName} · ${r.requestedByName}`}>
                      <Pill text={st.text} fg={st.fg} bg={st.bg} />
                    </Row>
                  );
                })
              : (talks.data?.items ?? []).map((r) => (
                  <Row key={r.id} icon="megaphone" title={r.topic} sub={`${r.talkNo} · ${formatDate(r.date)} · ${r.attendeeCount} attended`} meta={`${projectId ? '' : `${r.projectName} · `}by ${r.conductedBy}`} />
                ))}
        </>
      )}
    </Screen>
  );
}

function Row({ icon, title, sub, meta, onPress, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; meta: string; onPress?: () => void; children?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={2}>
          {title}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {sub}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.side}>
        {children}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  banner: { alignItems: 'center', padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md },
  bannerValue: { fontSize: 32, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  side: { alignItems: 'flex-end', gap: 4 },
});
