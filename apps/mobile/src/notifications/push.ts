import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { PushPlatform } from '@erp/shared';

export type PushStatus =
  /** Token obtained and ready to be registered with the API. */
  | 'ready'
  /** User declined the notification permission. */
  | 'denied'
  /** Simulator, web, Expo Go on Android, or no EAS projectId: remote push is not possible here. */
  | 'unavailable';

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

/**
 * Ask for permission and fetch this device's Expo push token.
 * Never throws: an unavailable push channel just means the user relies on the in-app list.
 */
export async function getPushRegistration(): Promise<PushRegistration> {
  const deviceName = Device.modelName ?? Device.deviceName ?? null;
  const base = { token: null, platform, deviceName };
  if (Platform.OS === 'web') return { ...base, status: 'unavailable', reason: 'Push is only available in the native app.' };
  if (!Device.isDevice) return { ...base, status: 'unavailable', reason: 'Push needs a physical device.' };
  // Expo Go on Android dropped remote push in SDK 53; a development build is required.
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Constants.appOwnership === 'expo') {
    return { ...base, status: 'unavailable', reason: 'Expo Go on Android cannot receive push. Use a development build.' };
  }
  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
  if (!projectId) return { ...base, status: 'unavailable', reason: 'No EAS projectId in app config (run `eas init`).' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Site updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1D4ED8',
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

/** Route inside the app for a notification payload (`data` sent by the API). */
export function notificationRoute(data: Record<string, unknown> | undefined): string {
  const entityType = data?.entityType as string | undefined;
  const entityId = data?.entityId as string | undefined;
  if (entityType && entityId) {
    const path = entityType === 'PROGRESS' ? '/progress/' : entityType === 'DPR' ? '/dpr/' : entityType === 'MATERIAL_REQUEST' ? '/material-request/' : entityType === 'MACHINERY' ? '/machinery/' : entityType === 'EXPENSE' ? '/expense/' : entityType === 'MEASUREMENT' ? '/measurement/' : null;
    if (path) return `${path}${entityId}`;
  }
  if (data?.type === 'RISK_RAISED' && entityId) return `/risk/${entityId}`;
  const projectId = data?.projectId as string | undefined;
  if (data?.type === 'DPR_REMINDER' && projectId) return `/dpr/new?projectId=${projectId}`;
  if (data?.type === 'LOW_STOCK' && projectId) return `/stock?projectId=${projectId}&low=1`;
  if (data?.type === 'APPROVAL_DIGEST') return '/(tabs)/approvals';
  return '/notifications';
}
