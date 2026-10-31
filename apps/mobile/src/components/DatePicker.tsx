import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, maxFontScale, radius, scheme, spacing, touch, typography } from '../theme';
import { Touchable } from './Touchable';
import { addDays, formatDate, isIsoDate, toIsoDate, today } from '../utils/format';
import { useT } from '../i18n/LanguageContext';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/** The native picker module; required lazily so the web build, which types the date instead, never loads it. */
function picker() {
  return require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
}

/** "2026-10-17" as a local date (midnight on this phone), and back. */
const fromIso = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
};

interface Props {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  required?: boolean;
  /** Latest date that can be picked, as YYYY-MM-DD (e.g. today for a report). */
  max?: string;
  min?: string;
}

/**
 * A date as YYYY-MM-DD (UX item 80): the phone's own calendar on a tap, so no one types a date on the number keypad,
 * plus a day back, a day on and Today beside it. On the web build the date is typed.
 */
export function DatePicker({ label, value, onChange, error, required, max, min }: Props) {
  const valid = isIsoDate(value);
  const t = useT();
  // On a 360 dp phone the row has no room for the calendar icon beside the date.
  const roomy = useWindowDimensions().width >= 400;
  const [iosOpen, setIosOpen] = useState(false);
  const [iosValue, setIosValue] = useState<Date>(() => fromIso(value));
  const shown = valid ? (value === today() ? t('Today, {date}', { date: formatDate(value) }) : formatDate(value)) : t('Choose a date');

  const open = () => {
    if (Platform.OS === 'android') {
      picker().DateTimePickerAndroid.open({
        value: valid ? fromIso(value) : new Date(),
        mode: 'date',
        maximumDate: max ? fromIso(max) : undefined,
        minimumDate: min ? fromIso(min) : undefined,
        onValueChange: (_e, d) => onChange(toIsoDate(d)),
      });
      return;
    }
    setIosValue(valid ? fromIso(value) : new Date());
    setIosOpen(true);
  };
  const step = (days: number) => {
    const next = addDays(valid ? value : today(), days);
    if ((max && next > max) || (min && next < min)) return;
    onChange(next);
  };

  const a11yName = `${label ?? t('Date')}${required ? `, ${t('required')}` : ''}: ${shown}`;
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label} maxFontSizeMultiplier={maxFontScale}>
          {label}
          {required ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Touchable onPress={() => step(-1)} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('Previous day')}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Touchable>
        {Platform.OS === 'web' ? (
          <View style={[styles.field, (!valid || !!error) && styles.fieldError]}>
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              maxFontSizeMultiplier={maxFontScale}
              style={styles.input}
              accessibilityLabel={label ?? t('Date')}
            />
          </View>
        ) : (
          <Touchable
            onPress={open}
            style={[styles.field, styles.fieldRow, (!valid || !!error) && styles.fieldError]}
            accessibilityRole="button"
            accessibilityLabel={a11yName}
            accessibilityHint={error ?? t('Opens the calendar')}
          >
            {roomy ? <Ionicons name="calendar-outline" size={20} color={colors.primary} /> : null}
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={maxFontScale}>
              {valid ? formatDate(value) : t('Choose a date')}
            </Text>
          </Touchable>
        )}
        <Touchable onPress={() => step(1)} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('Next day')}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Touchable>
        <Touchable onPress={() => onChange(today())} style={styles.todayBtn} accessibilityRole="button" accessibilityLabel={t('Today')}>
          <Text style={styles.todayText} maxFontSizeMultiplier={maxFontScale}>
            {t('Today')}
          </Text>
        </Touchable>
      </View>
      {error ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.error}>{error}</Text>
      ) : !valid ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.error}>{Platform.OS === 'web' ? t('Enter a date as YYYY-MM-DD') : t('Choose a date')}</Text>
      ) : value === today() ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.hint}>{t('Today')}</Text>
      ) : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label ?? t('Date')}>
          {iosOpen
            ? React.createElement(picker().default, {
                value: iosValue,
                mode: 'date',
                display: 'inline',
                themeVariant: scheme,
                accentColor: colors.primary,
                maximumDate: max ? fromIso(max) : undefined,
                minimumDate: min ? fromIso(min) : undefined,
                onValueChange: (_e: unknown, d: Date) => setIosValue(d),
              })
            : null}
          <Button
            title={t('Done')}
            onPress={() => {
              onChange(toIsoDate(iosValue));
              setIosOpen(false);
            }}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}

