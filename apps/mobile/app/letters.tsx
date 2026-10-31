import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LETTER_STATUS_LABELS, type LetterDto, type LetterSummaryDto, type Paginated } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Stat, Touchable } from '../src/components';
import { LETTER_STATUS_TONE } from '../src/components/letterTone';
import { colors, radius, spacing, touch, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

type Show = 'mine' | 'toSign';

/** Letters for you: letters received that are marked to you, and outward letters waiting for your signature. */
export default function LettersScreen() {
  const router = useRouter();
  const t = useT();
  const [show, setShow] = useState<Show>('mine');
  const list = useFetch<Paginated<LetterDto>>((a) => a.get('/letters', { [show]: true, pageSize: 100, sortBy: show === 'mine' ? 'actionDue' : 'letterDate', sortOrder: show === 'mine' ? 'asc' : 'desc' }), [show], { cacheKey: `letters:${show}` });
  const summary = useFetch<LetterSummaryDto>((a) => a.get('/letters/summary'), [], { cacheKey: 'letters-summary' });
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
      <ErrorBanner message={list.data ? null : list.error} />
      {s ? (
        <View style={styles.stats}>
          <Stat label={t('Marked to you')} value={s.markedToMe} tone={colors.primary} />
          <Stat label={t('Overdue')} value={s.markedToMeOverdue} tone={s.markedToMeOverdue ? colors.danger : colors.success} />
          <Stat label={t('To sign')} value={s.toSign} tone={s.toSign ? colors.warning : colors.neutral} />
        </View>
      ) : null}
      <Chips
        value={show}
        clearable={false}
        onChange={(v) => v && setShow(v)}
        options={[
          { value: 'mine', label: t('Marked to you') },
          { value: 'toSign', label: t('To sign') },
        ]}
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title={t(show === 'mine' ? 'No letters marked to you' : 'No letters to sign')} subtitle={t('Letters marked to you, and letters waiting for your signature, show here.')} icon="mail-outline" />
      ) : (
        <>
          <SectionTitle title={rows.length === 1 ? t('1 letter') : t('{n} letters', { n: rows.length })} />
          {rows.map((l) => {
            const tone = LETTER_STATUS_TONE[l.status];
            const due = show === 'mine' ? l.actionDue : l.replyBy;
            return (
              <Touchable key={l.id} accessibilityRole="button" onPress={() => router.push(`/letter/${l.id}`)} style={styles.row}>
                <View style={styles.icon}>
                  <Ionicons name={l.direction === 'IN' ? 'mail-open-outline' : 'send-outline'} size={20} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={typography.bodyStrong} numberOfLines={2}>
                    {l.subject}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {l.letterNo ?? t('Draft')} · {l.party}
                  </Text>
                  {due ? (
                    <Text style={[typography.caption, l.actionOverdue || l.overdue ? styles.late : null]} numberOfLines={1}>
                      {t('by {date}', { date: formatDate(due) })}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.side}>
                  <Pill text={t(LETTER_STATUS_LABELS[l.status])} fg={tone.fg} bg={tone.bg} icon={tone.icon} />
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
  late: { color: colors.danger },
});
