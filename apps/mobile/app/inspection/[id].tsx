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
import { colors, fontSize, maxFontScale, radius, spacing, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';
import { useFieldChain } from '../../src/forms/keyboard';

const RESULT_TONE: Record<InspectionResult, { fg: string; bg: string }> = {
  PASS: { fg: colors.success, bg: colors.successSoft },
  FAIL: { fg: colors.danger, bg: colors.dangerSoft },
  NA: { fg: colors.neutral, bg: colors.neutralSoft },
};

/** English labels; shown through t(). */
const DECISIONS: { decision: ReviewDecision; label: string; confirm: string; variant: 'success' | 'accent' | 'danger'; icon: 'checkmark' | 'refresh' | 'close'; hint: string }[] = [
  { decision: 'APPROVE', label: 'Pass', confirm: 'Confirm pass', variant: 'success', icon: 'checkmark', hint: 'The work may proceed.' },
  { decision: 'REQUEST_CHANGES', label: 'Re-inspect', confirm: 'Confirm re-inspect', variant: 'accent', icon: 'refresh', hint: 'Site rectifies the points not OK and requests the inspection again.' },
  { decision: 'REJECT', label: 'Fail', confirm: 'Confirm fail', variant: 'danger', icon: 'close', hint: 'The inspection is closed as failed.' },
];

type Point = { result: InspectionResult | null; remark: string };

/** QA/QC's checklist: a result per point, photos, then pass, re-inspect or fail. */
function Inspect({ data, onDone }: { data: InspectionDto; onDone: (x: InspectionDto) => void }) {
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
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
    if (open) return setError(t('Record all points first ({n} left)', { n: open }));
    if (d === 'APPROVE' && failed) return setError(failed === 1 ? t('1 point is not OK: it cannot pass') : t('{n} points are not OK: it cannot pass', { n: failed }));
    if (photosUploading(photos) || photosQueued(photos)) return setError(t('Wait for photos to finish uploading'));
    if (photosFailed(photos)) return setError(t('Remove or retry failed photos'));
    setPending(d);
  };
  const confirm = async () => {
    if (!pending) return;
    if (pending !== 'APPROVE' && !failed && !note.trim()) return setError(t('Say what is wrong'));
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
        <Card title={`${t('Checklist')} · ${open ? t('{open} of {total} to check', { open, total: points.length }) : failed ? t('{n} not OK', { n: failed }) : t('all checked')}`}>
          {data.checklist.map((c, i) => (
            <View key={i} style={styles.point}>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.pointText}>
                {i + 1}. {c.item}
              </Text>
              <Chips<InspectionResult>
                value={points[i]?.result ?? null}
                onChange={(v) => set(i, { result: v })}
                clearable={false}
                options={[
                  { value: 'PASS', label: t('OK') },
                  { value: 'FAIL', label: t('Not OK') },
                  { value: 'NA', label: t('N/A') },
                ]}
              />
              {points[i]?.result === 'FAIL' ? <Input {...field()} value={points[i].remark} onChangeText={(v) => set(i, { remark: v })} placeholder={t('What is wrong')} accessibilityLabel={t('What is wrong with point {n}', { n: i + 1 })} /> : null}
            </View>
          ))}
          {open ? <Button title={t('Mark the rest OK')} variant="ghost" icon="checkmark-done" onPress={() => setPoints((ps) => ps.map((p) => (p.result ? p : { ...p, result: 'PASS' })))} /> : null}
        </Card>
      ) : null}
      <Card title={t("Inspector's photos")}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Card>
      <Card title={t('Decision')}>
        <ErrorBanner message={pending ? null : error} />
        <View style={styles.actions}>
          {DECISIONS.map((d) => (
            <Button key={d.decision} title={t(d.label)} variant={d.variant} icon={d.icon} onPress={() => choose(d.decision)} />
          ))}
        </View>
      </Card>
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => !busy && setPending(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{meta ? t(meta.label) : null}</Text>
            <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.sheetSub]}>{meta ? t(meta.hint) : null}</Text>
            <Input value={note} onChangeText={setNote} placeholder={t(pending === 'APPROVE' || failed ? 'Note (optional)' : 'Say what is wrong')} accessibilityLabel={pending === 'APPROVE' || failed ? t('Note for the requester (optional)') : t('What is wrong')} multiline autoFocus />
            <ErrorBanner message={error} />
            <View style={styles.sheetBtns}>
              <Button title={t('Cancel')} variant="ghost" onPress={() => setPending(null)} disabled={busy} style={styles.flex} />
              <Button title={meta ? t(meta.confirm) : ''} variant={meta?.variant ?? 'primary'} onPress={confirm} loading={busy} style={styles.flex2} />
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
  const t = useT();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<InspectionDto>((api) => api.get(`/inspections/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const inspector = !!user && data.status === 'SUBMITTED' && mayApproveType(user, 'INSPECTION');
  const counts = checklistCounts(data.checklist);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={data.activityName} subtitle={`${data.inspectionNo} · ${t('ready {date}', { date: formatDate(data.date) })}`} labels={INSPECTION_STATUS_LABELS} />
      <Card>
        <KeyValue label={t('Location')} value={data.location} />
        {data.holdPoint ? <KeyValue label={t('Hold point')} value={t('Progress is approved after this passes')} /> : null}
        <KeyValue label={t('Checklist')} value={data.checklistName ?? t(data.checklist.length ? 'Own points' : 'None')} />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      {inspector ? (
        <Inspect data={data} onDone={setData} />
      ) : data.checklist.length ? (
        <Card title={counts.open === counts.total ? t('Checklist ({n} points)', { n: counts.total }) : t('Checklist · {pass} OK, {fail} not OK', { pass: counts.pass, fail: counts.fail })}>
          {data.checklist.map((c, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.pointText}>
                  {i + 1}. {c.item}
                </Text>
                {c.remark ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{c.remark}</Text> : null}
              </View>
              {c.result ? (
                <View style={[styles.result, { backgroundColor: RESULT_TONE[c.result].bg }]}>
                  <Text maxFontSizeMultiplier={maxFontScale} style={[styles.resultText, { color: RESULT_TONE[c.result].fg }]}>{t(INSPECTION_RESULT_LABELS[c.result])}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
      <SubmitterActions type="INSPECTION" item={data} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 1.6, marginLeft: spacing.sm },
  point: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pointText: { fontSize: fontSize.body, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  result: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  resultText: { fontSize: fontSize.small, fontWeight: '700' },
  actions: { gap: spacing.sm },
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxl },
  sheetSub: { marginBottom: spacing.lg },
  sheetBtns: { flexDirection: 'row' },
});
