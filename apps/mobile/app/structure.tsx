import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WORK_ELEMENT_TYPE_LABELS, type StructureActivityDto, type StructureDto, type WorkElementDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { useT } from '../src/i18n/LanguageContext';
import { Card, EmptyState, ErrorState, Loading, ProgressBar, Screen } from '../src/components';
import { Touchable } from '../src/components/Touchable';
import { colors, maxFontScale, spacing, touch, typography } from '../src/theme';
import { fmtQty } from '../src/utils/format';

/**
 * The project's work breakdown on the phone (item 125), read only: components, their sub-components and activities,
 * each with progress rolled up from the sub-activities. Changing it is on the web (Project › Structure).
 */
export default function StructureScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<StructureDto>((a) => a.get(`/projects/${projectId}/structure`), [projectId], {
    enabled: !!projectId,
    cacheKey: `structure:${projectId}`,
  });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const top = data.elements.filter((e) => !e.parentId);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('Structure') }} />
      <Card>
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {t('Physical progress')}
        </Text>
        <View style={styles.bar}>
          <ProgressBar value={data.progressPct} height={12} />
        </View>
        {data.componentWeightTotal !== null ? (
          <Text style={[typography.caption, { color: colors.warning }]} maxFontSizeMultiplier={maxFontScale}>
            {t('Component weights add up to {n}%, not 100%.', { n: data.componentWeightTotal })}
          </Text>
        ) : null}
      </Card>
      {!top.length ? <EmptyState title={t('No breakdown yet')} subtitle={t('The planning team splits the project into components on the web.')} icon="git-network-outline" /> : null}
      {top.map((e) => (
        <ElementCard key={e.id} element={e} data={data} />
      ))}
    </Screen>
  );
}

function ElementCard({ element, data }: { element: WorkElementDto; data: StructureDto }) {
  const t = useT();
  const subs = data.elements.filter((s) => s.parentId === element.id);
  return (
    <Card>
      <ElementHead element={element} />
      <ActivityList element={element} data={data} />
      {subs.map((s) => (
        <View key={s.id} style={styles.sub}>
          <ElementHead element={s} />
          <ActivityList element={s} data={data} />
        </View>
      ))}
      {!subs.length && !element.activityCount ? (
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {t('No activities yet')}
        </Text>
      ) : null}
    </Card>
  );
}

function ElementHead({ element }: { element: WorkElementDto }) {
  const t = useT();
  return (
    <View>
      <View style={styles.row}>
        <Text style={[typography.bodyStrong, styles.flex]} maxFontSizeMultiplier={maxFontScale}>
          {element.code} {element.name}
        </Text>
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {t('weight {n}%', { n: element.weightPct !== null ? Number(element.weightPct) : element.effectiveWeightPct })}
        </Text>
      </View>
      <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
        {t(WORK_ELEMENT_TYPE_LABELS[element.elementType])}
      </Text>
      <View style={styles.barSmall}>
        <ProgressBar value={element.progressPct} />
      </View>
    </View>
  );
}

/** A component's activities, folded until tapped; sub-activities sit under their activity. */
function ActivityList({ element, data }: { element: WorkElementDto; data: StructureDto }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const acts = data.activities.filter((a) => a.workElementId === element.id && !a.parentActivityId);
  if (!acts.length) return null;
  return (
    <View>
      <Touchable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t(open ? 'Hide the activities of {name}' : 'Show the activities of {name}', { name: element.name })}
        onPress={() => setOpen(!open)}
        style={styles.toggle}
      >
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
        <Text style={[typography.bodyStrong, { color: colors.primary }]} maxFontSizeMultiplier={maxFontScale}>
          {t(acts.length === 1 ? '{n} activity' : '{n} activities', { n: acts.length })}
        </Text>
      </Touchable>
      {open ? acts.map((a) => <ActivityRow key={a.id} activity={a} parts={data.activities.filter((p) => p.parentActivityId === a.id)} />) : null}
    </View>
  );
}

function ActivityRow({ activity, parts }: { activity: StructureActivityDto; parts: StructureActivityDto[] }) {
  return (
    <View style={styles.activity}>
      <Line a={activity} />
      {parts.map((p) => (
        <View key={p.id} style={styles.part}>
          <Line a={p} />
        </View>
      ))}
    </View>
  );
}

function Line({ a }: { a: StructureActivityDto }) {
  return (
    <View>
      <View style={styles.row}>
        <Text style={[a.parentActivityId ? typography.body : typography.bodyStrong, styles.flex]} maxFontSizeMultiplier={maxFontScale}>
          {a.name}
        </Text>
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {a.progressPct}%
        </Text>
      </View>
      {!a.isSummary ? (
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {fmtQty(a.executedQty)} / {fmtQty(a.plannedQty)} {a.unit}
        </Text>
      ) : null}
      <View style={styles.barSmall}>
        <ProgressBar value={a.progressPct} showLabel={false} height={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bar: { marginVertical: spacing.sm },
  barSmall: { marginVertical: spacing.xs },
  sub: { marginTop: spacing.md, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.borderStrong },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touch.min },
  activity: { marginBottom: spacing.sm },
  part: { paddingLeft: spacing.md },
});
