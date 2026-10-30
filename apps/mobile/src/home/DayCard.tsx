import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canMarkStaff, type MyStaffDto, type PayslipDto, type StaffSummaryDto } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Skeleton } from '../components/Skeleton';
import { Touchable } from '../components/Touchable';
import { useT } from '../i18n/LanguageContext';
import { colors, familyTint, fonts, fontSize, maxFontScale, radius, spacing, type IconName } from '../theme';
import { formatDayMonth, formatMonth, formatTime, formatWeekdayDayMonth, today } from '../utils/format';
import { useFaceMark } from './faceMark';

/** The time on the card, moved on each minute. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    // Line up with the minute, then tick once a minute.
    const first = setTimeout(() => {
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, []);
  return now;
}

/** "9 h 39 min" between two times. */
function workedFor(from: string, to: string): { h: number; m: number } {
  const mins = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

/**
 * The first thing on Home (the phone launcher): the person's day. The time, face attendance for today (Mark in and Mark
 * out, each with the person's photo and, marking in, where the phone was, as the Attendance and leave screen), and the HR row: days present this month, leave left, the last
 * payslip, and the next holiday, or for those who decide leave, what waits on them. It reads the same `/staff/me` as
 * that screen, so either one keeps the other fresh.
 */
export function DayCard({ refreshKey }: { refreshKey?: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const now = useNow();
  const me = useFetch<MyStaffDto>((a) => a.get('/staff/me'), [refreshKey], { cacheKey: 'staff:me' });
  const linked = !!me.data?.employee;
  const slips = useFetch<PayslipDto[]>((a) => (linked ? a.get('/payroll/my-payslips') : Promise.resolve([])), [linked, refreshKey], { cacheKey: 'payslips:mine' });
  const decides = !!user && canMarkStaff(user.roleKey);
  const team = useFetch<StaffSummaryDto | null>((a) => (decides ? a.get('/staff/summary') : Promise.resolve(null)), [decides, refreshKey], { cacheKey: 'staff:summary' });

  const hour = now.getHours();
  const greeting = t(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const data = me.data;
  const day = data?.today ?? null;

  const face = useFaceMark(me.reload);

  const place = day?.checkInPlace;
  const pill: { text: string; fg: string; bg: string; icon: IconName } | null =
    day?.checkIn && !day.checkOut
      ? place?.inside === true
        ? { text: t('At the site'), fg: colors.success, bg: colors.successSoft, icon: 'location-outline' }
        : place?.inside === false
          ? { text: t('Outside the site'), fg: colors.warning, bg: colors.warningSoft, icon: 'warning-outline' }
          : { text: t('Marked in'), fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle-outline' }
      : !day?.checkIn && data?.todayOff
        ? { text: data.todayOff === 'Sunday' ? t('Weekly off') : data.todayOff, fg: colors.neutral, bg: colors.neutralSoft, icon: 'sunny-outline' }
        : null;

  const leaveLeft = (data?.balances ?? []).filter((b) => b.entitled !== null && b.left !== null).reduce((n, b) => n + Number(b.left), 0);
  const slip = [...(slips.data ?? [])].sort((a, b) => b.month.localeCompare(a.month))[0];
  const nextHoliday = (data?.holidays ?? []).find((h) => h.date > today());
  const toDecide = (team.data?.leaveToDecide ?? 0) + (team.data?.overtimeToDecide ?? 0);
  const days = (n: number | string) => t(Number(n) === 1 ? '{n} day' : '{n} days', { n });
  const done = day?.checkIn && day.checkOut ? workedFor(day.checkIn, day.checkOut) : null;

  return (
    <View style={styles.card} accessibilityLabel={t('My day')}>
      <View style={styles.pad}>
        <View style={styles.head}>
          <Text style={styles.hello} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={maxFontScale}>
            {t('{greeting}, {name}', { greeting, name: firstName })}
          </Text>
          <Text style={styles.date} maxFontSizeMultiplier={maxFontScale}>
            {formatWeekdayDayMonth(today())}
          </Text>
        </View>
        <View style={styles.clockRow}>
          <Text style={styles.clock} accessibilityLabel={t('The time is {time}', { time: formatTime(now) })} maxFontSizeMultiplier={1.3}>
            {formatTime(now)}
          </Text>
          {pill ? (
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              <Ionicons name={pill.icon} size={14} color={pill.fg} />
              <Text style={[styles.pillText, { color: pill.fg }]} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
                {pill.text}
              </Text>
            </View>
          ) : null}
        </View>

        {me.loading && !data ? (
          <Skeleton variant="card" rows={1} label={t('Loading…')} />
        ) : !data ? null : !linked ? (
          <Text style={styles.note} maxFontSizeMultiplier={maxFontScale}>
            {t('Your login is not linked to a staff record. Ask HR to link it, then you can mark in here.')}
          </Text>
        ) : (
          <>
            <View style={styles.faceHead}>
              <Ionicons name="scan-outline" size={18} color={colors.primary} />
              <Text style={styles.faceTitle} accessibilityRole="header" maxFontSizeMultiplier={maxFontScale}>
                {t('Face attendance')}
              </Text>
            </View>
            <View style={styles.io}>
              <View style={styles.box}>
                <Text style={styles.boxLabel} maxFontSizeMultiplier={maxFontScale}>
                  {t('Mark in')}
                </Text>
                <Text style={[styles.boxValue, !day?.checkIn && styles.boxNone]} maxFontSizeMultiplier={maxFontScale}>
                  {day?.checkIn ? formatTime(day.checkIn) : t('Not yet')}
                </Text>
              </View>
              <View style={styles.box}>
                <Text style={styles.boxLabel} maxFontSizeMultiplier={maxFontScale}>
                  {t('Mark out')}
                </Text>
                <Text style={[styles.boxValue, !day?.checkOut && styles.boxNone]} maxFontSizeMultiplier={maxFontScale}>
                  {day?.checkOut ? formatTime(day.checkOut) : day?.checkIn ? t('Not yet') : '—'}
                </Text>
              </View>
            </View>
            {!day?.checkIn ? (
              <Button title={t('Mark in')} icon="scan-outline" accessibilityHint={t('Opens the front camera for your photo')} loading={face.busy} onPress={() => face.markIn(!!data.site)} style={styles.action} />
            ) : !day.checkOut ? (
              <Button title={t('Mark out')} icon="scan-outline" accessibilityHint={t('Opens the front camera for your photo')} loading={face.busy} onPress={face.markOut} style={styles.action} />
            ) : done ? (
              <View style={styles.done} accessibilityRole="text">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.doneText} maxFontSizeMultiplier={maxFontScale}>
                  {t('Day recorded, {h} h {m} min', { h: done.h, m: done.m })}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      {linked && data ? (
        <View style={styles.hr}>
          <HrTile first icon="calendar-outline" label={t('Attendance')} value={data.monthPresent != null ? days(data.monthPresent) : '—'} onPress={() => router.push('/staff')} />
          <HrTile icon="airplane-outline" label={t('Leave')} value={t('{days} left', { days: days(leaveLeft) })} onPress={() => router.push('/staff')} />
          <HrTile icon="wallet-outline" label={t('Payslips')} value={slip ? formatMonth(slip.month) : t('None yet')} onPress={() => router.push('/payslips')} />
          {decides ? (
            <HrTile icon="people-outline" label={t('My team')} value={toDecide ? t('{n} to decide', { n: toDecide }) : t('All decided')} urgent={toDecide > 0} onPress={() => router.push('/staff')} />
          ) : (
            <HrTile icon="sunny-outline" label={t('Holidays')} value={nextHoliday ? t('Next {date}', { date: formatDayMonth(nextHoliday.date) }) : t('None listed')} onPress={() => router.push('/staff')} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function HrTile({ icon, label, value, urgent, first, onPress }: { icon: IconName; label: string; value: string; urgent?: boolean; first?: boolean; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} style={[styles.hrTile, first && styles.hrFirst]}>
      <Ionicons name={icon} size={20} color={familyTint.people.fg} />
      <Text style={styles.hrLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <Text style={[styles.hrValue, urgent && styles.hrUrgent]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  pad: { padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  hello: { flex: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  date: { fontSize: fontSize.secondary, color: colors.textMuted },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  clock: { fontFamily: fonts.display, fontSize: 36, color: colors.text, fontVariant: ['tabular-nums'] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill, flexShrink: 1 },
  pillText: { fontSize: fontSize.small, fontWeight: '600' },
  note: { fontSize: fontSize.secondary, color: colors.textMuted },
  faceHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  faceTitle: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.text },
  io: { flexDirection: 'row', gap: spacing.sm },
  box: { flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: spacing.md },
  boxLabel: { fontSize: fontSize.secondary, color: colors.textMuted },
  boxValue: { fontFamily: fonts.display, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  boxNone: { fontFamily: undefined, fontSize: fontSize.body, color: colors.textMuted, paddingTop: 2 },
  action: { marginTop: spacing.md },
  done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 48, marginTop: spacing.md, borderRadius: 12, backgroundColor: colors.successSoft },
  doneText: { fontSize: fontSize.body, fontWeight: '600', color: colors.success },
  hr: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hrTile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 78, paddingVertical: spacing.sm, paddingHorizontal: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  hrFirst: { borderLeftWidth: 0 },
  hrLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text },
  hrValue: { fontSize: fontSize.small, color: colors.textMuted },
  hrUrgent: { color: colors.warning, fontWeight: '700' },
});
