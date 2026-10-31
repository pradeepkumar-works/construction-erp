import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing, typography } from '../theme';
import { ILLUSTRATIONS, type EmptyArt } from '../illustrations';
import { Button } from './Button';
import { Skeleton } from './Skeleton';
import { useT } from '../i18n/LanguageContext';

/** A screen's first load: placeholder rows in place of a spinner. `text` is also shown, for a wait worth explaining. */
export function Loading({ text, variant = 'list' }: { text?: string; variant?: 'list' | 'card' }) {
  const t = useT();
  return (
    <View style={styles.skeleton}>
      <Skeleton variant={variant} label={text ?? t('Loading…')} />
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </View>
  );
}

/** `art` shows an illustration in place of the icon, for the screens people land on most. */
export function EmptyState({
  title,
  subtitle,
  icon = 'file-tray-outline',
  art,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  art?: EmptyArt;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      {art ? (
        <Image source={ILLUSTRATIONS[art]} style={styles.art} accessibilityIgnoresInvertColors />
      ) : (
        <Ionicons name={icon} size={44} color={colors.textMuted} />
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.text}>{subtitle}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.danger} />
      <Text style={styles.title}>{t('Could not load')}</Text>
      <Text style={styles.text}>{t(message)}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button title={t('Try again')} onPress={onRetry} variant="secondary" icon="refresh" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Inline (non-fullscreen) error banner for forms; screen readers read it out when it appears. The message goes through
 * t(), so the app's own and the API's known English messages show in Hindi too.
 */
export function ErrorBanner({ message }: { message: string | null }) {
  const t = useT();
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={styles.bannerText}>{t(message)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { flex: 1, padding: spacing.lg, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 220 },
  art: { width: 240, height: 180 },
  title: { ...typography.h3, marginTop: spacing.md, textAlign: 'center' },
  text: { ...typography.caption, marginTop: spacing.sm, textAlign: 'center' },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: 10, marginBottom: spacing.lg },
  bannerText: { flex: 1, marginLeft: spacing.sm, color: colors.danger, fontSize: fontSize.secondary },
});
