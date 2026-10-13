import React from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { canApprove } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { colors } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(active: IconName, inactive: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => <Ionicons name={focused ? active : inactive} size={size} color={color} />;
}

export default function TabsLayout() {
  const { user } = useAuth();
  const approver = !!user && canApprove(user.roleKey);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6, paddingBottom: 8 },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: icon('business', 'business-outline') }} />
      <Tabs.Screen name="submit" options={{ title: 'Submit', tabBarIcon: icon('add-circle', 'add-circle-outline') }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: icon('checkmark-done-circle', 'checkmark-done-circle-outline'), href: approver ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}
