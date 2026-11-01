import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ToMeasureItemDto } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { Button, Card } from '../components';
import { useT } from '../i18n/LanguageContext';
import { colors, fontSize, maxFontScale, spacing, typography } from '../theme';
import { fmtQty, formatDate, formatMoney } from '../utils/format';

/** What a sheet started from an item's approved days begins with: one line per day, oldest first, as on the web. */
export interface ProgressPrefill {
  boqItemId: string;
  lines: { description: string; nos: string }[];
  /** Every day in one place: that is the sheet's location */
  location: string | null;
  remarks: string;
}

type T = ReturnType<typeof useT>;

/** The same lines, location and remarks as the web's `progressPrefill` (MeasureFromProgressModal.tsx). */
export function progressPrefill(item: ToMeasureItemDto, t: T): ProgressPrefill {
  const places = [...new Set(item.entries.map((e) => e.location).filter((l): l is string => !!l))];
  const days = item.entries.map((e) => e.date);
  const span = days.length > 1 ? t('{from} to {to}', { from: formatDate(days[0]), to: formatDate(days[days.length - 1]) }) : formatDate(days[0]);
  return {
    boqItemId: item.boqItemId,
    lines: item.entries.map((e) => ({
      description: [formatDate(e.date), e.location, e.activityName].filter(Boolean).join(' · ').slice(0, 200),
      nos: String(Number(e.quantity)),
    })),
    location: places.length === 1 ? places[0] : null,
    remarks: days.length === 1 ? t('Measured from approved progress, {span} (1 day).', { span }) : t('Measured from approved progress, {span} ({n} days).', { span, n: days.length }),
  };
}

/**
 * Measure from progress on the phone: the BOQ items with work approved on the
 * daily reports that no sheet holds yet, from `GET /measurements/to-measure`. Start sheet fills the form; the
 * surveyor still checks the lines against the book and submits. Shows nothing while loading, when nothing waits,
 * or for someone the list is not for.
 */
export function MeasureFromProgress({ projectId, onStart }: { projectId: string; onStart: (prefill: ProgressPrefill) => void }) {
  const t = useT();
  const { data, error } = useFetch<ToMeasureItemDto[]>((a) => a.get('/measurements/to-measure', { projectId }), [projectId], { refetchOnFocus: false, cacheKey: `to-measure:${projectId}` });
  if (error || !data?.length) return null;
  return (
    <Card title={t('Measure from progress')}>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.intro]}>
        {t('Work the site got approved that no measurement sheet holds yet. Start a sheet and its approved days come in as lines, oldest first, for you to check against the book.')}
      </Text>
      {data.map((r) => (
        <View key={r.boqItemId} style={styles.row}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.title} numberOfLines={3}>
            {r.itemNo} · {r.description}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
            {r.entries.length === 1
              ? t('1 approved day, {date} onwards', { date: formatDate(r.entries[0].date) })
              : t('{n} approved days, {date} onwards', { n: r.entries.length, date: formatDate(r.entries[0].date) })}
          </Text>
          {r.otherUnitActivities.length ? (
            <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
              {t('{activities} record another unit, so their days are not here', { activities: r.otherUnitActivities.join(', ') })}
            </Text>
          ) : null}
          <View style={styles.foot}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.left}>
              {t('{qty} {unit} to measure · {amount}', { qty: fmtQty(r.toMeasureQty), unit: r.unit, amount: formatMoney(r.toMeasureAmount, { paise: false }) })}
            </Text>
            <Button title={t('Start sheet')} variant="ghost" size="sm" onPress={() => onStart(progressPrefill(r, t))} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.sm },
  row: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  title: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  left: { flex: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginRight: spacing.sm },
});
