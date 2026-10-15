import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DefectDto } from '@erp/shared';
import { DEFECT_PHASE_LABELS, DEFECT_PRIORITY_LABELS, DEFECT_STATUS_LABELS, canCloseDefect, canReportDefect } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, PhotoPicker, Pill, Screen, type LocalPhoto } from '../../src/components';
import { DEFECT_STATUS_TONE, DEFECT_TONE } from '../../src/components/defectTone';
import { attachmentIds, photosFailed, photosQueued, photosUploading } from '../../src/forms/common';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate, formatDateTime, today } from '../../src/utils/format';

type Step = 'fix' | 'close' | 'reopen' | null;

/** One snag or defect: whoever works on the project marks it fixed with photos after; QA/QC accepts it or reopens it. */
export default function SnagScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<DefectDto>((a) => a.get(`/defects/${id}`), [id], { enabled: !!id });
  const [step, setStep] = useState<Step>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const reporter = !!user && canReportDefect(user.roleKey);
  const closer = !!user && canCloseDefect(user.roleKey);
  const begin = (s: Step) => {
    setNote('');
    setPhotos([]);
    setActionError(null);
    setStep(s);
  };
  const act = async () => {
    if (!step) return;
    if (photosUploading(photos)) return setActionError('Wait for photos to finish uploading');
    if (photosFailed(photos) || photosQueued(photos)) return setActionError('Photos need a connection; remove them or try again');
    if (step === 'close' && data.status === 'OPEN' && !note.trim()) return setActionError('Say why it is closed without being fixed');
    setBusy(true);
    setActionError(null);
    try {
      const body = step === 'fix' ? { fixedOn: today(), fixNote: note.trim() || undefined, attachmentIds: attachmentIds(photos) } : { note: note.trim() || undefined };
      setData(await api.post<DefectDto>(`/defects/${data.id}/${step}`, body));
      setStep(null);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const TITLE: Record<Exclude<Step, null>, string> = { fix: 'Mark fixed', close: data.status === 'FIXED' ? 'Accept and close' : 'Close', reopen: 'Reopen' };
  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text style={typography.caption}>
          {data.defectNo} · {data.projectName}
        </Text>
        <Text style={typography.h2}>{data.title}</Text>
        <View style={styles.pills}>
          <Pill text={DEFECT_PHASE_LABELS[data.phase]} fg={colors.neutral} bg={colors.neutralSoft} />
          <Pill text={`${DEFECT_PRIORITY_LABELS[data.priority]} priority`} {...DEFECT_TONE[data.priority]} />
          <Pill text={DEFECT_STATUS_LABELS[data.status]} {...DEFECT_STATUS_TONE[data.status]} />
          {data.overdue ? <Pill text="Overdue" fg={colors.danger} bg={colors.dangerSoft} /> : null}
        </View>
      </View>
      <ErrorBanner message={actionError} />
      <Card>
        <KeyValue label="Where" value={data.location} />
        <KeyValue label="Trade" value={data.trade} />
        <KeyValue label="Details" value={data.description} multiline />
        <KeyValue label="Found" value={`${formatDate(data.reportedOn)}${data.foundBy ? ` by ${data.foundBy}` : ''}, logged by ${data.reportedByName}`} multiline />
        <KeyValue label="Assigned to" value={data.assignedToName} />
        <KeyValue label="Subcontractor" value={data.contractor} />
        <KeyValue label="Put right by" value={data.dueDate ? formatDate(data.dueDate) : null} />
        {data.fixedOn ? <KeyValue label="Fixed" value={`${formatDate(data.fixedOn)}${data.fixedByName ? ` by ${data.fixedByName}` : ''}${data.fixNote ? `: ${data.fixNote}` : ''}`} multiline /> : null}
        {data.closedAt ? <KeyValue label="Closed" value={`${data.closedByName ?? ''}, ${formatDateTime(data.closedAt)}${data.closeNote ? `: ${data.closeNote}` : ''}`} multiline /> : null}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      {step ? (
        <Card title={TITLE[step]}>
          <Input label={step === 'fix' ? 'What was done' : step === 'reopen' ? 'Why it is not right yet' : 'Note'} value={note} onChangeText={setNote} multiline maxLength={1000} />
          {step === 'fix' ? <PhotoPicker photos={photos} onChange={setPhotos} /> : null}
          <Button title={TITLE[step]} icon="checkmark-circle" onPress={act} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => setStep(null)} />
        </Card>
      ) : (
        <>
          {data.status === 'OPEN' && reporter ? <Button title="Mark fixed" icon="checkmark-circle" onPress={() => begin('fix')} /> : null}
          {data.status !== 'CLOSED' && closer ? <Button title={TITLE.close} icon="shield-checkmark" variant={data.status === 'FIXED' ? 'primary' : 'secondary'} onPress={() => begin('close')} /> : null}
          {data.status !== 'OPEN' && closer ? <Button title="Reopen" icon="refresh" variant="secondary" onPress={() => begin('reopen')} /> : null}
        </>
      )}
      <Button title="Snags at this project" variant="ghost" icon="construct-outline" onPress={() => router.push(`/snags?projectId=${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
