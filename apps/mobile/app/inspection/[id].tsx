import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InspectionDto, InspectionResult, ReviewDecision } from '@erp/shared';
import { INSPECTION_RESULT_LABELS, INSPECTION_STATUS_LABELS, checklistCounts, mayApproveType } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { AttachmentGallery, Button, Card, Chips, ErrorBanner, ErrorState, Input, KeyValue, Loading, PhotoPicker, Screen, SubmissionHeader, SubmitterActions, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading } from '../../src/forms/common';
import { colors, radius, spacing, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';

const RESULT_TONE: Record<InspectionResult, { fg: string; bg: string }> = {
  PASS: { fg: colors.success, bg: colors.successSoft },
  FAIL: { fg: colors.danger, bg: colors.dangerSoft },
  NA: { fg: colors.neutral, bg: colors.neutralSoft },
};

const DECISIONS: { decision: ReviewDecision; label: string; variant: 'success' | 'accent' | 'danger'; icon: 'checkmark' | 'refresh' | 'close'; hint: string }[] = [
  { decision: 'APPROVE', label: 'Pass', variant: 'success', icon: 'checkmark', hint: 'The work may proceed.' },
  { decision: 'REQUEST_CHANGES', label: 'Re-inspect', variant: 'accent', icon: 'refresh', hint: 'Site rectifies the points not OK and requests the inspection again.' },
  { decision: 'REJECT', label: 'Fail', variant: 'danger', icon: 'close', hint: 'The inspection is closed as failed.' },
];

type Point = { result: InspectionResult | null; remark: string };

/** QA/QC's checklist: a result per point, photos, then pass, re-inspect or fail. */
function Inspect({ data, onDone }: { data: InspectionDto; onDone: (x: InspectionDto) => void }) {
  const api = useApi();
  const [points, setPoints] = useState<Point[]>([]);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPoints(data.checklist.map((c) => ({ result: c.result, remark: c.remark ?? '' }))), [data.id, data.checklist]);
  const open = points.filter((p) => !p.result).length;
  const failed = points.filter((p) => p.result === 'FAIL').length;
  const set = (i: number, patch: Partial<Point>) => setPoints((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const meta = DECISIONS.find((d) => d.decision === pending);

  const choose = (d: ReviewDecision) => {
    setError(null);
    if (open) return setError(`Record all points first (${open} left)`);
    if (d === 'APPROVE' && failed) return setError(`${failed} point${failed === 1 ? ' is' : 's are'} not OK: it cannot pass`);
    if (photosUploading(photos) || photosQueued(photos)) return setError('Wait for photos to finish uploading');
    if (photosFailed(photos)) return setError('Remove or retry failed photos');
    setPending(d);
  };
  const confirm = async () => {
    if (!pending) return;
    if (pending !== 'APPROVE' && !failed && !note.trim()) return setError('Say what is wrong');
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post<InspectionDto>(`/inspections/${data.id}/inspect`, {
        decision: pending,
        note: note.trim() || undefined,
        results: points.map((p) => ({ result: p.result, remark: p.remark.trim() || undefined })),
        attachmentIds: attachmentIds(photos),
      });
      setPending(null);
      onDone(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {data.checklist.length ? (
        <Card title={`Checklist · ${open ? `${open} of ${points.length} to check` : failed ? `${failed} not OK` : 'all checked'}`}>
          {data.checklist.map((c, i) => (
            <View key={i} style={styles.point}>
              <Text style={styles.pointText}>
                {i + 1}. {c.item}
              </Text>
              <Chips<InspectionResult>
                value={points[i]?.result ?? null}
                onChange={(v) => set(i, { result: v })}
                clearable={false}
                options={[
                  { value: 'PASS', label: 'OK' },
                  { value: 'FAIL', label: 'Not OK' },
                  { value: 'NA', label: 'N/A' },
                ]}
              />
              {points[i]?.result === 'FAIL' ? <Input value={points[i].remark} onChangeText={(v) => set(i, { remark: v })} placeholder="What is wrong" /> : null}
            </View>
          ))}
          {open ? <Button title="Mark the rest OK" variant="ghost" icon="checkmark-done" onPress={() => setPoints((ps) => ps.map((p) => (p.result ? p : { ...p, result: 'PASS' })))} /> : null}
        </Card>
      ) : null}
      <Card title="Inspector's photos">
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Card>
      <Card title="Decision">
        <ErrorBanner message={pending ? null : error} />
        <View style={styles.actions}>
          {DECISIONS.map((d) => (
            <Button key={d.decision} title={d.label} variant={d.variant} icon={d.icon} onPress={() => choose(d.decision)} />
          ))}
        </View>
      </Card>
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => !busy && setPending(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={typography.h2}>{meta?.label}</Text>
            <Text style={[typography.caption, styles.sheetSub]}>{meta?.hint}</Text>
            <Input value={note} onChangeText={setNote} placeholder={pending === 'APPROVE' || failed ? 'Note (optional)' : 'Say what is wrong'} multiline autoFocus />
            <ErrorBanner message={error} />
            <View style={styles.sheetBtns}>
              <Button title="Cancel" variant="ghost" onPress={() => setPending(null)} disabled={busy} style={styles.flex} />
              <Button title={`Confirm ${meta?.label.toLowerCase() ?? ''}`} variant={meta?.variant ?? 'primary'} onPress={confirm} loading={busy} style={styles.flex2} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function InspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<InspectionDto>((api) => api.get(`/inspections/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const inspector = !!user && data.status === 'SUBMITTED' && mayApproveType(user, 'INSPECTION');
  const counts = checklistCounts(data.checklist);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.activityName} subtitle={`${data.inspectionNo} · ready ${formatDate(data.date)}`} labels={INSPECTION_STATUS_LABELS} />
      <Card>
        <KeyValue label="Location" value={data.location} />
        {data.holdPoint ? <KeyValue label="Hold point" value="Progress is approved after this passes" /> : null}
        <KeyValue label="Checklist" value={data.checklistName ?? (data.checklist.length ? 'Own points' : 'None')} />
        <KeyValue label="Remarks" value={data.remarks} multiline />
      </Card>
      {inspector ? (
        <Inspect data={data} onDone={setData} />
      ) : data.checklist.length ? (
        <Card title={counts.open === counts.total ? `Checklist (${counts.total} points)` : `Checklist · ${counts.pass} OK, ${counts.fail} not OK`}>
          {data.checklist.map((c, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.pointText}>
                  {i + 1}. {c.item}
                </Text>
                {c.remark ? <Text style={typography.caption}>{c.remark}</Text> : null}
              </View>
              {c.result ? (
                <View style={[styles.result, { backgroundColor: RESULT_TONE[c.result].bg }]}>
                  <Text style={[styles.resultText, { color: RESULT_TONE[c.result].fg }]}>{INSPECTION_RESULT_LABELS[c.result]}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="INSPECTION" item={data} />
      <Button title="Open project" variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 1.6, marginLeft: spacing.sm },
  point: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pointText: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  result: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  resultText: { fontSize: 12, fontWeight: '700' },
  actions: { gap: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxl },
  sheetSub: { marginBottom: spacing.lg },
  sheetBtns: { flexDirection: 'row' },
});
