import React from 'react';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { mayApprove } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, maxFontScale } from '../../src/theme';
import { useT } from '../../src/i18n/LanguageContext';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(active: IconName, inactive: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => <Ionicons name={focused ? active : inactive} size={size} color={color} />;
}

/** The tab bar keeps its height, so its labels follow the phone's font size only up to `maxFontScale`. */
function tabLabel({ color, children, position }: { color: ColorValue; children: string; position: 'beside-icon' | 'below-icon' }) {
  return (
    <Text maxFontSizeMultiplier={maxFontScale} numberOfLines={1} style={[styles.label, position === 'beside-icon' && styles.labelBeside, { color }]}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const approver = !!user && mayApprove(user);
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabel: tabLabel,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6, paddingBottom: 8 },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Home'), headerShown: false, tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="projects" options={{ title: t('Projects'), tabBarIcon: icon('business', 'business-outline') }} />
      <Tabs.Screen name="submit" options={{ title: t('Submit'), tabBarIcon: icon('add-circle', 'add-circle-outline') }} />
      <Tabs.Screen name="ask" options={{ title: t('Ask'), tabBarIcon: icon('sparkles', 'sparkles-outline'), href: user?.ai ? undefined : null }} />
      <Tabs.Screen name="approvals" options={{ title: t('Approvals'), tabBarIcon: icon('checkmark-done-circle', 'checkmark-done-circle-outline'), href: approver ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', textAlign: 'center', backgroundColor: 'transparent' },
  labelBeside: { fontSize: 13, marginStart: 5, marginEnd: 12 },
});
