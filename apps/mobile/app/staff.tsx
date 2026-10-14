import React, { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  STAFF_ATTENDANCE_LABELS,
  canMarkStaff,
  leaveDays,
  type LeaveRequestDto,
  type LeaveStatus,
  type LeaveType,
  type MyStaffDto,
  type Paginated,
} from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, ErrorState, Input, Loading, Pill, Screen, SectionTitle } from '../src/components';
import { colors, spacing, typography } from '../src/theme';
import { formatDate, isIsoDate, today } from '../src/utils/format';

const STATUS_TONE: Record<LeaveStatus, { fg: string; bg: string }> = {
  PENDING: { fg: colors.warning, bg: colors.warningSoft },
  APPROVED: { fg: colors.success, bg: colors.successSoft },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft },
  CANCELLED: { fg: colors.neutral, bg: colors.neutralSoft },
};

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
const span = (l: Pick<LeaveRequestDto, 'fromDate' | 'toDate' | 'halfDay'>) => (l.fromDate === l.toDate ? `${formatDate(l.fromDate)}${l.halfDay ? ' (half day)' : ''}` : `${formatDate(l.fromDate)} to ${formatDate(l.toDate)}`);
const days = (n: string | number) => `${n} day${Number(n) === 1 ? '' : 's'}`;

