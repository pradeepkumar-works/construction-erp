import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, touch, typography } from '../theme';

interface Props<V extends string> {
  label?: string;
  value: V | null;
  options: { value: V; label: string }[];
  onChange: (v: V | null) => void;
  /** Allow tapping the active chip to clear it. */
  clearable?: boolean;
  required?: boolean;
}

/** Horizontal single-select chip row (weather, priority). */
export function Chips<V extends string>({ label, value, options, onChange, clearable = true, required }: Props<V>) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(active && clearable ? null : o.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </Pressable>
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
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.textOnPrimary },
});
