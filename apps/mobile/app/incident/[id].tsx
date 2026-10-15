import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SafetyIncidentDto } from '@erp/shared';
import { SAFETY_INCIDENT_STATUS_LABELS, SAFETY_INCIDENT_TYPE_LABELS, canManageSafety } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, Pill, Screen } from '../../src/components';
import { INCIDENT_TONE } from '../../src/components/safetyTone';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate, formatDateTime } from '../../src/utils/format';

/** One incident or near miss; the safety officer or an approver closes it with the root cause and the corrective action. */
export default function IncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<SafetyIncidentDto>((a) => a.get(`/safety/incidents/${id}`), [id], { enabled: !!id });
  const [closing, setClosing] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [corrective, setCorrective] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const manager = !!user && canManageSafety(user.roleKey);
  const tone = INCIDENT_TONE[data.type];
  const act = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await api.post<SafetyIncidentDto>(`/safety/incidents/${data.id}/${path}`, body));
      setClosing(false);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const startClose = () => {
    setRootCause(data.rootCause ?? '');
    setCorrective(data.correctiveAction ?? '');
    setNote('');
    setClosing(true);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text style={typography.caption}>
          {data.incidentNo} · {data.projectName}
        </Text>
        <Text style={typography.h2}>{data.location}</Text>
        <View style={styles.pills}>
          <Pill text={SAFETY_INCIDENT_TYPE_LABELS[data.type]} {...tone} />
          <Pill text={SAFETY_INCIDENT_STATUS_LABELS[data.status]} {...(data.status === 'OPEN' ? { fg: colors.warning, bg: colors.warningSoft } : { fg: colors.neutral, bg: colors.neutralSoft })} />
        </View>
      </View>
      <ErrorBanner message={actionError} />
      <Card>
        <KeyValue label="When" value={`${formatDate(data.date)}${data.time ? `, ${data.time}` : ''}`} />
        <KeyValue label="What happened" value={data.description} multiline />
        {data.injuredCount ? <KeyValue label="People hurt" value={`${data.injuredCount}${data.injuredNames ? `: ${data.injuredNames}` : ''}`} multiline /> : null}
        {data.type === 'LOST_TIME' ? <KeyValue label="Days off work" value={data.daysLost} /> : null}
        <KeyValue label="Whose workers" value={data.contractor} />
        <KeyValue label="Immediate action" value={data.immediateAction} multiline />
        <KeyValue label="Root cause" value={data.rootCause} multiline />
        <KeyValue label="Corrective action" value={data.correctiveAction} multiline />
        <KeyValue label="Reported by" value={`${data.reportedByName}, ${formatDateTime(data.createdAt)}`} />
        {data.status === 'CLOSED' ? <KeyValue label="Closed" value={`${data.closedByName ?? ''}, ${formatDateTime(data.closedAt)}${data.closureNote ? `: ${data.closureNote}` : ''}`} multiline /> : null}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      {manager ? (
        closing ? (
          <Card title={`Close ${data.incidentNo}`}>
            <Input label="Root cause" required value={rootCause} onChangeText={setRootCause} multiline maxLength={2000} />
            <Input label="Corrective action" required value={corrective} onChangeText={setCorrective} multiline maxLength={2000} />
            <Input label="Note" value={note} onChangeText={setNote} multiline maxLength={2000} />
            <Button title="Close incident" icon="checkmark-circle" onPress={() => act('close', { rootCause: rootCause.trim(), correctiveAction: corrective.trim(), closureNote: note.trim() || null })} loading={busy} disabled={!rootCause.trim() || !corrective.trim()} />
            <Button title="Cancel" variant="ghost" onPress={() => setClosing(false)} />
          </Card>
        ) : data.status === 'CLOSED' ? (
          <Button title="Reopen" icon="refresh" variant="secondary" onPress={() => act('reopen')} loading={busy} />
        ) : (
          <Button title="Close incident" icon="checkmark-circle" onPress={startClose} />
        )
      ) : null}
      <Button title="Safety at this project" variant="ghost" icon="medkit-outline" onPress={() => router.push(`/safety?projectId=${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
