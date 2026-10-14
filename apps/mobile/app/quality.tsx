import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { NCR_SEVERITY_LABELS, NCR_STATUS_LABELS, TEST_KIND_LABELS, TEST_RESULT_LABELS, type NcrDto, type Paginated, type QualityTestDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle } from '../src/components';
import { NCR_STATUS_TONE, SEVERITY_TONE, TEST_RESULT_TONE } from '../src/components/qualityTone';
import { colors, radius, spacing, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';

type Show = 'ncrs' | 'tests';

/** Quality on site: open NCRs to act on, and tests with their readings due. */
export default function QualityScreen() {
  const router = useRouter();
  const [show, setShow] = useState<Show>('ncrs');
  const ncrs = useFetch<Paginated<NcrDto>>((a) => a.get('/quality/ncrs', { active: true, sortBy: 'dueDate', sortOrder: 'asc', pageSize: 100 }), [], { cacheKey: 'ncrs:active' });
  const tests = useFetch<Paginated<QualityTestDto>>((a) => a.get('/quality/tests', { result: 'PENDING', pageSize: 100 }), [], { cacheKey: 'tests:pending', enabled: show === 'tests' });
  const list = show === 'ncrs' ? ncrs : tests;

  return (
    <Screen
      refreshing={list.refreshing}
      onRefresh={() => {
        void list.refresh();
      }}
    >
      <Chips<Show>
        value={show}
        clearable={false}
        onChange={(v) => v && setShow(v)}
        options={[
          { value: 'ncrs', label: 'Open NCRs' },
          { value: 'tests', label: 'Tests pending' },
        ]}
      />
      <ErrorBanner message={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : show === 'ncrs' ? (
        (ncrs.data?.items ?? []).length === 0 ? (
          <EmptyState title="No open NCR" subtitle="Non-conformances raised by QA/QC on your projects show here." icon="shield-checkmark-outline" />
        ) : (
          <>
            <SectionTitle title={`${ncrs.data?.total ?? 0} open`} />
            {ncrs.data!.items.map((n) => (
              <Pressable key={n.id} onPress={() => router.push(`/ncr/${n.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Text style={typography.caption}>
                    {n.ncrNo} · {n.projectName}
                  </Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {n.title}
                  </Text>
                  <Text style={[typography.caption, n.overdue && styles.overdue]} numberOfLines={1}>
                    {[n.location, n.dueDate ? `rectify by ${formatDate(n.dueDate)}` : null, n.actionByName].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.side}>
                  <Pill text={NCR_STATUS_LABELS[n.status]} {...NCR_STATUS_TONE[n.status]} />
                  <Pill text={NCR_SEVERITY_LABELS[n.severity]} {...SEVERITY_TONE[n.severity]} />
                </View>
              </Pressable>
            ))}
          </>
        )
      ) : (tests.data?.items ?? []).length === 0 ? (
        <EmptyState title="No test pending" subtitle="Tests waiting for their results show here." icon="flask-outline" />
      ) : (
        <>
          <SectionTitle title={`${tests.data?.total ?? 0} pending`} />
          {tests.data!.items.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/test/${t.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={typography.caption}>
                  {t.testNo} · {TEST_KIND_LABELS[t.kind]}
                </Text>
                <Text style={styles.title} numberOfLines={2}>
                  {t.title}
                </Text>
                <Text style={[typography.caption, t.overdue && styles.overdue]} numberOfLines={1}>
                  {t.nextDueOn ? `${t.overdue ? 'Result overdue since' : 'Next result due'} ${formatDate(t.nextDueOn)}` : `Sampled ${formatDate(t.sampledOn)}`}
                </Text>
              </View>
              <Pill text={TEST_RESULT_LABELS[t.result]} {...TEST_RESULT_TONE[t.result]} />
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
  title: { fontSize: 15, fontWeight: '600', color: colors.text, marginVertical: 2 },
  side: { alignItems: 'flex-end', gap: 4 },
  overdue: { color: colors.danger, fontWeight: '700' },
});
