import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../notifications/NotificationsContext';
import { colors, fontSize, maxFontScale, radius, touch } from '../theme';
import { Touchable } from './Touchable';
import { useT } from '../i18n/LanguageContext';

/** Bell with the unread count; opens the notifications screen. */
export function NotificationBell() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const t = useT();
  return (
    <Touchable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={t('Notifications, {n} unread', { n: unreadCount })} style={styles.btn}>
      <Ionicons name={unreadCount ? 'notifications' : 'notifications-outline'} size={24} color={colors.text} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={maxFontScale}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  btn: { width: touch.min, height: touch.min, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 20, minHeight: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.textOnPrimary, fontSize: fontSize.small, fontWeight: '700' },
});
