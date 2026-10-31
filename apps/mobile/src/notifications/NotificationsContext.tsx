import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { NOTIFICATION_TYPES_VERSION, mayApprove, type NotificationListDto, type PendingApprovalDto, type PushTokenDto } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { request } from '../api/client';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { useT } from '../i18n/LanguageContext';
import { colors, spacing, typography } from '../theme';
import { kvGet, kvSet } from '../utils/kv';
import { configureForegroundHandler, getPushRegistration, notificationRoute, openNotificationRoute, pushOff, pushPermission, type PushRegistration } from './push';

interface NotificationsState {
  /** Result of the last push registration attempt, for the profile screen. */
  push: PushRegistration | null;
  unreadCount: number;
  /** Re-read the unread count (called after marking notifications read). */
  refreshUnread: () => Promise<void>;
  /** Entries waiting for this user's approval, for the Approvals tab's badge (null for someone who approves nothing). */
  pendingApprovals: number | null;
  /** Re-read the approvals count, or set it from a list just loaded. */
  refreshPending: (known?: number) => Promise<void>;
  /** Show the explanation and then the phone's own prompt (Profile's Turn on). */
  askForPush: () => void;
}

const Ctx = createContext<NotificationsState | null>(null);

configureForegroundHandler();

/** When "Not now" was last chosen, so the explanation comes back after a while rather than at every launch. */
const ASKED_KEY = 'nirmaan.push.notNowAt';
const ASK_AGAIN_MS = 14 * 24 * 3600_000;
/** The last tapped push already opened, so a cold start never replays it on the next launch. */
const HANDLED_KEY = 'nirmaan.push.handled';

/**
 * Registers this device for push when a user is signed in (after a short explanation before the phone's own prompt),
 * forgets the token on sign-out, opens the right screen when a push is tapped, and keeps the unread and approvals
 * counts for the bell and the tab bar.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, token, addSignOutListener } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navKey = useRootNavigationState()?.key;
  const t = useT();
  const [push, setPush] = useState<PushRegistration | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [explain, setExplain] = useState(false);
  const registered = useRef<string | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const register = useCallback(async () => {
    if (!token) return;
    const reg = await getPushRegistration();
    setPush(reg);
    if (reg.status !== 'ready' || !reg.token) return;
    try {
      await request<PushTokenDto>('/notifications/push-tokens', { method: 'POST', token, body: { token: reg.token, platform: reg.platform, deviceName: reg.deviceName ?? undefined } });
      registered.current = reg.token;
    } catch {
      setPush({ ...reg, status: 'unavailable', reason: 'Could not register this phone with the server. Try again later.' });
    }
  }, [token]);

  // Once per sign-in: register straight away when the phone already allows notifications; when it would still ask,
  // say why first (unless "Not now" was chosen lately).
  useEffect(() => {
    if (!user || !token) {
      registered.current = null;
      setPush(null);
      setUnreadCount(0);
      setPendingApprovals(null);
      setExplain(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const permission = await pushPermission();
      if (cancelled) return;
      if (permission === 'ask') {
        const notNow = Number(kvGet(ASKED_KEY) ?? 0);
        if (Date.now() - notNow < ASK_AGAIN_MS) setPush(pushOff());
        else setExplain(true);
        return;
      }
      await register();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  const turnOn = () => {
    setExplain(false);
    void register();
  };
  const notNow = () => {
    kvSet(ASKED_KEY, String(Date.now()));
    setExplain(false);
    setPush(pushOff());
  };

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

  const approver = !!user && mayApprove(user);
  const refreshPending = useCallback(
    async (known?: number) => {
      if (!token || !approver) return setPendingApprovals(null);
      if (known !== undefined) return setPendingApprovals(known);
      try {
        setPendingApprovals((await request<PendingApprovalDto[]>('/approvals/pending', { token })).length);
      } catch {
        // keep the previous count
      }
    },
    [token, approver],
  );

  useEffect(() => {
    void refreshUnread();
    void refreshPending();
    if (!token) return;
    const id = setInterval(() => {
      void refreshUnread();
      void refreshPending();
    }, 60_000);
    return () => clearInterval(id);
  }, [token, refreshUnread, refreshPending]);

  // A tapped push opens its screen once: never twice for the same tap (the listener and the cold-start response can
  // both carry it), never again on the next launch, and only once someone is signed in and the screens are there.
  const pendingRoute = useRef<string | null>(null);
  const userRef = useRef(!!user);
  userRef.current = !!user;
  const ready = !!user && !!navKey;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const handle = useCallback(
    (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (kvGet(HANDLED_KEY) === id) return;
      kvSet(HANDLED_KEY, id);
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Older native module: the handled id above still stops a replay.
      }
      const route = notificationRoute(response.notification.request.content.data as Record<string, unknown> | undefined);
      if (readyRef.current) openNotificationRoute(router, pathRef.current, route);
      else pendingRoute.current = route;
    },
    [router],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const received = Notifications.addNotificationReceivedListener(() => {
      void refreshUnread();
      void refreshPending();
    });
    const responded = Notifications.addNotificationResponseReceivedListener(handle);
    // Cold start from a tapped notification.
    try {
      const last = Notifications.getLastNotificationResponse();
      if (last) handle(last);
    } catch {
      // No native module (web build): nothing to open.
    }
    return () => {
      received.remove();
      responded.remove();
    };
  }, [handle, refreshUnread, refreshPending]);

  // A tap while signed out (or before the screens were up) opens once the user is in.
  useEffect(() => {
    if (!ready || !pendingRoute.current) return;
    const route = pendingRoute.current;
    pendingRoute.current = null;
    const id = setTimeout(() => openNotificationRoute(router, pathRef.current, route), 0);
    return () => clearTimeout(id);
  }, [ready, router]);

  const askForPush = useCallback(() => setExplain(true), []);
  const value = useMemo(() => ({ push, unreadCount, refreshUnread, pendingApprovals, refreshPending, askForPush }), [push, unreadCount, refreshUnread, pendingApprovals, refreshPending, askForPush]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <BottomSheet visible={explain && !!user} onClose={notNow} title={t('Turn on notifications?')} subtitle={t('So you hear when an entry needs you.')}>
        <Text style={[typography.body, styles.text]}>{t('Approvals waiting for you, entries sent back to you, and the daily DPR reminder. Your phone asks next; you can change it later under Profile.')}</Text>
        <View style={styles.buttons}>
          <Button title={t('Not now')} variant="ghost" onPress={notNow} style={styles.flex} />
          <Button title={t('Turn on')} icon="notifications-outline" onPress={turnOn} style={styles.flex2} />
        </View>
      </BottomSheet>
    </Ctx.Provider>
  );
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

const styles = StyleSheet.create({
  text: { marginBottom: spacing.lg, color: colors.text },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  flex2: { flex: 1.6 },
});
