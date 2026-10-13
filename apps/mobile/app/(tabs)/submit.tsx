import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canKeepStock, canLogMachinery, canMeasure, canRecordAttendance, canSubmitExpense } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Screen } from '../../src/components';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';

const FORMS = [
  { href: '/progress/new', icon: 'trending-up' as const, tone: colors.primary, title: 'Daily progress', text: 'Quantity executed on one activity, with photos.' },
  { href: '/dpr/new', icon: 'document-text' as const, tone: colors.accent, title: 'Daily progress report (DPR)', text: 'Weather, manpower, machinery, work done and next-day plan.' },
  { href: '/material-request/new', icon: 'cube' as const, tone: colors.success, title: 'Material request', text: 'Items needed on site with required date and priority.' },
];

const ATTENDANCE = { href: '/attendance', icon: 'people' as const, tone: colors.primaryDark, title: 'Attendance', text: 'Workers on site today by contractor and trade. Fills the DPR manpower.' };

const MACHINERY = { href: '/machinery/new', icon: 'construct' as const, tone: '#b45309', title: 'Machinery log', text: 'A machine’s day: hours worked, idle, breakdown and diesel.' };

const EXPENSE = { href: '/expense/new', icon: 'wallet' as const, tone: '#7c3aed', title: 'Site expense', text: 'A bill paid at site, with GST and the bill photo.' };

const MEASUREMENT = { href: '/measurement/new', icon: 'resize' as const, tone: '#0f766e', title: 'Measurement (MB)', text: 'Nos × L × B × D against a BOQ item, with deductions; the billable quantity.' };

const STOCK = [
  { href: '/stock/receive', icon: 'download' as const, tone: colors.success, title: 'Receive material (GRN)', text: 'Delivery against an approved material request, with the challan photo.' },
  { href: '/stock/issue', icon: 'arrow-up-circle' as const, tone: colors.info, title: 'Issue material', text: 'Material handed out at site, from the stock on hand.' },
];

export default function SubmitHub() {
  const router = useRouter();
  const { user } = useAuth();
  const forms = [
    ...(user && canRecordAttendance(user.roleKey) ? [ATTENDANCE] : []),
    ...FORMS,
    ...(user && canLogMachinery(user.roleKey) ? [MACHINERY] : []),
    ...(user && canSubmitExpense(user.roleKey) ? [EXPENSE] : []),
    ...(user && canMeasure(user.roleKey) ? [MEASUREMENT] : []),
    ...(user && canKeepStock(user.roleKey) ? STOCK : []),
  ];
  return (
    <Screen>
      <Text style={typography.caption}>Choose what to submit. Progress, DPRs, material requests, machinery logs, expenses and measurements go straight to your project manager for approval.</Text>
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
