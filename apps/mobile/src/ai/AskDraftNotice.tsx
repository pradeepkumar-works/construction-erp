import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRODUCT_NAME, type AiDraftDto } from '@erp/shared';
import { useT } from '../i18n/LanguageContext';
import { colors, radius, spacing, typography } from '../theme';

/** English names of a draft's fields, shown through t(), for its "to check" list. */
const FIELD_LABELS: Record<string, string> = {
  projectId: 'Project',
  date: 'Report date',
  weather: 'Weather',
  siteCondition: 'Site condition',
  manpower: 'Manpower',
  machinery: 'Machinery',
  materialReceived: 'Material received',
  workExecuted: 'Work executed',
  testsConducted: 'Tests conducted',
  safetyObservations: 'Safety observations',
  issues: 'Issues / hindrances',
  nextDayPlan: 'Next-day plan',
};

/**
 * At the top of a form filled in on the Ask tab (AI item 72): where it came from, that nothing is sent until the user
 * sends it, and what the drafting flagged to check.
 */
export function AskDraftNotice({ draft }: { draft: AiDraftDto }) {
  const t = useT();
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <Ionicons name="sparkles" size={20} color={colors.primary} />
        <Text style={styles.title}>{t('Filled in by Ask {name} from what you said. Check each field, then send it.', { name: PRODUCT_NAME })}</Text>
      </View>
      {draft.flags.length ? (
        <View accessibilityLabel={t('To check')}>
          {draft.flags.map((f, i) => {
            const label = FIELD_LABELS[f.field.split('.')[0]];
            return (
              <Text key={i} style={styles.flag}>
                • {label ? `${t(label)}: ` : ''}
                {f.note}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { ...typography.body, flex: 1 },
  flag: { ...typography.body, marginLeft: spacing.xl },
});
