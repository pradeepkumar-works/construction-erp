import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';
import { Button } from './Button';

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

export function EmptyState({ title, subtitle, icon = 'file-tray-outline', action }: { title: string; subtitle?: string; icon?: keyof typeof Ionicons.glyphMap; action?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.text}>{subtitle}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.danger} />
      <Text style={styles.title}>Could not load</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button title="Try again" onPress={onRetry} variant="secondary" icon="refresh" />
        </View>
      ) : null}
    </View>
  );
}

/** Inline (non-fullscreen) error banner for forms. */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 220 },
  title: { ...typography.h3, marginTop: spacing.md, textAlign: 'center' },
  text: { ...typography.caption, marginTop: spacing.sm, textAlign: 'center' },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: 10, marginBottom: spacing.lg },
  bannerText: { flex: 1, marginLeft: spacing.sm, color: colors.danger, fontSize: 14 },
});
