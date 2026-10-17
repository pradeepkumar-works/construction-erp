import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { NOTIFICATION_TYPES_VERSION, type NotificationListDto, type PushTokenDto } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { request } from '../api/client';
import { configureForegroundHandler, getPushRegistration, notificationRoute, type PushRegistration } from './push';

interface NotificationsState {
  /** Result of the last push registration attempt, for the profile screen. */
  push: PushRegistration | null;
  unreadCount: number;
  /** Re-read the unread count (called after marking notifications read). */
  refreshUnread: () => Promise<void>;
}

const Ctx = createContext<NotificationsState | null>(null);

configureForegroundHandler();

/**
 * Registers this device for push when a user is signed in, forgets the token on sign-out,
 * opens the right screen when a push is tapped and keeps the unread badge count.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, token, addSignOutListener } = useAuth();
  const router = useRouter();
  const [push, setPush] = useState<PushRegistration | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const registered = useRef<string | null>(null);

  // Register the Expo push token with the API once per sign-in.
  useEffect(() => {
    if (!user || !token) {
      registered.current = null;
      setPush(null);
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const reg = await getPushRegistration();
      if (cancelled) return;
      setPush(reg);
      if (reg.status !== 'ready' || !reg.token) return;
      try {
        await request<PushTokenDto>('/notifications/push-tokens', { method: 'POST', token, body: { token: reg.token, platform: reg.platform, deviceName: reg.deviceName ?? undefined } });
        registered.current = reg.token;
      } catch (e) {
        if (!cancelled) setPush({ ...reg, status: 'unavailable', reason: `Could not register with the server: ${(e as Error).message}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Forget the device token on the server before the session is cleared.
  useEffect(
    () =>
      addSignOutListener(async (authToken) => {
        const t = registered.current;
        registered.current = null;
        if (!t || !authToken) return;
        try {
          await request(`/notifications/push-tokens?token=${encodeURIComponent(t)}`, { method: 'DELETE', token: authToken });
        } catch {
          // Offline sign-out: the token stays registered and is dropped when Expo reports it as unregistered.
        }
      }),
    [addSignOutListener],
  );

  const refreshUnread = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<NotificationListDto>('/notifications', { token, query: { unreadOnly: true, limit: 1, typesVersion: NOTIFICATION_TYPES_VERSION } });
      setUnreadCount(res.unreadCount);
    } catch {
      // keep the previous count
    }
  }, [token]);

  useEffect(() => {
    void refreshUnread();
    if (!token) return;
    const id = setInterval(() => void refreshUnread(), 60_000);
    return () => clearInterval(id);
  }, [token, refreshUnread]);

  // A push arriving while the app is open bumps the badge; a tap opens the related screen.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const received = Notifications.addNotificationReceivedListener(() => void refreshUnread());
    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      router.push(notificationRoute(data) as never);
    });
    // Cold start from a tapped notification.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !user) return;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      router.push(notificationRoute(data) as never);
    });
    return () => {
      received.remove();
      responded.remove();
    };
  }, [router, refreshUnread, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ push, unreadCount, refreshUnread }), [push, unreadCount, refreshUnread]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
