import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DefectDto } from '@erp/shared';
import { DEFECT_PHASE_LABELS, DEFECT_PRIORITY_LABELS, DEFECT_STATUS_LABELS, canCloseDefect, canReportDefect } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, PhotoChecks, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, PhotoPicker, Pill, RecordHead, Screen, type LocalPhoto } from '../../src/components';
import { DEFECT_STATUS_TONE, DEFECT_TONE } from '../../src/components/defectTone';
import { attachmentIds, photosFailed, photosQueued, photosUploading } from '../../src/forms/common';
import { colors, spacing, toneIcon } from '../../src/theme';
import { formatDate, formatDateTime, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

type Step = 'fix' | 'close' | 'reopen' | null;

/** One snag or defect: whoever works on the project marks it fixed with photos after; QA/QC accepts it or reopens it. */
export default function SnagScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const t = useT();
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
    if (photosUploading(photos)) return setActionError(t('Wait for photos to finish uploading'));
    if (photosFailed(photos) || photosQueued(photos)) return setActionError(t('Photos need a connection; remove them or try again'));
    if (step === 'close' && data.status === 'OPEN' && !note.trim()) return setActionError(t('Say why it is closed without being fixed'));
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

  const TITLE: Record<Exclude<Step, null>, string> = { fix: t('Mark fixed'), close: t(data.status === 'FIXED' ? 'Accept and close' : 'Close'), reopen: t('Reopen') };
  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <RecordHead
        caption={`${data.defectNo} · ${data.projectName}`}
        title={data.title}
        pills={
          <>
            <Pill text={t(DEFECT_PHASE_LABELS[data.phase])} fg={colors.neutral} bg={colors.neutralSoft} />
            <Pill text={t('{priority} priority', { priority: t(DEFECT_PRIORITY_LABELS[data.priority]) })} {...DEFECT_TONE[data.priority]} />
            <Pill text={t(DEFECT_STATUS_LABELS[data.status])} {...DEFECT_STATUS_TONE[data.status]} />
            {data.overdue ? <Pill text={t('Overdue')} fg={colors.danger} bg={colors.dangerSoft} icon={toneIcon.alert} /> : null}
          </>
        }
        more={[
          { label: t('Snags at this project'), icon: 'construct-outline', onPress: () => router.push(`/snags?projectId=${data.projectId}`) },
          { label: t('Open project'), icon: 'business-outline', onPress: () => router.push(`/project/${data.projectId}`) },
        ]}
      />
      <ErrorBanner message={actionError} />
      <Card>
        <KeyValue label={t('Where')} value={data.location} />
        <KeyValue label={t('Trade')} value={data.trade} />
        <KeyValue label={t('Details')} value={data.description} multiline />
        <KeyValue label={t('Found')} value={`${data.foundBy ? t('{date} by {name}', { date: formatDate(data.reportedOn), name: data.foundBy }) : formatDate(data.reportedOn)}, ${t('logged by {name}', { name: data.reportedByName })}`} multiline />
        <KeyValue label={t('Assigned to')} value={data.assignedToName} />
        <KeyValue label={t('Subcontractor')} value={data.contractor} />
        <KeyValue label={t('Put right by')} value={data.dueDate ? formatDate(data.dueDate) : null} />
        {data.fixedOn ? <KeyValue label={t('Fixed')} value={`${data.fixedByName ? t('{date} by {name}', { date: formatDate(data.fixedOn), name: data.fixedByName }) : formatDate(data.fixedOn)}${data.fixNote ? `: ${data.fixNote}` : ''}`} multiline /> : null}
        {data.closedAt ? <KeyValue label={t('Closed')} value={`${data.closedByName ?? ''}, ${formatDateTime(data.closedAt)}${data.closeNote ? `: ${data.closeNote}` : ''}`} multiline /> : null}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <PhotoChecks kind="defect" id={data.id} attachments={data.attachments} />
      {step ? (
        <Card title={TITLE[step]}>
          <Input label={t(step === 'fix' ? 'What was done' : step === 'reopen' ? 'Why it is not right yet' : 'Note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
          {step === 'fix' ? <PhotoPicker photos={photos} onChange={setPhotos} /> : null}
          <Button title={TITLE[step]} icon="checkmark-circle" onPress={act} loading={busy} />
          <Button title={t('Cancel')} variant="ghost" onPress={() => setStep(null)} />
        </Card>
      ) : (
        <>
          {data.status === 'OPEN' && reporter ? <Button title={t('Mark fixed')} icon="checkmark-circle" onPress={() => begin('fix')} /> : null}
          {data.status !== 'CLOSED' && closer ? <Button title={TITLE.close} icon="shield-checkmark" variant={data.status === 'FIXED' ? 'primary' : 'secondary'} onPress={() => begin('close')} /> : null}
          {data.status !== 'OPEN' && closer ? <Button title={t('Reopen')} icon="refresh" variant="secondary" onPress={() => begin('reopen')} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
});
