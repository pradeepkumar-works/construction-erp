import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { NcrDto } from '@erp/shared';
import { NCR_SEVERITY_LABELS, NCR_STATUS_LABELS, canActOnNcr, canRaiseNcr } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, PhotoPicker, Pill, Screen, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading } from '../../src/forms/common';
import { NCR_STATUS_TONE, SEVERITY_TONE } from '../../src/components/qualityTone';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate, formatDateTime } from '../../src/utils/format';

/** One NCR: site records the cause and corrective action with photos; QA/QC closes or reopens it. */
export default function NcrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<NcrDto>((a) => a.get(`/quality/ncrs/${id}`), [id], { enabled: !!id });
  const [cause, setCause] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [prevent, setPrevent] = useState<string | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const mayAct = !!user && data.status === 'OPEN' && canActOnNcr(user, data);
  const qa = !!user && canRaiseNcr(user.roleKey);
  const run = async (fn: () => Promise<NcrDto>) => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await fn());
      setNote('');
      setPhotos([]);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const recordAction = () => {
    const c = (cause ?? data.cause ?? '').trim();
    const a = (action ?? data.correctiveAction ?? '').trim();
    if (!c || !a) return setActionError('Say why it happened and what was done');
    if (photosUploading(photos) || photosQueued(photos)) return setActionError('Wait for photos to finish uploading');
    if (photosFailed(photos)) return setActionError('Remove or retry failed photos');
    void run(() => api.post<NcrDto>(`/quality/ncrs/${data.id}/action`, { cause: c, correctiveAction: a, preventiveAction: (prevent ?? data.preventiveAction ?? '').trim() || null, attachmentIds: attachmentIds(photos) }));
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text style={typography.caption}>
          {data.ncrNo} · {data.projectName}
        </Text>
        <Text style={typography.h2}>{data.title}</Text>
        <View style={styles.pills}>
          <Pill text={NCR_STATUS_LABELS[data.status]} {...NCR_STATUS_TONE[data.status]} />
          <Pill text={NCR_SEVERITY_LABELS[data.severity]} {...SEVERITY_TONE[data.severity]} />
          {data.overdue ? <Pill text="Overdue" fg={colors.danger} bg={colors.dangerSoft} /> : null}
        </View>
      </View>
      <ErrorBanner message={actionError} />
      <Card>
        <KeyValue label="Details" value={data.description} multiline />
        <KeyValue label="Location" value={data.location} />
        <KeyValue label="Activity" value={data.activityName} />
        <KeyValue label="Found by" value={[data.testNo, data.inspectionNo].filter(Boolean).join(', ')} />
        <KeyValue label="Raised" value={`${formatDate(data.raisedOn)} by ${data.raisedByName}`} />
        <KeyValue label="To rectify" value={data.actionByName} />
        <KeyValue label="Rectify by" value={data.dueDate ? formatDate(data.dueDate) : null} />
      </Card>
      {mayAct ? (
        <Card title="Cause and corrective action">
          <Input label="Cause" required value={cause ?? data.cause ?? ''} onChangeText={setCause} placeholder="Why it happened" multiline />
          <Input label="Corrective action" required value={action ?? data.correctiveAction ?? ''} onChangeText={setAction} placeholder="What was done to put it right" multiline />
          <Input label="Preventive action" value={prevent ?? data.preventiveAction ?? ''} onChangeText={setPrevent} placeholder="What will stop it happening again" multiline />
          <PhotoPicker photos={photos} onChange={setPhotos} />
          <Button title="Record action" icon="checkmark-done" onPress={recordAction} loading={busy} style={styles.mt} />
        </Card>
      ) : data.correctiveAction ? (
        <Card title="Cause and corrective action">
          <KeyValue label="Cause" value={data.cause} multiline />
          <KeyValue label="Corrective action" value={data.correctiveAction} multiline />
          <KeyValue label="Preventive action" value={data.preventiveAction} multiline />
          <KeyValue label="Recorded" value={formatDateTime(data.actionAt)} />
          {data.status === 'CLOSED' ? <KeyValue label="Closed" value={`${formatDateTime(data.closedAt)} by ${data.closedByName}${data.closureNote ? `: ${data.closureNote}` : ''}`} multiline /> : null}
        </Card>
      ) : null}
      {qa && data.status !== 'OPEN' ? (
        <Card title={data.status === 'ACTION_TAKEN' ? 'Verify' : 'Reopen'}>
          <Input value={note} onChangeText={setNote} placeholder={data.status === 'ACTION_TAKEN' ? 'How it was verified, or what is still not right' : 'What is not right'} multiline />
          <View style={styles.row}>
            {data.status === 'ACTION_TAKEN' ? (
              <Button title="Close NCR" variant="success" icon="checkmark" onPress={() => run(() => api.post<NcrDto>(`/quality/ncrs/${data.id}/close`, { note: note.trim() || undefined }))} loading={busy} style={styles.flex} />
            ) : null}
            <Button
              title="Reopen"
              variant="secondary"
              icon="refresh"
              onPress={() => (note.trim() ? run(() => api.post<NcrDto>(`/quality/ncrs/${data.id}/reopen`, { note: note.trim() })) : setActionError('Say what is still not right'))}
              disabled={busy}
              style={styles.flex}
            />
          </View>
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  mt: { marginTop: spacing.md },
});