function LeaveRow({ l, mine, busy, onCancel, onApprove, onReject }: { l: LeaveRequestDto; mine?: boolean; busy: boolean; onCancel?: () => void; onApprove?: () => void; onReject?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={typography.bodyStrong}>{mine ? LEAVE_TYPE_LABELS[l.type] : l.employeeName}</Text>
        <Pill text={LEAVE_STATUS_LABELS[l.status]} {...STATUS_TONE[l.status]} />
      </View>
      <Text style={typography.caption}>
        {mine ? '' : `${LEAVE_TYPE_LABELS[l.type]} · `}
        {span(l)} · {days(l.days)}
      </Text>
      <Text style={typography.caption}>{l.reason}</Text>
      {l.decidedByName ? (
        <Text style={typography.caption}>
          {LEAVE_STATUS_LABELS[l.status]} by {l.decidedByName}
          {l.decisionNote ? `: ${l.decisionNote}` : ''}
        </Text>
      ) : null}
      {(l.canDecide && onApprove) || (l.canCancel && onCancel) ? (
        <View style={styles.actions}>
          {l.canDecide && onReject ? <Button title="Reject" size="sm" variant="secondary" disabled={busy} onPress={onReject} /> : null}
          {l.canDecide && onApprove ? <Button title="Approve" size="sm" disabled={busy} onPress={onApprove} /> : null}
          {l.canCancel && onCancel ? <Button title="Cancel leave" size="sm" variant="secondary" disabled={busy} onPress={onCancel} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The signed-in person's staff record: check in and out for today, leave left for the year, apply for leave and see
 * their requests. Site managers and HR also approve the leave waiting on them here.
 */
export default function StaffScreen() {
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const me = useFetch<MyStaffDto>((a) => a.get('/staff/me'), [], { cacheKey: 'staff:me' });
  const toDecide = useFetch<Paginated<LeaveRequestDto>>((a) => a.get('/staff/leave', { toDecide: 'true', pageSize: 50, sortBy: 'fromDate', sortOrder: 'asc' }), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [type, setType] = useState<LeaveType | null>('CASUAL');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const data = me.data;
  const holidays = useMemo(() => new Set((data?.holidays ?? []).map((h) => h.date)), [data]);
  const taking = isIsoDate(from) && isIsoDate(to) && from <= to ? leaveDays(from, to, halfDay && from === to, holidays) : null;
  const balance = data?.balances.find((b) => b.type === type);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([me.reload(), toDecide.reload()]);
      Alert.alert(done);
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
    if (!type) e.type = 'Choose the leave';
    if (!isIsoDate(from)) e.from = 'Enter a valid date';
    if (!isIsoDate(to)) e.to = 'Enter a valid date';
    else if (isIsoDate(from) && to < from) e.to = 'The leave cannot end before it starts';
    if (!reason.trim()) e.reason = 'Enter a reason';
    setFormErrors(e);
    if (Object.keys(e).length) return;
    const ok = await run(() => api.post('/staff/leave', { type, fromDate: from, toDate: to, halfDay: halfDay && from === to, reason: reason.trim() }), 'Leave applied. Your site manager and HR have been told.');
    if (ok) {
      setApplying(false);
      setReason('');
      setHalfDay(false);
    }
  };

  const reject = (l: LeaveRequestDto) =>
    Platform.OS === 'ios'
      ? Alert.prompt('Reject leave', 'Why, so they can plan again', (note) => note?.trim() && void run(() => api.post(`/staff/leave/${l.id}/reject`, { note: note.trim() }), 'Leave rejected'))
      : Alert.alert('Reject leave', `Reject ${l.employeeName}'s leave?`, [
          { text: 'Keep', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: () => void run(() => api.post(`/staff/leave/${l.id}/reject`, { note: 'Not possible on these dates; please speak to me' }), 'Leave rejected') },
        ]);

  if (me.loading && !data) return <Loading />;
  if (me.error && !data) return <ErrorState message={me.error} onRetry={me.reload} />;
  if (!data) return null;

  const t = data.today;
  const waiting = toDecide.data?.items ?? [];
  return (
    <Screen keyboard refreshing={me.refreshing} onRefresh={() => void Promise.all([me.refresh(), toDecide.refresh()])}>
      <ErrorBanner message={error} />
      {!data.employee ? (
        <Card>
          <Text style={typography.body}>Your login is not linked to a staff record. Ask HR to link it, then you can check in and apply for leave here.</Text>
        </Card>
      ) : (
        <>
          <Card title={`Today, ${formatDate(today())}`}>
            {data.todayOff && !t ? <Text style={typography.caption}>{data.todayOff === 'Sunday' ? 'Sunday, the weekly off.' : `Holiday: ${data.todayOff}.`} Working today earns a comp-off.</Text> : null}
            {t ? (
              <>
                <Text style={typography.bodyStrong}>
                  {STAFF_ATTENDANCE_LABELS[t.status]}
                  {t.projectName ? ` at ${t.projectName}` : ''}
                </Text>
                <Text style={typography.caption}>
                  In {clock(t.checkIn)} · Out {clock(t.checkOut)}
                  {t.overtimeHours && Number(t.overtimeHours) > 0 ? ` · Overtime ${t.overtimeHours} h` : ''}
                </Text>
              </>
            ) : (
              <Text style={typography.caption}>Not checked in yet.</Text>
            )}
            <View style={styles.actions}>
              {!t?.checkIn ? (
                <Button title="Check in" icon="log-in-outline" loading={busy} onPress={() => void run(() => api.post('/staff/me/check-in', {}), 'Checked in')} />
              ) : !t.checkOut ? (
                <Button title="Check out" icon="log-out-outline" variant="secondary" loading={busy} onPress={() => void run(() => api.post('/staff/me/check-out'), 'Checked out')} />
              ) : null}
            </View>
          </Card>

          <Card title={`Leave left in ${data.year}`}>
            <View style={styles.balances}>
              {data.balances
                .filter((b) => b.entitled !== null)
                .map((b) => (
                  <View key={b.type} style={styles.balance}>
                    <Text style={typography.h2}>
                      {b.left}
                      <Text style={typography.caption}> / {b.entitled}</Text>
                    </Text>
                    <Text style={typography.caption}>{LEAVE_TYPE_LABELS[b.type]}</Text>
                    {b.pending ? <Text style={typography.caption}>{b.pending} waiting</Text> : null}
                  </View>
                ))}
            </View>
            {!applying ? <Button title="Apply for leave" icon="calendar-outline" onPress={() => setApplying(true)} /> : null}
          </Card>

          {applying ? (
            <Card title="Apply for leave">
              <Chips label="Leave" required value={type} clearable={false} onChange={setType} options={LEAVE_TYPES.map((x) => ({ value: x, label: LEAVE_TYPE_LABELS[x] }))} />
              {formErrors.type ? <Text style={styles.err}>{formErrors.type}</Text> : null}
              <DatePicker
                label="From"
                required
                value={from}
                error={formErrors.from}
                onChange={(v) => {
                  setFrom(v);
                  if (isIsoDate(v) && (!isIsoDate(to) || to < v)) setTo(v);
                }}
              />
              <DatePicker label="To" required value={to} error={formErrors.to} onChange={setTo} />
              {from === to ? <Chips value={halfDay ? 'HALF' : 'FULL'} clearable={false} onChange={(v) => setHalfDay(v === 'HALF')} options={[{ value: 'FULL', label: 'Full day' }, { value: 'HALF', label: 'Half day' }]} /> : null}
              <Input label="Reason" required value={reason} onChangeText={setReason} error={formErrors.reason} maxLength={500} multiline />
              {taking !== null ? (
                <Text style={[typography.caption, (taking === 0 || (balance?.left != null && balance.left < taking)) && styles.errText]}>
                  {taking === 0 ? 'Those days are Sundays or holidays.' : `Takes ${days(taking)} (Sundays and holidays not counted).`}
                  {balance && balance.left !== null ? ` ${days(balance.left)} left.` : ''}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" onPress={() => setApplying(false)} />
                <Button title="Apply" loading={busy} onPress={() => void apply()} />
              </View>
            </Card>
          ) : null}
        </>
      )}

      {waiting.length ? (
        <>
          <SectionTitle title={`Leave waiting on you (${waiting.length})`} />
          {waiting.map((l) => (
            <LeaveRow
              key={l.id}
              l={l}
              busy={busy}
              onApprove={() => void run(() => api.post(`/staff/leave/${l.id}/approve`, {}), `Leave approved for ${l.employeeName}`)}
              onReject={() => reject(l)}
            />
          ))}
        </>
      ) : null}

      {data.employee ? (
        <>
          <SectionTitle title="My leave" />
          {data.leave.length ? (
            data.leave.map((l) => (
              <LeaveRow
                key={l.id}
                l={l}
                mine
                busy={busy}
                onCancel={() =>
                  Alert.alert('Cancel leave', `Cancel ${LEAVE_TYPE_LABELS[l.type].toLowerCase()} on ${span(l)}?`, [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Cancel leave', style: 'destructive', onPress: () => void run(() => api.post(`/staff/leave/${l.id}/cancel`), 'Leave cancelled') },
                  ])
                }
              />
            ))
          ) : (
            <EmptyState title="No leave yet" icon="calendar-outline" />
          )}
        </>
      ) : null}

      {data.holidays.length ? (
        <Card title="Coming holidays">
          {data.holidays.map((h) => (
            <View key={h.id} style={styles.holiday}>
              <Text style={typography.body}>{h.name}</Text>
              <Text style={typography.caption}>{formatDate(h.date)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {user && canMarkStaff(user.roleKey) ? <Button title="Staff register" icon="people-outline" variant="secondary" onPress={() => router.push('/staff-register')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 2 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  balances: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  balance: { width: '50%', paddingVertical: spacing.sm },
  holiday: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  err: { color: colors.danger, fontSize: 13, marginTop: -4, marginBottom: spacing.sm },
  errText: { color: colors.danger },
});
