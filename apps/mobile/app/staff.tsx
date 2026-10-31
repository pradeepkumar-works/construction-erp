import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  OVERTIME_STATUS_LABELS,
  STAFF_ATTENDANCE_LABELS,
  canMarkStaff,
  leaveDays,
  type LeaveRequestDto,
  type LeaveStatus,
  type LeaveType,
  type MyStaffDto,
  type OvertimeStatus,
  type Paginated,
  type StaffAttendanceDto,
} from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { useT } from '../src/i18n/LanguageContext';
import type { TranslateVars } from '../src/i18n/translate';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, ErrorState, Input, Loading, Pill, ReasonSheet, Screen, SectionTitle, useSnackbar } from '../src/components';
import { DraftNotice, useFormDraft, useLeaveGuard } from '../src/forms/draft';
import { ErrorSummary, useErrorSummary } from '../src/forms/errors';
import { colors, fontSize, spacing, toneIcon, typography, type Tone } from '../src/theme';
import { formatDate, formatTime, isIsoDate, today } from '../src/utils/format';
import { metres } from '../src/utils/location';
import { useFaceMark } from '../src/home/faceMark';

const STATUS_TONE: Record<LeaveStatus, Tone> = {
  PENDING: { fg: colors.warning, bg: colors.warningSoft, icon: toneIcon.waiting },
  APPROVED: { fg: colors.success, bg: colors.successSoft, icon: toneIcon.done },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.failed },
  CANCELLED: { fg: colors.neutral, bg: colors.neutralSoft, icon: 'remove-circle-outline' },
};

const OVERTIME_TONE: Record<OvertimeStatus, Tone> = {
  PENDING: { fg: colors.warning, bg: colors.warningSoft, icon: toneIcon.waiting },
  APPROVED: { fg: colors.success, bg: colors.successSoft, icon: toneIcon.done },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.failed },
};

const clock = (iso: string | null) => (iso ? formatTime(iso) : '-');
type T = (en: string, vars?: TranslateVars) => string;
const span = (l: Pick<LeaveRequestDto, 'fromDate' | 'toDate' | 'halfDay'>, t: T) =>
  l.fromDate === l.toDate ? (l.halfDay ? t('{date} (half day)', { date: formatDate(l.fromDate) }) : formatDate(l.fromDate)) : t('{from} to {to}', { from: formatDate(l.fromDate), to: formatDate(l.toDate) });
const days = (n: string | number, t: T) => t(Number(n) === 1 ? '{n} day' : '{n} days', { n });

