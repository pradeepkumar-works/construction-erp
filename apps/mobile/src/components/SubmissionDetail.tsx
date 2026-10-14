import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { AttachmentDto, ReviewDecision, SubmissionBase, SubmissionType } from '@erp/shared';
import { absoluteUrl } from '../config';
import { colors, radius, spacing, typography } from '../theme';
import { formatDateTime } from '../utils/format';
import { Card } from './Card';
import { KeyValue } from './Layout';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { Input } from './Input';
import { useApi } from '../api/hooks';
import { errorMessage } from '../api/client';
import { ErrorBanner } from './States';
import { useAuth } from '../auth/AuthContext';
import { canEditSubmission, canResubmit, mayApproveType } from '@erp/shared';

/** Status, project, submitter and reviewer block shared by all three detail screens. */
export function SubmissionHeader({ item, title, subtitle }: { item: SubmissionBase; title: string; subtitle?: string }) {
  return (
    <Card>
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <Text style={typography.h2}>{title}</Text>
          {subtitle ? <Text style={[typography.caption, styles.subtitle]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.statusRow}>
        <StatusBadge status={item.status} size="lg" />
      </View>
      <KeyValue label="Project" value={item.projectName} />
      <KeyValue label="Submitted by" value={item.submittedByName} />
      <KeyValue label="Submitted at" value={formatDateTime(item.submittedAt)} />
      {item.reviewedByName ? <KeyValue label="Reviewed by" value={`${item.reviewedByName} · ${formatDateTime(item.reviewedAt)}`} /> : null}
      {item.reviewNote ? (
        <View style={styles.note}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.info} />
          <View style={styles.flex}>
            <Text style={styles.noteLabel}>Reviewer note</Text>
            <Text style={styles.noteText}>{item.reviewNote}</Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export function AttachmentGallery({ attachments }: { attachments: AttachmentDto[] }) {
  const [open, setOpen] = useState<AttachmentDto | null>(null);
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const files = attachments.filter((a) => !a.mimeType.startsWith('image/'));
  return (
    <Card title={`Photos (${attachments.length})`}>
      <View style={styles.grid}>
        {images.map((a) => (
          <Pressable key={a.id} onPress={() => setOpen(a)} style={styles.thumbWrap}>
            <Image source={{ uri: absoluteUrl(a.url) }} style={styles.thumb} contentFit="cover" transition={150} />
          </Pressable>
        ))}
      </View>
      {files.map((f) => (
        <View key={f.id} style={styles.fileRow}>
          <Ionicons name="document-attach-outline" size={20} color={colors.textMuted} />
          <Text style={styles.fileName} numberOfLines={1}>
            {f.fileName}
          </Text>
        </View>
      ))}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.lightbox} onPress={() => setOpen(null)}>
          {open ? <Image source={{ uri: absoluteUrl(open.url) }} style={styles.full} contentFit="contain" /> : null}
          <View style={styles.lightboxClose}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </Card>
  );
}

const DECISIONS: { decision: ReviewDecision; label: string; variant: 'success' | 'accent' | 'danger'; icon: 'checkmark' | 'create-outline' | 'close' }[] = [
  { decision: 'APPROVE', label: 'Approve', variant: 'success', icon: 'checkmark' },
  { decision: 'REQUEST_CHANGES', label: 'Request changes', variant: 'accent', icon: 'create-outline' },
  { decision: 'REJECT', label: 'Reject', variant: 'danger', icon: 'close' },
];

/** Entry forms on the phone; RA bills, purchase orders and vendor bills are prepared on the web. */
const EDIT_PATH: Partial<Record<SubmissionType, string>> = { PROGRESS: '/progress/new', DPR: '/dpr/new', MATERIAL_REQUEST: '/material-request/new', MACHINERY: '/machinery/new', EXPENSE: '/expense/new', MEASUREMENT: '/measurement/new' };

const REVIEW_PATH: Record<SubmissionType, string> = { PROGRESS: 'progress', DPR: 'dpr', MATERIAL_REQUEST: 'material_request', MACHINERY: 'machinery', EXPENSE: 'expense', MEASUREMENT: 'measurement', BILL: 'bill', PURCHASE_ORDER: 'purchase_order', VENDOR_BILL: 'vendor_bill', WORK_ORDER: 'work_order', SUBCONTRACT_BILL: 'subcontract_bill' };

/** The detail endpoint each type is read back from after a review. */
const DETAIL_API: Record<SubmissionType, string> = {
  PROGRESS: 'progress',
  DPR: 'dpr',
  MATERIAL_REQUEST: 'material-requests',
  MACHINERY: 'machinery-logs',
  EXPENSE: 'expenses',
  MEASUREMENT: 'measurements',
  BILL: 'ra-bills',
  PURCHASE_ORDER: 'purchase-orders',
  VENDOR_BILL: 'vendor-bills',
  WORK_ORDER: 'work-orders',
  SUBCONTRACT_BILL: 'subcontract-bills',
};

/** Approve / request changes / reject with an optional note. Rendered only for approvers on SUBMITTED entries. */
export function ReviewActions<T extends SubmissionBase>({ type, item, onReviewed }: { type: SubmissionType; item: T; onReviewed: (updated: T) => void }) {
  const { user } = useAuth();
  const api = useApi();
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const known = item as unknown as { totalAmount?: string; amount?: string; grossAmount?: string };
  const amount = type === 'EXPENSE' ? known.totalAmount : type === 'MEASUREMENT' ? known.amount : type === 'BILL' ? known.grossAmount : undefined;
  if (!user || !mayApproveType(user, type, amount) || item.status !== 'SUBMITTED') return null;
  const meta = DECISIONS.find((d) => d.decision === pending);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/approvals/${REVIEW_PATH[type]}/${item.id}/review`, { decision: pending, note: note.trim() || undefined });
      const updated = await api.get<T>(`/${DETAIL_API[type]}/${item.id}`);
      setPending(null);
      setNote('');
      onReviewed(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Review">
      <Text style={[typography.caption, styles.reviewHint]}>This entry is awaiting your decision.</Text>
      <View style={styles.actions}>
        {DECISIONS.map((d) => (
          <Button key={d.decision} title={d.label} variant={d.variant} icon={d.icon} onPress={() => setPending(d.decision)} style={styles.actionBtn} />
        ))}
      </View>
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => !busy && setPending(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={typography.h2}>{meta?.label}</Text>
            <Text style={[typography.caption, styles.sheetSub]}>Add an optional note for the submitter.</Text>
            <Input value={note} onChangeText={setNote} placeholder="Note (optional)" multiline autoFocus />
            <ErrorBanner message={error} />
            <View style={styles.sheetBtns}>
              <Button title="Cancel" variant="ghost" onPress={() => setPending(null)} disabled={busy} style={styles.flex} />
              <Button title={`Confirm ${meta?.label.toLowerCase() ?? ''}`} variant={meta?.variant ?? 'primary'} onPress={confirm} loading={busy} style={styles.flex2} />
            </View>
          </View>
        </View>
      </Modal>
    </Card>
  );
}

/**
 * "Edit and resubmit" for the author of a draft / rejected / changes-requested entry (approvers see it too).
 * Opens the entry form prefilled; saving there resubmits for approval.
 */
export function SubmitterActions({ type, item }: { type: SubmissionType; item: SubmissionBase }) {
  const { user } = useAuth();
  const router = useRouter();
  const path = EDIT_PATH[type];
  if (!user || !path || !canEditSubmission(user, item) || !canResubmit(user, item)) return null;
  const draft = item.status === 'DRAFT';
  const hint = draft
    ? 'This entry has not been sent for approval yet.'
    : item.status === 'REJECTED'
      ? 'This entry was rejected. Fix it and send it again for approval.'
      : 'The approver asked for changes. Update the entry and resubmit it.';
  return (
    <Card title={draft ? 'Draft' : 'Needs your attention'}>
      <Text style={[typography.caption, styles.reviewHint]}>{hint}</Text>
      <Button title={draft ? 'Edit and submit' : 'Edit and resubmit'} icon="create-outline" onPress={() => router.push({ pathname: path, params: { editId: item.id } })} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 1.6, marginLeft: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'flex-start' },
  subtitle: { marginTop: 2 },
  statusRow: { marginVertical: spacing.md },
  note: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  noteLabel: { ...typography.label, color: colors.info, marginBottom: 2 },
  noteText: { ...typography.body },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.neutralSoft },
  thumb: { width: '100%', height: '100%' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  fileName: { ...typography.body, flex: 1 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  lightboxClose: { position: 'absolute', top: 48, right: 20 },
  reviewHint: { marginBottom: spacing.md },
  actions: { gap: spacing.sm },
  actionBtn: {},
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxl },
  sheetSub: { marginBottom: spacing.lg },
  sheetBtns: { flexDirection: 'row' },
});
