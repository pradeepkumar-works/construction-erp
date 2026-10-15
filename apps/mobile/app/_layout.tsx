import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { NotificationsProvider } from '../src/notifications/NotificationsContext';
import { OfflineProvider } from '../src/offline';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { Loading } from '../src/components';
import { useFonts, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { PRODUCT_NAME } from '@erp/shared';
import { colors } from '../src/theme';

function RootNavigator() {
  const { user, ready } = useAuth();
  // If the fonts fail to load the app carries on with the system font.
  const [fontsLoaded, fontError] = useFonts({ Archivo_700Bold, Archivo_800ExtraBold });
  if (!ready || (!fontsLoaded && !fontError)) return <Loading text={`Starting ${PRODUCT_NAME}…`} />;
  const signedIn = !!user;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: 'Archivo_700Bold' },
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
        <Stack.Screen name="stock/index" options={{ title: 'Stock' }} />
        <Stack.Screen name="stock/receive" options={{ title: 'Receive Material' }} />
        <Stack.Screen name="stock/issue" options={{ title: 'Issue Material' }} />
        <Stack.Screen name="machinery/new" options={{ title: 'Log Machinery' }} />
        <Stack.Screen name="machinery/[id]" options={{ title: 'Machinery Log' }} />
        <Stack.Screen name="expense/new" options={{ title: 'New Site Expense' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Site Expense' }} />
        <Stack.Screen name="measurement/new" options={{ title: 'New Measurement' }} />
        <Stack.Screen name="measurement/[id]" options={{ title: 'Measurement' }} />
        <Stack.Screen name="bill/[id]" options={{ title: 'RA Bill' }} />
        <Stack.Screen name="purchase-order/[id]" options={{ title: 'Purchase Order' }} />
        <Stack.Screen name="vendor-bill/[id]" options={{ title: 'Vendor Bill' }} />
        <Stack.Screen name="work-order/[id]" options={{ title: 'Work Order' }} />
        <Stack.Screen name="subcontract-bill/[id]" options={{ title: 'Subcontractor Bill' }} />
        <Stack.Screen name="inspection/new" options={{ title: 'Request Inspection' }} />
        <Stack.Screen name="inspection/[id]" options={{ title: 'Inspection' }} />
        <Stack.Screen name="risks" options={{ title: 'Delays & Risks' }} />
        <Stack.Screen name="risk/new" options={{ title: 'Delay or Risk' }} />
        <Stack.Screen name="risk/[id]" options={{ title: 'Delay / Risk' }} />
        <Stack.Screen name="quality" options={{ title: 'Tests & NCRs' }} />
        <Stack.Screen name="documents" options={{ title: 'Drawings' }} />
        <Stack.Screen name="staff" options={{ title: 'Attendance & leave' }} />
        <Stack.Screen name="staff-register" options={{ title: 'Staff register' }} />
        <Stack.Screen name="ncr/[id]" options={{ title: 'NCR' }} />
        <Stack.Screen name="test/[id]" options={{ title: 'Test' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <OfflineProvider>
              <NotificationsProvider>
                <StatusBar style="dark" />
                <RootNavigator />
              </NotificationsProvider>
            </OfflineProvider>
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
