import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../notifications/NotificationsContext';
import { colors, radius } from '../theme';

/** Bell with the unread count; opens the notifications screen. */
export function NotificationBell() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  return (
    <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={`Notifications, ${unreadCount} unread`} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} hitSlop={8}>
      <Ionicons name={unreadCount ? 'notifications' : 'notifications-outline'} size={24} color={colors.text} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.7 },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
