import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../theme';

export function SectionTitle({ title, right, style }: { title: string; right?: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={typography.h3}>{title}</Text>
      {right}
    </View>
  );
}

/** Label/value pair used on detail screens. */
export function KeyValue({ label, value, multiline }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <View style={[styles.kv, multiline && styles.kvCol]}>
      <Text style={[styles.kvLabel, multiline && styles.kvLabelCol]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' || isEmpty ? (
        <Text style={[styles.kvValue, multiline && styles.kvValueCol, isEmpty && styles.muted]}>{isEmpty ? '—' : String(value)}</Text>
      ) : (
        <View style={styles.kvValueWrap}>{value}</View>
      )}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** Simple stat tile for the home screen. */
export function Stat({ label, value, tone = colors.primary }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  kvCol: { flexDirection: 'column' },
  kvLabel: { ...typography.caption, flex: 1, marginRight: spacing.md },
  kvLabelCol: { marginBottom: spacing.xs },
  kvValue: { ...typography.bodyStrong, flex: 1.4, textAlign: 'right' },
  kvValueCol: { textAlign: 'left', fontWeight: '400' },
  kvValueWrap: { flex: 1.4, alignItems: 'flex-end' },
  muted: { color: colors.textMuted, fontWeight: '400' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { ...typography.caption, marginTop: 2, textAlign: 'center' },
});
