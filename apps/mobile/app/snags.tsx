import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DefectDto, Paginated } from '@erp/shared';
import { DEFECT_PHASE_LABELS, canReportDefect } from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useFetch } from '../src/api/hooks';
import { Button, Card, Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Select } from '../src/components';
import { DEFECT_TONE } from '../src/components/defectTone';
import { useProjectOptions } from '../src/forms/common';
import { colors, radius, spacing, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';

type Show = 'OPEN' | 'FIXED' | 'CLOSED';

/** Snags before handover and defects in the defect liability period (v4 item 47): what is open, fixed or closed. */
export default function SnagsScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [show, setShow] = useState<Show>('OPEN');
  const mayReport = !!user && canReportDefect(user.roleKey);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const list = useFetch<Paginated<DefectDto>>((a) => a.get('/defects', { projectId: projectId ?? undefined, status: show, pageSize: 50 }), [projectId, show], {
    cacheKey: `defects:${projectId ?? 'all'}:${show}`,
  });

  if (projects.loading && !projects.data) return <Loading />;
  const total = list.data?.total ?? 0;
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <ErrorBanner message={projects.error ?? (list.data ? null : list.error)} />
      <Card>
        <Select label="Project" value={projectId} options={[{ value: '', label: 'All my projects' }, ...projects.options]} onChange={(v) => setProjectId(v || null)} placeholder="All my projects" />
        {mayReport ? <Button title="Report snag or defect" icon="add-circle" onPress={() => router.push(`/snag/new${projectId ? `?projectId=${projectId}` : ''}`)} /> : null}
      </Card>
      <Chips
        value={show}
        clearable={false}
        onChange={(v) => v && setShow(v)}
        options={[
          { value: 'OPEN', label: 'Open' },
          { value: 'FIXED', label: 'Fixed, to check' },
          { value: 'CLOSED', label: 'Closed' },
        ]}
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : total === 0 ? (
        <EmptyState title={show === 'OPEN' ? 'Nothing open' : show === 'FIXED' ? 'Nothing waiting to be checked' : 'Nothing closed yet'} subtitle="Snags and defects at your sites show here." icon="construct-outline" />
      ) : (
        <>
          <SectionTitle title={`${total} ${show === 'OPEN' ? 'open' : show === 'FIXED' ? 'fixed, to check' : 'closed'}`} />
          {(list.data?.items ?? []).map((d) => (
            <Pressable key={d.id} onPress={() => router.push(`/snag/${d.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.icon}>
                <Ionicons name="construct" size={20} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={typography.bodyStrong} numberOfLines={2}>
                  {d.title}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {d.defectNo} · {d.location ?? DEFECT_PHASE_LABELS[d.phase]}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {projectId ? '' : `${d.projectName} · `}
                  {d.dueDate ? `by ${formatDate(d.dueDate)}` : `found ${formatDate(d.reportedOn)}`}
                </Text>
              </View>
              <View style={styles.side}>
                {d.overdue ? <Pill text="Overdue" fg={colors.danger} bg={colors.dangerSoft} /> : <Pill text={d.priority === 'HIGH' ? 'High' : DEFECT_PHASE_LABELS[d.phase]} {...DEFECT_TONE[d.priority]} />}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  side: { alignItems: 'flex-end', gap: 4 },
});
