import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../offline/OfflineContext';
import { colors, radius, spacing } from '../theme';

/** Shows when the phone is offline or has entries waiting in the outbox; taps through to the outbox. */
export function OfflineBanner() {
  const router = useRouter();
  const { online, pendingCount, failedCount, syncing } = useOffline();
  if (online && pendingCount === 0 && failedCount === 0) return null;
  const parts: string[] = [];
  if (!online) parts.push('Offline');
  if (pendingCount) parts.push(`${pendingCount} waiting to send${syncing ? ' (sending…)' : ''}`);
  if (failedCount) parts.push(`${failedCount} need attention`);
  const tone = failedCount ? colors.danger : colors.warning;
  return (
    <Pressable onPress={() => router.push('/outbox')} style={[styles.banner, { borderColor: tone }]} accessibilityRole="button">
      <Ionicons name={online ? 'cloud-upload-outline' : 'cloud-offline-outline'} size={20} color={tone} />
      <Text style={[styles.text, { color: tone }]}>{parts.join(' · ')}</Text>
      <Ionicons name="chevron-forward" size={18} color={tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.warningSoft, marginBottom: spacing.md },
  text: { flex: 1, fontWeight: '700', fontSize: 14 },
});
