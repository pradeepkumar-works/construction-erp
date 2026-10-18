import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { Touchable } from './Touchable';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  title?: string;
  right?: React.ReactNode;
  /** A tappable card is a button unless it opens a page in the way a link does. */
  accessibilityRole?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Card({ children, onPress, style, title, right, accessibilityRole = 'button', accessibilityLabel, accessibilityHint }: Props) {
  const content = (
    <>
      {(title || right) && (
        <View style={styles.header}>
          {title ? (
            <Text style={typography.h3} accessibilityRole={onPress ? undefined : 'header'}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      )}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Touchable onPress={onPress} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} style={[styles.card, style]} pressedStyle={styles.pressed}>
        {content}
      </Touchable>
    );
  }
  return <View style={[styles.card, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.85 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
});
