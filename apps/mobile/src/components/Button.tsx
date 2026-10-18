import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, maxFontScale, radius, spacing, touch } from '../theme';
import { Touchable } from './Touchable';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'accent';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'md' | 'sm';
  style?: ViewStyle;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.brand, fg: colors.onBrand, border: colors.brand },
  accent: { bg: colors.accent, fg: colors.textOnPrimary, border: colors.accent },
  success: { bg: colors.success, fg: colors.textOnPrimary, border: colors.success },
  danger: { bg: colors.danger, fg: colors.textOnPrimary, border: colors.danger },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, size = 'md', style }: Props) {
  const p = palette[variant];
  const isDisabled = disabled || loading;
  return (
    <Touchable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      pressedStyle={styles.pressed}
      style={[styles.base, { backgroundColor: p.bg, borderColor: p.border, minHeight: size === 'sm' ? touch.heightSm : touch.height }, isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={20} color={p.fg} style={styles.icon} /> : null}
          <Text maxFontSizeMultiplier={maxFontScale} style={[styles.text, { color: p.fg, fontSize: size === 'sm' ? fontSize.secondary : fontSize.body }]}>{title}</Text>
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  icon: { marginRight: spacing.sm },
  text: { fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
