import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing } from '../theme';

/** One grey placeholder bar. */
function Bar({ width = '100%', height = 12, round, style }: { width?: DimensionValue; height?: number; round?: boolean; style?: ViewStyle }) {
  return <View style={[styles.bar, { width, height, borderRadius: round ? height / 2 : radius.sm }, style]} />;
}

/** Same lengths every render, so the placeholders do not jump about. */
const WIDTHS: DimensionValue[] = ['72%', '58%', '84%', '64%', '76%', '52%'];

/**
 * Grey placeholders in the shape of what is loading, pulsing gently (still when the phone asks for reduced motion).
 * `list` looks like a column of submission rows, `card` like the home screen's cards. Screen readers hear `label`.
 */
export function Skeleton({ variant = 'list', rows = variant === 'list' ? 6 : 3, label, style }: { variant?: 'list' | 'card'; rows?: number; label?: string; style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={[animated, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, i) =>
        variant === 'list' ? (
          <View key={i} style={styles.row}>
            <Bar width={44} height={44} round style={styles.avatar} />
            <View style={styles.flex}>
              <Bar width={WIDTHS[i % WIDTHS.length]} height={14} />
              <Bar width="40%" style={styles.gap} />
              <Bar width={72} height={18} round style={styles.gap} />
            </View>
          </View>
        ) : (
          <View key={i} style={styles.card}>
            <View style={styles.cardHead}>
              <Bar width={36} height={36} round />
              <Bar width={WIDTHS[i % WIDTHS.length]} height={16} style={styles.flexBar} />
              <Bar width={28} height={22} />
            </View>
            <Bar width="90%" style={styles.gap} />
            <Bar width="66%" style={styles.gap} />
          </View>
        ),
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { backgroundColor: colors.neutralSoft },
  gap: { marginTop: spacing.sm },
  avatar: { marginRight: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 72,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  flexBar: { flexShrink: 1 },
});