function LeaveRow({ l, mine, busy, onCancel, onApprove, onReject }: { l: LeaveRequestDto; mine?: boolean; busy: boolean; onCancel?: () => void; onApprove?: () => void; onReject?: () => void }) {
  const t = useT();
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={typography.bodyStrong}>{mine ? t(LEAVE_TYPE_LABELS[l.type]) : l.employeeName}</Text>
        <Pill text={t(LEAVE_STATUS_LABELS[l.status])} {...STATUS_TONE[l.status]} />
      </View>
      <Text style={typography.caption}>
        {mine ? '' : `${t(LEAVE_TYPE_LABELS[l.type])} · `}
        {span(l, t)} · {days(l.days, t)}
      </Text>
      <Text style={typography.caption}>{l.reason}</Text>
      {l.decidedByName ? (
        <Text style={typography.caption}>
          {t('{status} by {name}', { status: t(LEAVE_STATUS_LABELS[l.status]), name: l.decidedByName })}
          {l.decisionNote ? `: ${l.decisionNote}` : ''}
        </Text>
      ) : null}
      {(l.canDecide && onApprove) || (l.canCancel && onCancel) ? (
        <View style={styles.actions}>
          {l.canDecide && onReject ? <Button title={t('Reject')} size="sm" variant="secondary" disabled={busy} onPress={onReject} /> : null}
          {l.canDecide && onApprove ? <Button title={t('Approve')} size="sm" disabled={busy} onPress={onApprove} /> : null}
          {l.canCancel && onCancel ? <Button title={t('Cancel leave')} size="sm" variant="secondary" disabled={busy} onPress={onCancel} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Where a check-in was (v5 item 97): at the site, outside it, or a position with no site location to measure from. */
function PlacePill({ place }: { place: StaffAttendanceDto['checkInPlace'] }) {
  const t = useT();
  if (!place) return null;
  if (place.inside === null) return <Pill text={t('Location recorded')} fg={colors.neutral} bg={colors.neutralSoft} icon="location-outline" />;
  const far = place.distanceM !== null ? metres(place.distanceM) : null;
  return place.inside ? (
    <Pill text={far ? t('At the site ({distance})', { distance: far }) : t('At the site')} fg={colors.success} bg={colors.successSoft} icon="location-outline" />
  ) : (
    <Pill text={far ? t('Outside the site, {distance} away', { distance: far }) : t('Outside the site')} fg={colors.warning} bg={colors.warningSoft} icon="warning-outline" />
  );
}

/** A day's overtime waiting on the site manager or HR (v5 item 97). */
function OvertimeRow({ a, busy, onApprove, onReject }: { a: StaffAttendanceDto; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const t = useT();
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={typography.bodyStrong}>{a.employeeName}</Text>
        <Text style={typography.bodyStrong}>{t('{h} h', { h: a.overtimeHours ?? '0' })}</Text>
      </View>
      <Text style={typography.caption}>
        {formatDate(a.date)} · {a.checkIn ? t('In {in} · Out {out}', { in: clock(a.checkIn), out: clock(a.checkOut) }) : t('In the register')}
      </Text>
      {a.projectName ? <Text style={typography.caption}>{a.projectName}</Text> : null}
      <View style={styles.pills}>
        <PlacePill place={a.checkInPlace} />
      </View>
      {a.canDecideOvertime ? (
        <View style={styles.actions}>
          <Button title={t('Reject')} size="sm" variant="secondary" disabled={busy} onPress={onReject} />
          <Button title={t('Approve')} size="sm" disabled={busy} onPress={onApprove} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The signed-in person's staff record: face attendance for today (Mark in and Mark out with their photo), leave left for the year, apply for leave and see
 * their requests. Site managers and HR also approve the leave waiting on them here.
 */
export default function StaffScreen() {
  const router = useRouter();
  const api = useApi();
  const t = useT();
  const { user } = useAuth();
  const me = useFetch<MyStaffDto>((a) => a.get('/staff/me'), [], { cacheKey: 'staff:me' });
  const toDecide = useFetch<Paginated<LeaveRequestDto>>((a) => a.get('/staff/leave', { toDecide: 'true', pageSize: 50, sortBy: 'fromDate', sortOrder: 'asc' }), []);
  const overtime = useFetch<StaffAttendanceDto[]>((a) => a.get('/staff/overtime'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [type, setType] = useState<LeaveType | null>('CASUAL');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<{ kind: 'leave'; l: LeaveRequestDto } | { kind: 'overtime'; a: StaffAttendanceDto } | null>(null);
  const snackbar = useSnackbar();
  const errorSummary = useErrorSummary();
  const draft = useFormDraft('leave', { applying, type, from, to, halfDay, reason }, (d) => {
    setApplying(d.applying);
    setType(d.type);
    setFrom(d.from);
    setTo(d.to);
    setHalfDay(d.halfDay);
    setReason(d.reason);
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });
  const startOver = () => {
    setApplying(false);
    setType('CASUAL');
    setFrom(today());
    setTo(today());
    setHalfDay(false);
    setReason('');
    setFormErrors({});
  };

  const data = me.data;
  const holidays = useMemo(() => new Set((data?.holidays ?? []).map((h) => h.date)), [data]);
  const taking = isIsoDate(from) && isIsoDate(to) && from <= to ? leaveDays(from, to, halfDay && from === to, holidays) : null;
  const balance = data?.balances.find((b) => b.type === type);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([me.reload(), toDecide.reload(), overtime.reload()]);
      snackbar.show(done);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    const e: Record<string, string> = {};
    if (!type) e.type = t('Choose the leave');
    if (!isIsoDate(from)) e.from = t('Pick the date from the calendar');
    if (!isIsoDate(to)) e.to = t('Pick the date from the calendar');
    else if (isIsoDate(from) && to < from) e.to = t('The leave cannot end before it starts');
    if (!reason.trim()) e.reason = t('Enter a reason');
    setFormErrors(e);
    errorSummary.report(e);
    if (Object.keys(e).length) return;
    const ok = await run(() => api.post('/staff/leave', { type, fromDate: from, toDate: to, halfDay: halfDay && from === to, reason: reason.trim() }), t('Leave applied. Your site manager and HR have been told.'));
    if (ok) {
      draft.clear();
      setApplying(false);
      setReason('');
      setHalfDay(false);
    }
  };

  // The reason is the approver's own words: the person reads it on their request.
  const sendReject = async (note: string) => {
    if (!rejecting) return;
    const r = rejecting;
    setError(null);
    if (r.kind === 'leave') await api.post(`/staff/leave/${r.l.id}/reject`, { note });
    else await api.post(`/staff/attendance/${r.a.id}/overtime/reject`, { note });
    await Promise.all([me.reload(), toDecide.reload(), overtime.reload()]);
    snackbar.show(r.kind === 'leave' ? t('Leave rejected for {name}', { name: r.l.employeeName }) : t('Overtime rejected for {name}', { name: r.a.employeeName }), { tone: 'info' });
  };

  const face = useFaceMark(me.reload);

  if (me.loading && !data) return <Loading />;
  if (me.error && !data) return <ErrorState message={me.error} onRetry={me.reload} />;
  if (!data) return null;

  const day = data.today;
  const waiting = toDecide.data?.items ?? [];
  const otWaiting = overtime.data ?? [];
  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef} refreshing={me.refreshing} onRefresh={() => void Promise.all([me.refresh(), toDecide.refresh(), overtime.refresh()])}>
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={formErrors} />
      <ErrorBanner message={error} />
      {!data.employee ? (
        <Card>
          <Text style={typography.body}>{t('Your login is not linked to a staff record. Ask HR to link it, then you can mark in and apply for leave here.')}</Text>
        </Card>
      ) : (
        <>
          <Card title={t('Today, {date}', { date: formatDate(today()) })}>
            {data.todayOff && !day ? (
              <Text style={typography.caption}>
                {data.todayOff === 'Sunday' ? t('Weekly off.') : t('Holiday: {name}.', { name: data.todayOff })} {t('Working today earns a comp-off.')}
              </Text>
            ) : null}
            {day ? (
              <>
                <Text style={typography.bodyStrong}>
                  {t(STAFF_ATTENDANCE_LABELS[day.status])}
                  {day.projectName ? ` ${t('at {project}', { project: day.projectName })}` : ''}
                </Text>
                <Text style={typography.caption}>
                  {t('In {in} · Out {out}', { in: clock(day.checkIn), out: clock(day.checkOut) })}
                  {day.overtimeHours && Number(day.overtimeHours) > 0 ? ` · ${t('Overtime {h} h', { h: day.overtimeHours })}` : ''}
                </Text>
                <View style={styles.pills}>
                  <PlacePill place={day.checkInPlace} />
                  {day.overtimeStatus && day.overtimeHours && Number(day.overtimeHours) > 0 ? (
                    <Pill text={t('Overtime: {status}', { status: t(OVERTIME_STATUS_LABELS[day.overtimeStatus]).toLowerCase() })} {...OVERTIME_TONE[day.overtimeStatus]} />
                  ) : null}
                </View>
                {day.overtimeStatus === 'PENDING' ? <Text style={typography.caption}>{t('Overtime is paid once your manager approves it.')}</Text> : null}
              </>
            ) : (
              <Text style={typography.caption}>{t('Not marked in yet.')}</Text>
            )}
            {!day?.checkIn && data.site ? (
              <Text style={typography.caption}>
                {t(data.site.strict ? 'Mark in records your location: you must be within {distance} of {site}.' : 'Mark in records your location: it is flagged if you are more than {distance} from {site}.', {
                  distance: metres(data.site.radiusM),
                  site: data.site.projectName,
                })}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {!day?.checkIn ? (
                <Button title={t('Mark in')} icon="scan-outline" accessibilityHint={t('Opens the front camera for your photo')} loading={face.busy} onPress={() => face.markIn(!!data.site)} />
              ) : !day.checkOut ? (
                <Button title={t('Mark out')} icon="scan-outline" variant="secondary" accessibilityHint={t('Opens the front camera for your photo')} loading={face.busy} onPress={face.markOut} />
              ) : null}
            </View>
          </Card>

          <Card title={t('Leave left in {year}', { year: data.year })}>
            <View style={styles.balances}>
              {data.balances
                .filter((b) => b.entitled !== null)
                .map((b) => (
                  <View key={b.type} style={styles.balance}>
                    <Text style={typography.h2}>
                      {b.left}
                      <Text style={typography.caption}> / {b.entitled}</Text>
                    </Text>
                    <Text style={typography.caption}>{t(LEAVE_TYPE_LABELS[b.type])}</Text>
                    {b.pending ? <Text style={typography.caption}>{t('{n} waiting', { n: b.pending })}</Text> : null}
                  </View>
                ))}
            </View>
            {!applying ? <Button title={t('Apply for leave')} icon="calendar-outline" onPress={() => setApplying(true)} /> : null}
          </Card>

          {applying ? (
            <Card title={t('Apply for leave')}>
              <Chips label={t('Leave')} required value={type} clearable={false} onChange={setType} options={LEAVE_TYPES.map((x) => ({ value: x, label: t(LEAVE_TYPE_LABELS[x]) }))} />
              {formErrors.type ? <Text style={styles.err}>{formErrors.type}</Text> : null}
              <DatePicker
                label={t('From')}
                required
                value={from}
                error={formErrors.from}
                onChange={(v) => {
                  setFrom(v);
                  if (isIsoDate(v) && (!isIsoDate(to) || to < v)) setTo(v);
                }}
              />
              <DatePicker label={t('To')} required value={to} error={formErrors.to} onChange={setTo} />
              {from === to ? <Chips value={halfDay ? 'HALF' : 'FULL'} clearable={false} onChange={(v) => setHalfDay(v === 'HALF')} options={[{ value: 'FULL', label: t('Full day') }, { value: 'HALF', label: t('Half day') }]} /> : null}
              <Input label={t('Reason')} required value={reason} onChangeText={setReason} error={formErrors.reason} maxLength={500} multiline />
              {taking !== null ? (
                <Text style={[typography.caption, (taking === 0 || (balance?.left != null && balance.left < taking)) && styles.errText]}>
                  {taking === 0 ? t('Those days are Sundays or holidays.') : t('Takes {days} (Sundays and holidays not counted).', { days: days(taking, t) })}
                  {balance && balance.left !== null ? ` ${t('{days} left.', { days: days(balance.left, t) })}` : ''}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button title={t('Cancel')} variant="secondary" onPress={() => setApplying(false)} />
                <Button title={t('Apply')} loading={busy} onPress={() => void apply()} />
              </View>
            </Card>
          ) : null}
        </>
      )}

      {waiting.length ? (
        <>
          <SectionTitle title={t('Leave waiting on you')} count={waiting.length} />
          {waiting.map((l) => (
            <LeaveRow
              key={l.id}
              l={l}
              busy={busy}
              onApprove={() => void run(() => api.post(`/staff/leave/${l.id}/approve`, {}), t('Leave approved for {name}', { name: l.employeeName }))}
              onReject={() => setRejecting({ kind: 'leave', l })}
            />
          ))}
        </>
      ) : null}

      {otWaiting.length ? (
        <>
          <SectionTitle title={t('Overtime waiting on you')} count={otWaiting.length} />
          {otWaiting.map((a) => (
            <OvertimeRow
              key={a.id}
              a={a}
              busy={busy}
              onApprove={() => void run(() => api.post(`/staff/attendance/${a.id}/overtime/approve`, {}), t('Overtime approved for {name}', { name: a.employeeName }))}
              onReject={() => setRejecting({ kind: 'overtime', a })}
            />
          ))}
        </>
      ) : null}

      {data.employee ? (
        <>
          <SectionTitle title={t('My leave')} />
          {data.leave.length ? (
            data.leave.map((l) => (
              <LeaveRow
                key={l.id}
                l={l}
                mine
                busy={busy}
                onCancel={() =>
                  Alert.alert(t('Cancel leave'), t('Cancel {type} on {span}?', { type: t(LEAVE_TYPE_LABELS[l.type]).toLowerCase(), span: span(l, t) }), [
                    { text: t('Keep'), style: 'cancel' },
                    { text: t('Cancel leave'), style: 'destructive', onPress: () => void run(() => api.post(`/staff/leave/${l.id}/cancel`), t('Leave cancelled')) },
                  ])
                }
              />
            ))
          ) : (
            <EmptyState title={t('No leave yet')} icon="calendar-outline" />
          )}
        </>
      ) : null}

      {data.holidays.length ? (
        <Card title={t('Coming holidays')}>
          {data.holidays.map((h) => (
            <View key={h.id} style={styles.holiday}>
              <Text style={typography.body}>{h.name}</Text>
              <Text style={typography.caption}>{formatDate(h.date)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <ReasonSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={rejecting?.kind === 'overtime' ? 'Reject overtime' : 'Reject leave'}
        subtitle={
          rejecting?.kind === 'leave'
            ? `${rejecting.l.employeeName} · ${span(rejecting.l, t)}`
            : rejecting?.kind === 'overtime'
              ? `${rejecting.a.employeeName} · ${t('{h} h', { h: rejecting.a.overtimeHours ?? '0' })} · ${formatDate(rejecting.a.date)}`
              : undefined
        }
        field="Reason for rejecting"
        quick={rejecting?.kind === 'overtime' ? ['Not agreed in advance', 'Hours do not match the register'] : ['Too many people away on those dates', 'Work planned on those dates needs you']}
        required
        missing={rejecting?.kind === 'overtime' ? 'Say why, so they know what counts' : 'Say why, so they can plan again'}
        confirm="Reject"
        variant="danger"
        onConfirm={sendReject}
      />

      {user && canMarkStaff(user.roleKey) ? <Button title={t('Staff register')} icon="people-outline" variant="secondary" onPress={() => router.push('/staff-register')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 2 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  balances: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  balance: { width: '50%', paddingVertical: spacing.sm },
  holiday: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  err: { color: colors.danger, fontSize: fontSize.secondary, marginTop: -4, marginBottom: spacing.sm },
  errText: { color: colors.danger },
});
