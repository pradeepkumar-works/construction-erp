import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../offline/OfflineContext';
import { colors, fontSize, maxFontScale, radius, spacing, touch } from '../theme';
import { Touchable } from './Touchable';
import { useT } from '../i18n/LanguageContext';

/** Shows when the phone is offline or has entries waiting in the outbox; taps through to the outbox. */
export function OfflineBanner() {
  const router = useRouter();
  const { online, pendingCount, failedCount, syncing } = useOffline();
  const t = useT();
  if (online && pendingCount === 0 && failedCount === 0) return null;
  const parts: string[] = [];
  if (!online) parts.push(t('Offline'));
  if (pendingCount) parts.push(syncing ? t('{n} waiting to send (sending…)', { n: pendingCount }) : t('{n} waiting to send', { n: pendingCount }));
  if (failedCount) parts.push(t('{n} need attention', { n: failedCount }));
  const tone = failedCount ? colors.danger : colors.warning;
  return (
    <Touchable onPress={() => router.push('/outbox')} style={[styles.banner, { borderColor: tone }]} accessibilityRole="button" accessibilityLabel={parts.join(', ')} accessibilityHint={t('Opens the outbox')}>
      <Ionicons name={online ? 'cloud-upload-outline' : 'cloud-offline-outline'} size={20} color={tone} />
      <Text style={[styles.text, { color: tone }]} maxFontSizeMultiplier={maxFontScale}>
        {parts.join(' · ')}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={tone} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, minHeight: touch.min, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.warningSoft, marginBottom: spacing.md },
  text: { flex: 1, fontWeight: '700', fontSize: fontSize.secondary },
});
