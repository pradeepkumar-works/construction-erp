import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WorkPermitDto } from '@erp/shared';
import { PERMIT_PRECAUTIONS, WORK_PERMIT_TYPE_LABELS, canEditSafetyRecord, canManageSafety } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, Pill, Screen } from '../../src/components';
import { Checklist, permitStatus, permitWindow } from '../../src/components/safetyTone';
import { colors, spacing, typography } from '../../src/theme';
import { formatDateTime } from '../../src/utils/format';

type Mode = 'issue' | 'reject' | 'close' | null;

/** One permit to work: the safety officer or an approver issues or rejects it; whoever asked for it closes it when the work is done. */
export default function PermitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<WorkPermitDto>((a) => a.get(`/safety/permits/${id}`), [id], { enabled: !!id });
  const [mode, setMode] = useState<Mode>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const manager = !!user && canManageSafety(user.roleKey);
  const mayClose = !!user && canEditSafetyRecord(user, data.requestedById);
  const st = permitStatus(data);
  const standard = PERMIT_PRECAUTIONS[data.type];
  const open = (m: Mode) => {
    setTicked(data.precautions.filter((p) => standard.includes(p)));
    setNote('');
    setMode(m);
  };
  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await api.post<WorkPermitDto>(`/safety/permits/${data.id}/${path}`, body));
      setMode(null);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text style={typography.caption}>
          {data.permitNo} · {data.projectName}
        </Text>
        <Text style={typography.h2}>
          {WORK_PERMIT_TYPE_LABELS[data.type]} · {data.location}
        </Text>
        <View style={styles.pills}>
          <Pill text={st.text} fg={st.fg} bg={st.bg} />
        </View>
      </View>
      <ErrorBanner message={actionError} />
      <Card>
        <KeyValue label="The work" value={data.description} multiline />
        <KeyValue label="Valid" value={permitWindow(data)} multiline />
        <KeyValue label="Contractor" value={data.contractor} />
        <KeyValue label="Workers" value={data.workerCount ? `${data.workerCount}${data.workers ? `: ${data.workers}` : ''}` : data.workers} multiline />
        <KeyValue label="Asked by" value={`${data.requestedByName}, ${formatDateTime(data.createdAt)}`} />
        {data.issuedByName ? <KeyValue label={data.status === 'REJECTED' ? 'Rejected' : 'Issued'} value={`${data.issuedByName}, ${formatDateTime(data.issuedAt)}${data.issueNote ? `: ${data.issueNote}` : ''}`} multiline /> : null}
        {data.closedByName ? <KeyValue label="Closed" value={`${data.closedByName}, ${formatDateTime(data.closedAt)}${data.closeNote ? `: ${data.closeNote}` : ''}`} multiline /> : null}
      </Card>
      <Card title="Precautions">
        {data.precautions.length ? (
          data.precautions.map((p) => (
            <Text key={p} style={[typography.body, styles.precaution]}>
              ✓ {p}
            </Text>
          ))
        ) : (
          <Text style={typography.caption}>None ticked</Text>
        )}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      {mode === 'issue' ? (
        <Card title={`Issue ${data.permitNo}`}>
          <Checklist label="Checked at the spot" items={standard} value={ticked} onChange={setTicked} />
          <Input label="Conditions" value={note} onChangeText={setNote} multiline maxLength={1000} />
          <Button title="Issue permit" icon="checkmark-circle" onPress={() => act('issue', { note: note.trim() || null, precautions: [...ticked, ...data.precautions.filter((p) => !standard.includes(p))] })} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => setMode(null)} />
        </Card>
      ) : mode === 'reject' ? (
        <Card title={`Reject ${data.permitNo}`}>
          <Input label="Why" required value={note} onChangeText={setNote} multiline maxLength={1000} />
          <Button title="Reject" icon="close-circle" variant="danger" onPress={() => act('reject', { note: note.trim() })} loading={busy} disabled={!note.trim()} />
          <Button title="Cancel" variant="ghost" onPress={() => setMode(null)} />
        </Card>
      ) : mode === 'close' ? (
        <Card title={`Close ${data.permitNo}`}>
          <Input label="Note" value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Work done, area made safe" />
          <Button title="Close permit" icon="lock-closed" onPress={() => act('close', { note: note.trim() || null })} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => setMode(null)} />
        </Card>
      ) : data.status === 'REQUESTED' && manager ? (
        <View style={styles.actions}>
          <Button title="Issue" icon="checkmark-circle" onPress={() => open('issue')} style={styles.flex} />
          <Button title="Reject" icon="close-circle" variant="secondary" onPress={() => open('reject')} style={styles.flex} />
        </View>
      ) : data.status === 'ISSUED' && mayClose ? (
        <Button title="Close permit" icon="lock-closed" onPress={() => open('close')} />
      ) : null}
      <Button title="Safety at this project" variant="ghost" icon="medkit-outline" onPress={() => router.push(`/safety?projectId=${data.projectId}&show=permits`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  precaution: { paddingVertical: 4, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  flex: { flex: 1 },
});
