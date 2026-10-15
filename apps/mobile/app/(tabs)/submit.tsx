import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canManageWorkers, canMarkStaff, canKeepStock, canLogMachinery, canManageMaintenance, canMeasure, canRaiseRisk, canRecordAttendance, canReportDefect, canReportSafety, canRequestInspection, canSubmitExpense } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Screen } from '../../src/components';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';

const FORMS = [
  { href: '/progress/new', icon: 'trending-up' as const, tone: colors.primary, title: 'Daily progress', text: 'Quantity executed on one activity, with photos.' },
  { href: '/dpr/new', icon: 'document-text' as const, tone: colors.accent, title: 'Daily progress report (DPR)', text: 'Weather, manpower, machinery, work done and next-day plan.' },
  { href: '/material-request/new', icon: 'cube' as const, tone: colors.success, title: 'Material request', text: 'Items needed on site with required date and priority.' },
];

const ATTENDANCE = { href: '/attendance', icon: 'people' as const, tone: colors.primaryDark, title: 'Attendance', text: 'Workers on site today by contractor and trade. Fills the DPR manpower.' };

const BREAKDOWN = { href: '/breakdown/new', icon: 'build' as const, tone: '#c2410c', title: 'Report a breakdown', text: 'A machine has stopped at site: the store manager and the project manager are told at once.' };

const MACHINERY = { href: '/machinery/new', icon: 'construct' as const, tone: '#b45309', title: 'Machinery log', text: 'A machine’s day: hours worked, idle, breakdown and diesel.' };

const EXPENSE = { href: '/expense/new', icon: 'wallet' as const, tone: '#7c3aed', title: 'Site expense', text: 'A bill paid at site, with GST and the bill photo.' };

const MEASUREMENT = { href: '/measurement/new', icon: 'resize' as const, tone: '#0f766e', title: 'Measurement (MB)', text: 'Nos × L × B × D against a BOQ item, with deductions; the billable quantity.' };

const INSPECTION = { href: '/inspection/new', icon: 'shield-checkmark' as const, tone: colors.warning, title: 'Request inspection', text: 'Work ready for QA/QC to check against the checklist, with photos.' };

const QUALITY = { href: '/quality', icon: 'flask' as const, tone: '#0e7490', title: 'Tests & NCRs', text: 'Enter cube and other test results; record the action taken on an NCR.' };

const DRAWINGS = { href: '/documents', icon: 'document-text-outline' as const, tone: '#334155', title: 'Drawings', text: 'The current revision of every drawing on your project; save them to open without a signal.' };

const ROLL_CALL = { href: '/roll-call', icon: 'checkbox-outline' as const, tone: '#1d4ed8', title: 'Roll call', text: 'Mark the contractors\u2019 workers by name: present, half day or absent, with overtime.' };

const IMPREST = { href: '/imprest', icon: 'cash' as const, tone: '#a16207', title: 'My imprest', text: 'Petty cash in hand after your cash expenses; ask accounts for a top-up.' };

const MY_STAFF = { href: '/staff', icon: 'calendar' as const, tone: '#4d7c0f', title: 'My attendance & leave', text: 'Check in and out, see your leave balance and apply for leave.' };

const STAFF_REGISTER = { href: '/staff-register', icon: 'id-card' as const, tone: '#365314', title: 'Staff register', text: 'Mark the company staff at your site present, half day or absent.' };

const RISK = { href: '/risks', icon: 'alert-circle' as const, tone: colors.danger, title: 'Delays & risks', text: 'Record work held up (days lost, who caused it) or raise a risk; see what is open.' };

const SNAGS = { href: '/snags', icon: 'construct-outline' as const, tone: '#9a3412', title: 'Snags & defects', text: 'Log what needs putting right before handover or in the defect liability period, with photos; mark it fixed.' };

const SAFETY = { href: '/safety', icon: 'medkit' as const, tone: '#b91c1c', title: 'Safety', text: 'Report an incident or near miss, record a toolbox talk, ask for a permit to work.' };

const STOCK = [
  { href: '/stock/receive', icon: 'download' as const, tone: colors.success, title: 'Receive material (GRN)', text: 'Delivery against a purchase order or an approved material request, with the challan photo.' },
  { href: '/stock/issue', icon: 'arrow-up-circle' as const, tone: colors.info, title: 'Issue material', text: 'Material handed out at site, from the stock on hand.' },
];

export default function SubmitHub() {
  const router = useRouter();
  const { user } = useAuth();
  const forms = [
    ...(user && canRecordAttendance(user.roleKey) ? [ATTENDANCE] : []),
    ...(user && canManageWorkers(user.roleKey) ? [ROLL_CALL] : []),
    MY_STAFF,
    ...(user && canMarkStaff(user.roleKey) ? [STAFF_REGISTER] : []),
    ...FORMS,
    DRAWINGS,
    ...(user && canLogMachinery(user.roleKey) ? [MACHINERY] : []),
    ...(user && (canLogMachinery(user.roleKey) || canManageMaintenance(user.roleKey)) ? [BREAKDOWN] : []),
    ...(user && canSubmitExpense(user.roleKey) ? [EXPENSE, IMPREST] : []),
    ...(user && canMeasure(user.roleKey) ? [MEASUREMENT] : []),
    ...(user && canRequestInspection(user.roleKey) ? [INSPECTION, QUALITY] : []),
    ...(user && canKeepStock(user.roleKey) ? STOCK : []),
    ...(user && canRaiseRisk(user.roleKey) ? [RISK] : []),
    ...(user && canReportSafety(user.roleKey) ? [SAFETY] : []),
    ...(user && canReportDefect(user.roleKey) ? [SNAGS] : []),
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
