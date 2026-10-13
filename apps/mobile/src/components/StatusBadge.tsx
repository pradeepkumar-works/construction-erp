import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SUBMISSION_STATUS_LABELS, type SubmissionStatus } from '@erp/shared';
import { radius, spacing, statusTone } from '../theme';

export function StatusBadge({ status, size = 'md' }: { status: SubmissionStatus; size?: 'md' | 'lg' }) {
  const tone = statusTone[status] ?? statusTone.DRAFT;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }, size === 'lg' && styles.lg]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.text, { color: tone.fg }, size === 'lg' && styles.lgText]}>{SUBMISSION_STATUS_LABELS[status] ?? status}</Text>
    </View>
  );
}

/** Generic small pill for non-status labels (type, priority, delayed…). */
export function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.pill },
  lg: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  text: { fontSize: 12, fontWeight: '700' },
  lgText: { fontSize: 14 },
});
