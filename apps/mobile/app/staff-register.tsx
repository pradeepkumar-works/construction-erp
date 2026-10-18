import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { LEAVE_TYPE_LABELS, STAFF_ATTENDANCE_LABELS, STAFF_ATTENDANCE_STATUSES, type StaffAttendanceStatus, type StaffRegisterDto, type StaffRegisterRowDto } from '@erp/shared';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { useT } from '../src/i18n/LanguageContext';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, Loading, Screen, Select } from '../src/components';
import { useProjectOptions } from '../src/forms/common';
import { colors, spacing, typography } from '../src/theme';
import { formatTime, isIsoDate, today } from '../src/utils/format';

/**
 * The staff register of one site for one day: the site in-charge marks each person present, half day or absent.
 * People who checked in themselves are already marked; leave and holidays are shown.
 */
export default function StaffRegisterScreen() {
  const api = useApi();
  const t = useT();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, StaffAttendanceStatus | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const valid = !!projectId && isIsoDate(date) && date <= today();
  const reg = useFetch<StaffRegisterDto>((a) => a.get('/staff/register', { projectId: projectId!, date }), [projectId, date], { enabled: valid, refetchOnFocus: false });
  useEffect(() => {
    setMarks(Object.fromEntries((reg.data?.rows ?? []).map((r) => [r.employee.id, r.attendance?.status ?? null])));
  }, [reg.data]);

  const changed = useMemo(() => (reg.data?.rows ?? []).filter((r) => (marks[r.employee.id] ?? null) !== (r.attendance?.status ?? null)), [reg.data, marks]);

  const restPresent = () =>
    setMarks((m) => {
      const next = { ...m };
      for (const r of reg.data?.rows ?? []) if (!next[r.employee.id] && !(r.leave?.status === 'APPROVED' && !r.leave.halfDay)) next[r.employee.id] = 'PRESENT';
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.put<StaffRegisterDto>('/staff/register', { projectId, date, entries: changed.map((r) => ({ employeeId: r.employee.id, status: marks[r.employee.id] ?? null })) });
      reg.setData(d);
      Alert.alert(t('Register saved'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const row = (r: StaffRegisterRowDto) => (
    <View key={r.employee.id} style={styles.row}>
      <Text style={typography.bodyStrong}>{r.employee.fullName}</Text>
      <Text style={typography.caption}>
        {r.employee.designation}
        {r.leave ? ` · ${t(LEAVE_TYPE_LABELS[r.leave.type])}${r.leave.halfDay ? `, ${t('half day')}` : ''}${r.leave.status === 'PENDING' ? ` (${t('waiting')})` : ''}` : ''}
        {r.attendance?.checkIn ? ` · ${t('checked in {time}', { time: formatTime(r.attendance.checkIn) })}` : ''}
      </Text>
      <Chips value={marks[r.employee.id] ?? null} onChange={(v) => setMarks((m) => ({ ...m, [r.employee.id]: v }))} options={STAFF_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: t(STAFF_ATTENDANCE_LABELS[s]) }))} />
    </View>
  );

  return (
    <Screen refreshing={reg.refreshing} onRefresh={reg.refresh}>
      <Select label={t('Project')} value={projectId} options={projects.options} onChange={setProjectId} searchable />
      <DatePicker label={t('Date')} value={date} onChange={setDate} error={isIsoDate(date) && date > today() ? t('Not a future day') : null} />
      <ErrorBanner message={error ?? reg.error} />
      {reg.data && (reg.data.holiday || reg.data.weeklyOff) ? (
        <Card>
          <Text style={typography.caption}>
            {reg.data.holiday ? t('Holiday: {name}.', { name: reg.data.holiday }) : t('Sunday, the weekly off.')} {t('Anyone marked present earns a comp-off.')}
          </Text>
        </Card>
      ) : null}
      {reg.loading && !reg.data ? <Loading /> : null}
      {reg.data && !reg.data.rows.length ? <EmptyState title={t('No staff posted at this site')} icon="people-outline" /> : null}
      {reg.data?.rows.map(row)}
      {reg.data?.rows.length ? (
        <View style={styles.actions}>
          <Button title={t('Mark the rest present')} variant="secondary" onPress={restPresent} />
          <Button title={changed.length ? t('Save ({n})', { n: changed.length }) : t('Save')} loading={busy} disabled={!changed.length} onPress={() => void save()} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
});