/** "14:30" from a Date, and a Date (today, at that time) from "14:30". */
const toHHmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fromHHmm = (v: string) => {
  const d = new Date();
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  d.setHours(m ? Number(m[1]) : d.getHours(), m ? Number(m[2]) : 0, 0, 0);
  return d;
};

/** A time of day as HH:mm, picked on the phone's own clock (UX item 80); empty until set unless `required`. */
export function TimePicker({ label, value, onChange, error, required }: { label?: string; value: string; onChange: (v: string) => void; error?: string | null; required?: boolean }) {
  const t = useT();
  const [iosOpen, setIosOpen] = useState(false);
  const [iosValue, setIosValue] = useState<Date>(() => fromHHmm(value));
  const set = /^\d{1,2}:\d{2}$/.test(value);

  const open = () => {
    if (Platform.OS === 'android') {
      picker().DateTimePickerAndroid.open({ value: fromHHmm(value), mode: 'time', is24Hour: true, onValueChange: (_e, d) => onChange(toHHmm(d)) });
      return;
    }
    setIosValue(fromHHmm(value));
    setIosOpen(true);
  };

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label} maxFontSizeMultiplier={maxFontScale}>
          {label}
          {required ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <View style={styles.row}>
        {Platform.OS === 'web' ? (
          <View style={[styles.field, styles.noMargin, !!error && styles.fieldError]}>
            <TextInput value={value} onChangeText={onChange} placeholder="HH:mm" placeholderTextColor={colors.textMuted} maxLength={5} style={styles.input} accessibilityLabel={label ?? t('Time')} />
          </View>
        ) : (
          <Touchable
            onPress={open}
            style={[styles.field, styles.fieldRow, styles.noMargin, !!error && styles.fieldError]}
            accessibilityRole="button"
            accessibilityLabel={`${label ?? t('Time')}${required ? `, ${t('required')}` : ''}: ${set ? value : t('not set')}`}
            accessibilityHint={error ?? t('Opens the clock')}
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={[styles.value, !set && styles.placeholder]} maxFontSizeMultiplier={maxFontScale}>
              {set ? value : t('Set time')}
            </Text>
          </Touchable>
        )}
        {set && !required ? (
          <Touchable onPress={() => onChange('')} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel={t('Clear time')}>
            <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
          </Touchable>
        ) : null}
      </View>
      {error ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.error}>{error}</Text> : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label ?? t('Time')}>
          {iosOpen
            ? React.createElement(picker().default, {
                value: iosValue,
                mode: 'time',
                display: 'spinner',
                themeVariant: scheme,
                onValueChange: (_e: unknown, d: Date) => setIosValue(d),
              })
            : null}
          <Button
            title={t('Done')}
            onPress={() => {
              onChange(toHHmm(iosValue));
              setIosOpen(false);
            }}
          />
        </BottomSheet>
      ) : null}
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
  field: {
    flex: 1,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: touch.height,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  noMargin: { marginHorizontal: 0 },
  fieldError: { borderColor: colors.danger },
  input: { fontSize: 17, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  value: { fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'] },
  placeholder: { color: colors.textMuted },
  todayBtn: { marginLeft: spacing.sm, minHeight: touch.height, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary },
  todayText: { color: colors.primary, fontWeight: '700' },
  clearBtn: { width: touch.heightSm, height: touch.height, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, marginTop: spacing.xs, fontSize: fontSize.secondary },
  hint: { ...typography.caption, marginTop: spacing.xs },
});
