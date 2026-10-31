import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canManageWorkers, canMarkStaff, canKeepStock, canLogMachinery, canManageMaintenance, canMeasure, canRaiseRisk, canRecordAttendance, canReportDefect, canRaiseRfi, canReportSafety, canRequestInspection, canSubmitExpense, pathIsOff } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Screen, SectionTitle, Touchable } from '../../src/components';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';
import { useT } from '../../src/i18n/LanguageContext';

type Form = { href: string; icon: React.ComponentProps<typeof Ionicons>['name']; tone: string; title: string; text: string };

const PROGRESS: Form = { href: '/progress/new', icon: 'trending-up', tone: colors.tileBlue, title: 'Progress entry', text: 'Quantity done on one activity, with photos.' };
const DPR: Form = { href: '/dpr/new', icon: 'document-text', tone: colors.tileOrange, title: 'Daily report (DPR)', text: 'Weather, labour, machinery, work done and next day plan.' };
const INDENT: Form = { href: '/material-request/new', icon: 'cube', tone: colors.tileGreen, title: 'Indent', text: 'Items needed on site, with the date needed and priority.' };
const ATTENDANCE: Form = { href: '/attendance', icon: 'people', tone: colors.tileNavy, title: 'Labour attendance', text: 'Workers on site today by contractor and trade. Fills the DPR labour.' };
const BREAKDOWN: Form = { href: '/breakdown/new', icon: 'build', tone: colors.tileBrick, title: 'Report breakdown', text: 'A machine has stopped at site: the store manager and the project manager are told at once.' };
const MACHINERY: Form = { href: '/machinery/new', icon: 'construct', tone: colors.tileAmber, title: 'Machinery log', text: 'A machine’s day: hours worked, idle, breakdown and diesel.' };
const EXPENSE: Form = { href: '/expense/new', icon: 'wallet', tone: colors.tileViolet, title: 'Site expense', text: 'A bill paid at site, with GST and the bill photo.' };
const MEASUREMENT: Form = { href: '/measurement/new', icon: 'resize', tone: colors.tileTeal, title: 'Measurement (MB)', text: 'Nos × L × B × D against a BOQ item, with deductions; the billable quantity.' };
const INSPECTION: Form = { href: '/inspection/new', icon: 'shield-checkmark', tone: colors.tileBrick, title: 'Request inspection', text: 'Work ready for QA/QC to check against the checklist, with photos.' };
const QUALITY: Form = { href: '/quality', icon: 'flask', tone: colors.tileCyan, title: 'Tests and NCRs', text: 'Enter cube and other test results; record the action taken on an NCR.' };
const ROLL_CALL: Form = { href: '/roll-call', icon: 'checkbox-outline', tone: colors.tileIndigo, title: 'Roll call', text: 'Mark the contractors\u2019 workers by name: present, half day or absent, with overtime.' };
const IMPREST: Form = { href: '/imprest', icon: 'cash', tone: colors.tileOchre, title: 'My imprest', text: 'Petty cash in hand after your cash expenses; request a top-up from accounts.' };
const STAFF_REGISTER: Form = { href: '/staff-register', icon: 'id-card', tone: colors.tileOlive, title: 'Staff register', text: 'Mark the company staff at your site present, half day or absent.' };
const RISK: Form = { href: '/risks', icon: 'alert-circle', tone: colors.tileRed, title: 'Delays and risks', text: 'Record work held up (days lost, who caused it) or a new risk; see what is open.' };
const SNAGS: Form = { href: '/snags', icon: 'construct-outline', tone: colors.tileRust, title: 'Snags and defects', text: 'Report what needs putting right before handover or in the defect liability period, with photos; mark it fixed.' };
const RFIS: Form = { href: '/rfis', icon: 'help-circle', tone: colors.tileIndigo, title: 'RFIs', text: 'Ask the client or consultant about a drawing or the work, with a photo; see their answers.' };
const SAFETY: Form = { href: '/safety', icon: 'medkit', tone: colors.tileCrimson, title: 'Safety', text: 'Report an incident or near miss, record a toolbox talk, request a permit to work.' };
const RECEIVE: Form = { href: '/stock/receive', icon: 'download', tone: colors.tileGreen, title: 'Receive material (GRN)', text: 'Delivery against a purchase order or an approved indent, with the challan photo.' };
const ISSUE: Form = { href: '/stock/issue', icon: 'arrow-up-circle', tone: colors.tileViolet, title: 'Issue material', text: 'Material handed out at site, from the stock on hand.' };

export default function SubmitHub() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const role = user?.roleKey;
  const may = (allowed: boolean | undefined, ...forms: Form[]) => (allowed ? forms : []);
  // Nothing from a module the company has turned off (v6 item 117).
  const groups = [
    {
      title: 'Site reports',
      forms: [
        PROGRESS,
        DPR,
        ...may(role && canRecordAttendance(role), ATTENDANCE),
        ...may(role && canManageWorkers(role), ROLL_CALL),
        ...may(role && canMarkStaff(role), STAFF_REGISTER),
        ...may(role && canLogMachinery(role), MACHINERY),
        ...may(role && (canLogMachinery(role) || canManageMaintenance(role)), BREAKDOWN),
        ...may(role && canMeasure(role), MEASUREMENT),
      ],
    },
    { title: 'Stores', forms: [...may(role && canKeepStock(role), RECEIVE, ISSUE), INDENT] },
    {
      title: 'Quality and safety',
      forms: [
        ...may(role && canRequestInspection(role), INSPECTION, QUALITY),
        ...may(role && canReportSafety(role), SAFETY),
        ...may(role && canReportDefect(role), SNAGS),
        ...may(role && canRaiseRisk(role), RISK),
        ...may(role && canRaiseRfi(role), RFIS),
      ],
    },
    { title: 'Money', forms: may(role && canSubmitExpense(role), EXPENSE, IMPREST) },
  ]
    .map((g) => ({ ...g, forms: g.forms.filter((f) => !pathIsOff(f.href, user?.modulesOff)) }))
    .filter((g) => g.forms.length);
  return (
    <Screen>
      <Text style={typography.caption}>{t('Choose what to record. Entries that need approval go to the approver set for your project.')}</Text>
      {groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <SectionTitle title={t(g.title)} />
          <View style={styles.list}>
            {g.forms.map((f) => (
              <Touchable key={f.href} accessibilityRole="button" onPress={() => router.push(f.href)} style={styles.tile}>
                <View style={[styles.icon, { backgroundColor: f.tone }]}>
                  <Ionicons name={f.icon} size={28} color={colors.onTile} />
                </View>
                <View style={styles.body}>
                  <Text style={typography.h3}>{t(f.title)}</Text>
                  <Text style={[typography.caption, styles.text]}>{t(f.text)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
              </Touchable>
            ))}
          </View>
        </View>
      ))}
      <Button title={t('My entries')} variant="secondary" icon="list" onPress={() => router.push('/submissions')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.lg },
  list: { gap: spacing.md, marginBottom: spacing.md },
  tile: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, minHeight: 96, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  pressed: { opacity: 0.85 },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: spacing.lg },
  body: { flex: 1, marginRight: spacing.sm },
  text: { marginTop: 2 },
});
