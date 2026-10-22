import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { PushPlatform } from '@erp/shared';
import { OUTBOX_DETAIL } from '../offline/types';
import { colors } from '../theme';

export type PushStatus =
  /** Token obtained and ready to be registered with the API. */
  | 'ready'
  /** User declined the notification permission. */
  | 'denied'
  /** Simulator, web, Expo Go on Android, or no EAS projectId: remote push is not possible here. */
  | 'unavailable'
  /** Not asked yet, or "Not now" on the explanation shown before the phone's own prompt (UX item 88). */
  | 'off';

export interface PushRegistration {
  status: PushStatus;
  token: string | null;
  platform: PushPlatform;
  deviceName: string | null;
  /** Why the token could not be obtained, for the profile screen. */
  reason?: string;
}

/** Show pushes that arrive while the app is open as a banner and in the list. */
export function configureForegroundHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const platform: PushPlatform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB';

const deviceName = () => Device.modelName ?? Device.deviceName ?? null;
const projectIdOf = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

/** Why push cannot work on this phone at all, or null when it can. */
function unavailable(): PushRegistration | null {
  const base = { token: null, platform, deviceName: deviceName() };
  if (Platform.OS === 'web') return { ...base, status: 'unavailable', reason: 'Push is only available in the native app.' };
  if (!Device.isDevice) return { ...base, status: 'unavailable', reason: 'Push needs a physical device.' };
  // Expo Go on Android dropped remote push in SDK 53; a development build is required.
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Constants.appOwnership === 'expo') {
    return { ...base, status: 'unavailable', reason: 'Expo Go on Android cannot receive push. Use a development build.' };
  }
  if (!projectIdOf()) return { ...base, status: 'unavailable', reason: 'No EAS projectId in app config (run `eas init`).' };
  return null;
}

/**
 * Whether the phone's own permission prompt would still show (`ask`), so the app can first say why it wants to send
 * notifications; `granted` and `blocked` need no question, `unavailable` cannot have push at all.
 */
export async function pushPermission(): Promise<'granted' | 'ask' | 'blocked' | 'unavailable'> {
  if (unavailable()) return 'unavailable';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    return p.canAskAgain ? 'ask' : 'blocked';
  } catch {
    return 'unavailable';
  }
}

/** Not asked yet, or put off with "Not now"; Profile offers to turn it on. */
export const pushOff = (): PushRegistration => ({ status: 'off', token: null, platform, deviceName: deviceName(), reason: 'Notifications are off on this phone.' });

/**
 * Ask for permission and fetch this device's Expo push token.
 * Never throws: an unavailable push channel just means the user relies on the in-app list.
 */
export async function getPushRegistration(): Promise<PushRegistration> {
  const base = { token: null, platform, deviceName: deviceName() };
  const cannot = unavailable();
  if (cannot) return cannot;
  const projectId = projectIdOf();
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Site updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.brand,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return { ...base, status: 'denied', reason: 'Notification permission was not granted.' };
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ...base, status: 'ready', token };
  } catch (e) {
    return { ...base, status: 'unavailable', reason: (e as Error).message };
  }
}

/**
 * Opens a notification's screen without stacking a copy of the one already showing (UX item 88): the same screen is
 * left as it is (or replaced, when only its filters differ), anything else is pushed.
 */
export function openNotificationRoute(router: { push: (href: never) => void; replace: (href: never) => void }, currentPath: string, route: string) {
  const [path, query] = route.split('?');
  const target = path.replace('/(tabs)', '') || '/';
  if (target === currentPath) {
    if (query) router.replace(route as never);
    return;
  }
  router.push(route as never);
}

/** Route inside the app for a notification payload (`data` sent by the API). */
export function notificationRoute(data: Record<string, unknown> | undefined): string {
  const entityType = data?.entityType as string | undefined;
  const entityId = data?.entityId as string | undefined;
  if (entityType && entityId) {
    const path = (OUTBOX_DETAIL as Record<string, string | undefined>)[entityType];
    if (path) return `${path}${entityId}`;
  }
  if (data?.type === 'RISK_RAISED' && entityId) return `/risk/${entityId}`;
  if (data?.type === 'SAFETY' && entityId) return entityType === 'WORK_PERMIT' ? `/permit/${entityId}` : `/incident/${entityId}`;
  if (data?.type === 'DEFECT' && entityId) return entityType === 'DEFECT' ? `/snag/${entityId}` : `/snags?projectId=${entityId}`;
  if ((data?.type === 'TEST_DUE' || data?.type === 'TEST_FAILED') && entityId) return `/test/${entityId}`;
  if (data?.type === 'NCR' && entityId) return `/ncr/${entityId}`;
  const projectId = data?.projectId as string | undefined;
  if (data?.type === 'DPR_REMINDER' && projectId) return `/dpr/new?projectId=${projectId}`;
  if (entityType === 'RFI' && entityId) return `/rfi/${entityId}`;
  // Meeting minutes (v6 item 112) have no phone screen yet; the notice itself says what is due.
  if (entityType === 'MEETING') return '/notifications';
  if (data?.type === 'DOCUMENT_ISSUED' && projectId) return `/documents?projectId=${projectId}`;
  if (data?.type === 'LEAVE' || data?.type === 'OVERTIME') return '/staff';
  if (data?.type === 'LOW_STOCK' && projectId) return `/stock?projectId=${projectId}&low=1`;
  if (data?.type === 'APPROVAL_DIGEST') return '/(tabs)/approvals';
  if (data?.type === 'IMPREST') return '/imprest';
  return '/notifications';
}
