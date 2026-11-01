import React from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { NotificationsProvider } from '../src/notifications/NotificationsContext';
import { OfflineProvider } from '../src/offline';
import { LanguageProvider, useT } from '../src/i18n/LanguageContext';
import { Loading, SnackbarProvider } from '../src/components';
import { useFonts, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { PRODUCT_NAME } from '@erp/shared';
import { colors, scheme } from '../src/theme';

/** Navigation chrome (cards, headers, tab bar defaults) in the palette src/theme.ts picked at launch. */
const navigationTheme = {
  ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
  colors: { primary: colors.primary, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, notification: colors.danger },
};

// The window behind the screens (seen during transitions and behind the keyboard) matches the page.
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);

function RootNavigator() {
  const { user, ready } = useAuth();
  // If the fonts fail to load the app carries on with the system font.
  const [fontsLoaded, fontError] = useFonts({ Archivo_700Bold, Archivo_800ExtraBold });
  const t = useT();
  if (!ready || (!fontsLoaded && !fontError)) return <Loading text={t('Starting {product}…', { product: PRODUCT_NAME })} />;
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
        <Stack.Screen name="project/[id]" options={{ title: t('Project') }} />
        <Stack.Screen name="progress/new" options={{ title: t('New Progress Entry') }} />
        <Stack.Screen name="progress/[id]" options={{ title: t('Progress Entry') }} />
        <Stack.Screen name="dpr/new" options={{ title: t('New Daily Report') }} />
        <Stack.Screen name="dpr/[id]" options={{ title: t('Daily Report') }} />
        <Stack.Screen name="material-request/new" options={{ title: t('New Material Request') }} />
        <Stack.Screen name="material-request/[id]" options={{ title: t('Material Request') }} />
        <Stack.Screen name="submissions" options={{ title: t('My Submissions') }} />
        <Stack.Screen name="my-work" options={{ title: t('My work') }} />
        <Stack.Screen name="module/[key]" options={{ title: t('Module') }} />
        <Stack.Screen name="find" options={{ title: t('Search') }} />
        <Stack.Screen name="notifications" options={{ title: t('Notifications') }} />
        <Stack.Screen name="outbox" options={{ title: t('Outbox') }} />
        <Stack.Screen name="attendance" options={{ title: t('Attendance') }} />
        <Stack.Screen name="roll-call" options={{ title: t('Roll call') }} />
        <Stack.Screen name="imprest" options={{ title: t('My imprest') }} />
        <Stack.Screen name="stock/index" options={{ title: t('Stock') }} />
        <Stack.Screen name="stock/receive" options={{ title: t('Receive Material') }} />
        <Stack.Screen name="stock/issue" options={{ title: t('Issue Material') }} />
        <Stack.Screen name="stock/fuel" options={{ title: t('Fuel issue') }} />
        <Stack.Screen name="machinery/new" options={{ title: t('Log Machinery') }} />
        <Stack.Screen name="machinery/[id]" options={{ title: t('Machinery Log') }} />
        <Stack.Screen name="breakdown/new" options={{ title: t('Report Breakdown') }} />
        <Stack.Screen name="expense/new" options={{ title: t('New Site Expense') }} />
        <Stack.Screen name="expense/[id]" options={{ title: t('Site Expense') }} />
        <Stack.Screen name="measurement/new" options={{ title: t('New Measurement') }} />
        <Stack.Screen name="measurement/[id]" options={{ title: t('Measurement') }} />
        <Stack.Screen name="bill/[id]" options={{ title: t('RA Bill') }} />
        <Stack.Screen name="purchase-order/[id]" options={{ title: t('Purchase Order') }} />
        <Stack.Screen name="vendor-bill/[id]" options={{ title: t('Vendor Bill') }} />
        <Stack.Screen name="work-order/[id]" options={{ title: t('Work Order') }} />
        <Stack.Screen name="subcontract-bill/[id]" options={{ title: t('Subcontractor Bill') }} />
        <Stack.Screen name="payment-request/[id]" options={{ title: t('Payment request') }} />
        <Stack.Screen name="supplier-choice/[id]" options={{ title: t('Supplier choice') }} />
        <Stack.Screen name="inspection/new" options={{ title: t('Request Inspection') }} />
        <Stack.Screen name="inspection/[id]" options={{ title: t('Inspection') }} />
        <Stack.Screen name="risks" options={{ title: t('Delays & Risks') }} />
        <Stack.Screen name="risk/new" options={{ title: t('Delay or Risk') }} />
        <Stack.Screen name="risk/[id]" options={{ title: t('Delay / Risk') }} />
        <Stack.Screen name="sector" options={{ title: t('Sector Progress') }} />
        <Stack.Screen name="safety" options={{ title: t('Safety') }} />
        <Stack.Screen name="incident/new" options={{ title: t('Report an Incident') }} />
        <Stack.Screen name="incident/[id]" options={{ title: t('Incident') }} />
        <Stack.Screen name="snags" options={{ title: t('Snags & Defects') }} />
        <Stack.Screen name="snag/new" options={{ title: t('Report Snag') }} />
        <Stack.Screen name="snag/[id]" options={{ title: t('Snag') }} />
        <Stack.Screen name="talk/new" options={{ title: t('Toolbox Talk') }} />
        <Stack.Screen name="ppe/new" options={{ title: t('Issue PPE') }} />
        <Stack.Screen name="rfis" options={{ title: t('RFIs') }} />
        <Stack.Screen name="letters" options={{ title: t('Letters for you') }} />
        <Stack.Screen name="letter/[id]" options={{ title: t('Letter') }} />
        <Stack.Screen name="rfi/new" options={{ title: t('Raise RFI') }} />
        <Stack.Screen name="rfi/[id]" options={{ title: t('RFI') }} />
        <Stack.Screen name="permit/new" options={{ title: t('Ask for a Permit') }} />
        <Stack.Screen name="permit/[id]" options={{ title: t('Permit to Work') }} />
        <Stack.Screen name="quality" options={{ title: t('Tests & NCRs') }} />
        <Stack.Screen name="documents" options={{ title: t('Drawings') }} />
        <Stack.Screen name="drawing/[id]" options={{ title: t('Drawing') }} />
        <Stack.Screen name="document-page" options={{ title: t('Document page') }} />
        <Stack.Screen name="staff" options={{ title: t('Attendance & leave') }} />
        <Stack.Screen name="payslips" options={{ title: t('My payslips') }} />
        <Stack.Screen name="staff-register" options={{ title: t('Staff register') }} />
        <Stack.Screen name="ncr/[id]" options={{ title: t('NCR') }} />
        <Stack.Screen name="test/[id]" options={{ title: t('Test') }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SnackbarProvider>
          <LanguageProvider>
            <AuthProvider>
              <OfflineProvider>
                <NotificationsProvider>
                  <ThemeProvider value={navigationTheme}>
                    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                    <RootNavigator />
                  </ThemeProvider>
                </NotificationsProvider>
              </OfflineProvider>
            </AuthProvider>
          </LanguageProvider>
        </SnackbarProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
