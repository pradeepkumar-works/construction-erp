import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, maxFontScale, radius, spacing } from '../theme';
import { clampPct, fmtPct } from '../utils/format';

export function ProgressBar({ value, showLabel = true, color, height = 10 }: { value: number; showLabel?: boolean; color?: string; height?: number }) {
  const pct = clampPct(value);
  const fill = color ?? (pct >= 100 ? colors.success : colors.primary);
  return (
    <View style={styles.row}>
      <View style={[styles.track, { height }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fill, height }]} />
      </View>
      {showLabel ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.label}>{fmtPct(value)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  track: { flex: 1, backgroundColor: colors.neutralSoft, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { borderRadius: radius.pill },
  label: { marginLeft: spacing.sm, fontWeight: '700', color: colors.text, minWidth: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
