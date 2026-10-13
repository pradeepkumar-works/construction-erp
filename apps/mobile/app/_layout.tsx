import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { NotificationsProvider } from '../src/notifications/NotificationsContext';
import { OfflineProvider } from '../src/offline';
import { Loading } from '../src/components';
import { colors } from '../src/theme';

function RootNavigator() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading text="Starting Site App…" />;
  const signedIn = !!user;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
        <Stack.Screen name="progress/new" options={{ title: 'New Progress Entry' }} />
        <Stack.Screen name="progress/[id]" options={{ title: 'Progress Entry' }} />
        <Stack.Screen name="dpr/new" options={{ title: 'New Daily Report' }} />
        <Stack.Screen name="dpr/[id]" options={{ title: 'Daily Report' }} />
        <Stack.Screen name="material-request/new" options={{ title: 'New Material Request' }} />
        <Stack.Screen name="material-request/[id]" options={{ title: 'Material Request' }} />
        <Stack.Screen name="submissions" options={{ title: 'My Submissions' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="outbox" options={{ title: 'Outbox' }} />
        <Stack.Screen name="attendance" options={{ title: 'Attendance' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <OfflineProvider>
            <NotificationsProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </NotificationsProvider>
          </OfflineProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
