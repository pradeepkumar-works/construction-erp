import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SafetyIncidentType, WorkPermitDto, WorkPermitStatus } from '@erp/shared';
import { WORK_PERMIT_STATUS_LABELS } from '@erp/shared';
import { colors, radius, spacing, typography } from '../theme';
import { formatDateTime } from '../utils/format';
import { useT } from '../i18n/LanguageContext';
import type { TranslateVars } from '../i18n/translate';

type Translate = (en: string, vars?: TranslateVars) => string;

type Tone = { fg: string; bg: string };

export const INCIDENT_TONE: Record<SafetyIncidentType, Tone> = {
  NEAR_MISS: { fg: colors.primary, bg: colors.primarySoft },
  FIRST_AID: { fg: colors.warning, bg: colors.warningSoft },
  MEDICAL_TREATMENT: { fg: colors.accent, bg: colors.accentSoft },
  LOST_TIME: { fg: colors.danger, bg: colors.dangerSoft },
  PROPERTY_DAMAGE: { fg: colors.info, bg: colors.infoSoft },
  FATALITY: { fg: colors.textOnPrimary, bg: colors.danger },
};

export const PERMIT_TONE: Record<WorkPermitStatus, Tone> = {
  REQUESTED: { fg: colors.warning, bg: colors.warningSoft },
  ISSUED: { fg: colors.success, bg: colors.successSoft },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft },
  CLOSED: { fg: colors.neutral, bg: colors.neutralSoft },
};

/** "Live" for an issued permit still in its window, "Expired" once it has run out. */
export const permitStatus = (p: Pick<WorkPermitDto, 'status' | 'expired'>, t: Translate): { text: string } & Tone =>
  p.expired ? { text: t('Expired'), fg: colors.danger, bg: colors.dangerSoft } : { text: t(p.status === 'ISSUED' ? 'Live' : WORK_PERMIT_STATUS_LABELS[p.status]), ...PERMIT_TONE[p.status] };

export const permitWindow = (p: Pick<WorkPermitDto, 'validFrom' | 'validTo'>, t: Translate) => t('{from} to {to}', { from: formatDateTime(p.validFrom), to: formatDateTime(p.validTo) });

/** Tick boxes for a list of strings (permit precautions). */
export function Checklist({ label, items, value, onChange }: { label?: string; items: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {items.map((item) => {
        const on = value.includes(item);
        return (
          <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onChange(on ? value.filter((v) => v !== item) : [...value, item])} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.success : colors.textMuted} />
            <Text style={[typography.body, styles.text]}>{t(item)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.label, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.sm },
  pressed: { opacity: 0.6 },
  text: { flex: 1 },
});
