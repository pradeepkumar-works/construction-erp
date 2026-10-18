import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { Touchable } from './Touchable';

interface Props<V extends string> {
  label?: string;
  value: V | null;
  options: { value: V; label: string }[];
  onChange: (v: V | null) => void;
  /** Allow tapping the active chip to clear it. */
  clearable?: boolean;
  required?: boolean;
  /** What screen readers call the row when no `label` shows (a worker's name on the roll call). */
  groupLabel?: string;
}

/** Horizontal single-select chip row (weather, priority). */
export function Chips<V extends string>({ label, value, options, onChange, clearable = true, required, groupLabel }: Props<V>) {
  const name = label ?? groupLabel;
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label} maxFontSizeMultiplier={maxFontScale}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup" accessibilityLabel={name}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Touchable
              key={o.value}
              onPress={() => onChange(active && clearable ? null : o.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="radio"
              accessibilityLabel={name ? `${o.label}, ${name}` : o.label}
              accessibilityState={{ selected: active }}
            >
              {/* A tick as well as the fill, so the choice shows without colour and in glare. */}
              {active ? <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} /> : null}
              <Text maxFontSizeMultiplier={maxFontScale} style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.xs },
  req: { color: colors.danger },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  chip: {
    minHeight: touch.heightSm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.textOnPrimary },
});
