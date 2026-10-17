import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { addDays, formatDate, isIsoDate, today } from '../utils/format';
import { useT } from '../i18n/LanguageContext';

interface Props {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  required?: boolean;
}

/** Simple, dependency-free date field: YYYY-MM-DD text plus quick -1 / today / +1 day buttons. */
export function DatePicker({ label, value, onChange, error, required }: Props) {
  const valid = isIsoDate(value);
  const t = useT();
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Pressable onPress={() => onChange(addDays(value, -1))} style={styles.stepBtn} accessibilityLabel={t('Previous day')}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View style={[styles.inputWrap, (!valid || !!error) && styles.inputError]}>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            maxFontSizeMultiplier={maxFontScale}
            style={styles.input}
          />
        </View>
        <Pressable onPress={() => onChange(addDays(value, 1))} style={styles.stepBtn} accessibilityLabel={t('Next day')}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => onChange(today())} style={styles.todayBtn}>
          <Text style={styles.todayText} maxFontSizeMultiplier={maxFontScale}>{t('Today')}</Text>
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !valid ? (
        <Text style={styles.error}>{t('Enter a date as YYYY-MM-DD')}</Text>
      ) : (
        <Text style={styles.hint}>{value === today() ? t('Today, {date}', { date: formatDate(value) }) : formatDate(value)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.xs },
  req: { color: colors.danger },
  row: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: touch.heightSm,
    height: touch.height,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  inputWrap: {
    flex: 1,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: touch.height,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.danger },
  input: { fontSize: 17, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  todayBtn: { marginLeft: spacing.sm, minHeight: touch.height, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary },
  todayText: { color: colors.primary, fontWeight: '700' },
  error: { color: colors.danger, marginTop: spacing.xs, fontSize: 13 },
  hint: { ...typography.caption, marginTop: spacing.xs },
});
