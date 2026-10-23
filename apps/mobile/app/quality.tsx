import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NCR_SEVERITY_LABELS, NCR_STATUS_LABELS, TEST_KIND_LABELS, TEST_RESULT_LABELS, type NcrDto, type Paginated, type QualityTestDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { useT } from '../src/i18n/LanguageContext';
import { Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Touchable } from '../src/components';
import { NCR_STATUS_TONE, SEVERITY_TONE, TEST_RESULT_TONE } from '../src/components/qualityTone';
import { colors, fontSize, radius, spacing, touch, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';

type Show = 'ncrs' | 'tests';

/** Quality on site: open NCRs to act on, and tests with their readings due. */
export default function QualityScreen() {
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ show?: Show }>();
  const [show, setShow] = useState<Show>(params.show === 'tests' ? 'tests' : 'ncrs');
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
          { value: 'ncrs', label: t('Open NCRs') },
          { value: 'tests', label: t('Tests pending') },
        ]}
      />
      <ErrorBanner message={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : show === 'ncrs' ? (
        (ncrs.data?.items ?? []).length === 0 ? (
          <EmptyState title={t('No open NCR')} subtitle={t('Non-conformances raised by QA/QC on your projects show here.')} icon="shield-checkmark-outline" />
        ) : (
          <>
            <SectionTitle title={t('{n} open', { n: ncrs.data?.total ?? 0 })} />
            {ncrs.data!.items.map((n) => (
              <Touchable key={n.id} accessibilityRole="button" onPress={() => router.push(`/ncr/${n.id}`)} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={typography.caption}>
                    {n.ncrNo} · {n.projectName}
                  </Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {n.title}
                  </Text>
                  <Text style={[typography.caption, n.overdue && styles.overdue]} numberOfLines={1}>
                    {[n.location, n.dueDate ? t('rectify by {date}', { date: formatDate(n.dueDate) }) : null, n.actionByName].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.side}>
                  <Pill text={t(NCR_STATUS_LABELS[n.status])} {...NCR_STATUS_TONE[n.status]} />
                  <Pill text={t(NCR_SEVERITY_LABELS[n.severity])} {...SEVERITY_TONE[n.severity]} />
                </View>
              </Touchable>
            ))}
          </>
        )
      ) : (tests.data?.items ?? []).length === 0 ? (
        <EmptyState title={t('No test pending')} subtitle={t('Tests waiting for their results show here.')} icon="flask-outline" />
      ) : (
        <>
          <SectionTitle title={t('{n} pending', { n: tests.data?.total ?? 0 })} />
          {tests.data!.items.map((x) => (
            <Touchable key={x.id} accessibilityRole="button" onPress={() => router.push(`/test/${x.id}`)} style={styles.row}>
              <View style={styles.flex}>
                <Text style={typography.caption}>
                  {x.testNo} · {t(TEST_KIND_LABELS[x.kind])}
                </Text>
                <Text style={styles.title} numberOfLines={2}>
                  {x.title}
                </Text>
                <Text style={[typography.caption, x.overdue && styles.overdue]} numberOfLines={1}>
                  {x.nextDueOn ? t(x.overdue ? 'Result overdue since {date}' : 'Next result due {date}', { date: formatDate(x.nextDueOn) }) : t('Sampled {date}', { date: formatDate(x.sampledOn) })}
                </Text>
              </View>
              <Pill text={t(TEST_RESULT_LABELS[x.result])} {...TEST_RESULT_TONE[x.result]} />
            </Touchable>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, minHeight: touch.min },
  pressed: { opacity: 0.7 },
  title: { fontSize: fontSize.body, fontWeight: '600', color: colors.text, marginVertical: 2 },
  side: { alignItems: 'flex-end', gap: 4 },
  overdue: { color: colors.danger, fontWeight: '700' },
});
