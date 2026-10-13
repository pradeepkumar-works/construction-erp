import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canRecordAttendance } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Screen } from '../../src/components';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';

const FORMS = [
  { href: '/progress/new', icon: 'trending-up' as const, tone: colors.primary, title: 'Daily progress', text: 'Quantity executed on one activity, with photos.' },
  { href: '/dpr/new', icon: 'document-text' as const, tone: colors.accent, title: 'Daily progress report (DPR)', text: 'Weather, manpower, machinery, work done and next-day plan.' },
  { href: '/material-request/new', icon: 'cube' as const, tone: colors.success, title: 'Material request', text: 'Items needed on site with required date and priority.' },
];

const ATTENDANCE = { href: '/attendance', icon: 'people' as const, tone: colors.primaryDark, title: 'Attendance', text: 'Workers on site today by contractor and trade. Fills the DPR manpower.' };

export default function SubmitHub() {
  const router = useRouter();
  const { user } = useAuth();
  const forms = user && canRecordAttendance(user.roleKey) ? [ATTENDANCE, ...FORMS] : FORMS;
  return (
    <Screen>
      <Text style={typography.caption}>Choose what to submit. Progress, DPRs and material requests go straight to your project manager for approval.</Text>
      <View style={styles.list}>
        {forms.map((f) => (
          <Pressable key={f.href} onPress={() => router.push(f.href)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <View style={[styles.icon, { backgroundColor: f.tone }]}>
              <Ionicons name={f.icon} size={28} color="#fff" />
            </View>
            <View style={styles.body}>
              <Text style={typography.h3}>{f.title}</Text>
              <Text style={[typography.caption, styles.text]}>{f.text}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
      <Button title="My submissions" variant="secondary" icon="list" onPress={() => router.push('/submissions')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginVertical: spacing.lg, gap: spacing.md },
  tile: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, minHeight: 96, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  pressed: { opacity: 0.85 },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: spacing.lg },
  body: { flex: 1, marginRight: spacing.sm },
  text: { marginTop: 2 },
});
