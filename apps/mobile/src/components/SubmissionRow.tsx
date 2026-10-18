import React from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent, type AccessibilityActionInfo, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SubmissionStatus, SubmissionType } from '@erp/shared';
import { colors, radius, spacing, typography } from '../theme';
import { StatusBadge } from './StatusBadge';
import { Touchable } from './Touchable';

/** Submissions plus attendance sheets, register entries and safety records (which can also sit in the outbox). */
export type EntryType = SubmissionType | 'ATTENDANCE' | 'RISK' | 'SAFETY_INCIDENT' | 'TOOLBOX_TALK' | 'WORK_PERMIT';

export const TYPE_ICON: Record<EntryType, keyof typeof Ionicons.glyphMap> = {
  PROGRESS: 'trending-up',
  DPR: 'document-text',
  MATERIAL_REQUEST: 'cube',
  MACHINERY: 'construct',
  EXPENSE: 'wallet',
  MEASUREMENT: 'resize',
  BILL: 'receipt',
  PURCHASE_ORDER: 'cart',
  VENDOR_BILL: 'document-attach',
  WORK_ORDER: 'hammer',
  SUBCONTRACT_BILL: 'reader',
  INSPECTION: 'shield-checkmark',
  ATTENDANCE: 'people',
  RISK: 'alert-circle',
  SAFETY_INCIDENT: 'medkit',
  TOOLBOX_TALK: 'megaphone',
  WORK_PERMIT: 'key',
};

export const TYPE_SHORT: Record<EntryType, string> = {
  PROGRESS: 'Progress',
  DPR: 'DPR',
  MATERIAL_REQUEST: 'Material',
  MACHINERY: 'Machinery',
  EXPENSE: 'Expense',
  MEASUREMENT: 'Measurement',
  BILL: 'RA bill',
  PURCHASE_ORDER: 'PO',
  VENDOR_BILL: 'Vendor bill',
  WORK_ORDER: 'Work order',
  SUBCONTRACT_BILL: 'Sub bill',
  INSPECTION: 'Inspection',
  ATTENDANCE: 'Attendance',
  RISK: 'Delay / risk',
  SAFETY_INCIDENT: 'Incident',
  TOOLBOX_TALK: 'Toolbox talk',
  WORK_PERMIT: 'Permit',
};

interface Props {
  type: EntryType;
  title: string;
  subtitle?: string;
  meta?: string;
  status?: SubmissionStatus;
  onPress: () => void;
  style?: ViewStyle;
  /** Extra screen-reader actions (e.g. Approve on a row that also swipes). */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

export function SubmissionRow({ type, title, subtitle, meta, status, onPress, style, accessibilityActions, onAccessibilityAction }: Props) {
  return (
    <Touchable
      onPress={onPress}
      style={[styles.row, style]}
      pressedStyle={styles.pressed}
      accessibilityRole="button"
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={TYPE_ICON[type]} size={22} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {status ? <StatusBadge status={status} /> : null}
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 72,
  },
  pressed: { opacity: 0.85 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  body: { flex: 1, marginRight: spacing.sm },
  title: { ...typography.bodyStrong },
  subtitle: { ...typography.caption, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.sm, flexWrap: 'wrap' },
  meta: { ...typography.caption },
});
