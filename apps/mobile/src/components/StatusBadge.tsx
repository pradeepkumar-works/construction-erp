import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUBMISSION_STATUS_LABELS, type SubmissionStatus } from '@erp/shared';
import { fontSize, maxFontScale, radius, spacing, statusTone, type IconName } from '../theme';
import { useT } from '../i18n/LanguageContext';

/**
 * A submission's status as a word and a shape: clock for waiting, tick for approved, cross for rejected,
 * pencil for sent back, so Pending and Rejected differ without colour vision and in glare. `labels` words the status
 * for one kind of entry (an inspection is "Passed" rather than "Approved").
 */
export function StatusBadge({ status, size = 'md', labels = SUBMISSION_STATUS_LABELS }: { status: SubmissionStatus; size?: 'md' | 'lg'; labels?: Record<SubmissionStatus, string> }) {
  const tone = statusTone[status] ?? statusTone.DRAFT;
  const t = useT();
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }, size === 'lg' && styles.lg]}>
      <Ionicons name={tone.icon} size={size === 'lg' ? 18 : 14} color={tone.fg} style={styles.icon} />
      <Text maxFontSizeMultiplier={maxFontScale} style={[styles.text, { color: tone.fg }, size === 'lg' && styles.lgText]}>{labels[status] ? t(labels[status]) : status}</Text>
    </View>
  );
}

/** Small pill for other labels (type, priority, overdue…); a status pill passes the `icon` of its tone. */
export function Pill({ text, fg, bg, icon }: { text: string; fg: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={14} color={fg} style={styles.icon} /> : null}
      <Text maxFontSizeMultiplier={maxFontScale} style={[styles.text, { color: fg }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.pill },
  lg: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  icon: { marginRight: 4 },
  text: { fontSize: fontSize.secondary, fontWeight: '700' },
  lgText: { fontSize: fontSize.body },
});
