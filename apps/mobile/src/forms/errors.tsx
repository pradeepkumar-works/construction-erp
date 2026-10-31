import React, { useCallback, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useT } from '../i18n/LanguageContext';
import { colors, maxFontScale, radius, spacing, typography } from '../theme';

/**
 * After a failed submit (UX item 80): the form scrolls back to the top, where `ErrorSummary` lists what to fix, the
 * list is read aloud and the phone buzzes, because the Submit button sits at the bottom of a long form and the first
 * message is off screen. Pass `scrollRef` to the form's `Screen`.
 */
export function useErrorSummary() {
  const scrollRef = useRef<ScrollView>(null);
  const t = useT();
  const report = useCallback(
    (errors: Record<string, string | undefined | null>) => {
      const list = Object.values(errors).filter((m): m is string => !!m);
      if (!list.length) return;
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      AccessibilityInfo.announceForAccessibility(
        list.length === 1 ? t('Not sent. {message}', { message: list[0] }) : t('Not sent. {n} things to fix: {list}', { n: list.length, list: list.join('. ') }),
      );
    },
    [t],
  );
  return { scrollRef, report };
}

/** The messages of a failed submit, at the top of the form. */
export function ErrorSummary({ errors }: { errors: Record<string, string | undefined | null> }) {
  const t = useT();
  const list = Object.values(errors).filter((m): m is string => !!m);
  if (!list.length) return null;
  return (
    <View style={styles.box} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <View style={styles.head}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={styles.title} maxFontSizeMultiplier={maxFontScale}>
          {list.length === 1 ? t('Fix this, then send again') : t('Fix these {n}, then send again', { n: list.length })}
        </Text>
      </View>
      {list.map((m, i) => (
        <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.item}>
          {'•  '}
          {m}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: colors.danger, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.danger, flex: 1 },
  item: { ...typography.body, color: colors.text },
});
