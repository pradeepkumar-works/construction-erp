import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ProjectDashboard, ProjectDetail, ScheduleReading } from '@erp/shared';
import { scheduleReading } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { useT } from '../i18n/LanguageContext';
import { colors, maxFontScale, spacing, toneIcon, typography } from '../theme';
import { formatDate, today } from '../utils/format';
import { Pill } from './StatusBadge';

type T = ReturnType<typeof useT>;

/** The web header chip's words (`scheduleChipText`), for the phone. */
function chipText(s: ScheduleReading, t: T): string {
  if (s.state === 'COMPLETED') return t('Schedule: completed');
  if (s.state === 'ON_HOLD') return t('Schedule: on hold');
  if (s.state === 'OVERRUN') return t('Schedule: past completion date');
  if (s.state === 'FINISH_LATE') return s.finishLateDays === 1 ? t('Schedule: ends 1 day late') : t('Schedule: ends {n} days late', { n: s.finishLateDays ?? 0 });
  if (s.late > 0) return s.late === 1 ? t('Schedule: 1 activity late') : t('Schedule: {n} activities late', { n: s.late });
  if (s.state === 'BEHIND') return t('Schedule: behind');
  if (s.state === 'NO_PLAN') return t('Schedule: no plan yet');
  return t('Schedule: on track');
}

const TONE = {
  success: { fg: colors.success, bg: colors.successSoft, icon: toneIcon.done },
  warning: { fg: colors.warning, bg: colors.warningSoft, icon: toneIcon.warning },
  error: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.alert },
  default: { fg: colors.neutral, bg: colors.neutralSoft, icon: toneIcon.info },
} as const;

/**
 * Where a project stands against its schedule on the phone, from the same
 * `scheduleReading` as the web's header and Overview: a plan that ends after the completion date is late however well
 * today's progress keeps to it, and a project with no dated activities has no plan yet. Shows nothing until the
 * dashboard has loaded, or for someone it is not for.
 */
export function ScheduleStatus({ project }: { project: ProjectDetail }) {
  const t = useT();
  const { data } = useFetch<ProjectDashboard>((a) => a.get(`/dashboard/projects/${project.id}`), [project.id], { cacheKey: `project-dashboard:${project.id}` });
  if (!data) return null;
  const s = scheduleReading(project, data, today());
  const tone = TONE[s.level];
  const detail =
    s.finishLateDays !== null
      ? t('The plan ends {finish}, after the completion date of {completion}.', { finish: formatDate(s.plannedFinish), completion: formatDate(s.completionDate) })
      : s.state === 'OVERRUN'
        ? t('The completion date of {completion} has passed with the work not finished.', { completion: formatDate(s.completionDate) })
        : s.state === 'NO_PLAN'
          ? t('No activity has planned dates yet.')
          : null;
  return (
    <View style={styles.wrap}>
      <Pill text={chipText(s, t)} fg={tone.fg} bg={tone.bg} icon={tone.icon} />
      {detail ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.detail]}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  detail: { marginTop: spacing.xs },
});
