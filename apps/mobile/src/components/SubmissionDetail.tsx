import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ApprovalStageDto, AttachmentDto, ReviewDecision, SubmissionBase, SubmissionType } from '@erp/shared';
import { absoluteUrl } from '../config';
import { colors, fontSize, maxFontScale, radius, spacing, typography } from '../theme';
import { formatDateTime } from '../utils/format';
import { takenAtFromName } from '../utils/photoTime';
import { IconButton, Touchable } from './Touchable';
import { Card } from './Card';
import { KeyValue } from './Layout';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { BottomSheet, SheetActions, type SheetAction } from './BottomSheet';
import { ReasonSheet } from './ReasonSheet';
import { useApi, useFetch } from '../api/hooks';
import { REVIEW_PATH, approvedLine, reviewSubmission } from '../api/review';
import { useSnackbar } from './Snackbar';
import { useAuth } from '../auth/AuthContext';
import { canEditSubmission, canResubmit, mayApproveType } from '@erp/shared';
import { useT } from '../i18n/LanguageContext';

/**
 * Status, project, submitter and reviewer block shared by the submission screens. Its More button opens a sheet of the
 * record's secondary actions; the main ones (review, edit and resubmit) stay on the page.
 */
export function SubmissionHeader({ item, title, subtitle, labels }: { item: SubmissionBase; title: string; subtitle?: string; labels?: Record<SubmissionBase['status'], string> }) {
  const t = useT();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const actions: SheetAction[] = [{ label: t('Open project'), icon: 'business-outline', onPress: () => router.push(`/project/${item.projectId}`) }];
  return (
    <Card>
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{title}</Text>
          {subtitle ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.subtitle]}>{subtitle}</Text> : null}
        </View>
        <IconButton icon="ellipsis-horizontal" filled={colors.primarySoft} onPress={() => setMore(true)} accessibilityLabel={t('More actions')} style={styles.more} />
      </View>
      <BottomSheet visible={more} onClose={() => setMore(false)} title={t('More')} subtitle={title}>
        <SheetActions actions={actions} onClose={() => setMore(false)} />
      </BottomSheet>
      <View style={styles.statusRow}>
        <StatusBadge status={item.status} size="lg" labels={labels} />
      </View>
      <KeyValue label={t('Project')} value={item.projectName} />
      <KeyValue label={t('Submitted by')} value={item.submittedByName} />
      <KeyValue label={t('Submitted at')} value={formatDateTime(item.submittedAt)} />
      {item.reviewedByName ? <KeyValue label={t('Reviewed by')} value={`${item.reviewedByName} · ${formatDateTime(item.reviewedAt)}`} /> : null}
      {item.reviewNote ? (
        <View style={styles.note}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.info} />
          <View style={styles.flex}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.noteLabel}>{t('Reviewer note')}</Text>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.noteText}>{item.reviewNote}</Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export function AttachmentGallery({ attachments }: { attachments: AttachmentDto[] }) {
  const [open, setOpen] = useState<AttachmentDto | null>(null);
  const t = useT();
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const files = attachments.filter((a) => !a.mimeType.startsWith('image/'));
  return (
    <Card title={t('Photos ({n})', { n: attachments.length })}>
      <View style={styles.grid}>
        {images.map((a, i) => {
          const taken = takenAtFromName(a.fileName);
          return (
            <Touchable
              key={a.id}
              onPress={() => setOpen(a)}
              style={styles.thumbWrap}
              accessibilityRole="imagebutton"
              accessibilityLabel={taken ? t('Photo {n} of {total}, taken {time}', { n: i + 1, total: images.length, time: formatDateTime(taken) }) : t('Photo {n} of {total}', { n: i + 1, total: images.length })}
              accessibilityHint={t('Opens the photo')}
            >
              <Image source={{ uri: absoluteUrl(a.url) }} style={styles.thumb} contentFit="cover" transition={150} />
              {taken ? (
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.stamp} numberOfLines={1}>
                  {formatDateTime(taken)}
                </Text>
              ) : null}
            </Touchable>
          );
        })}
      </View>
      {files.map((f) => (
        <View key={f.id} style={styles.fileRow}>
          <Ionicons name="document-attach-outline" size={20} color={colors.textMuted} />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.fileName} numberOfLines={1}>
            {f.fileName}
          </Text>
        </View>
      ))}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Touchable style={styles.lightbox} onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel={t('Close photo')} pressedStyle={styles.lightboxPressed}>
          {open ? <Image source={{ uri: absoluteUrl(open.url) }} style={styles.full} contentFit="contain" /> : null}
          {open && takenAtFromName(open.fileName) ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.lightboxStamp}>{t('Taken {time}', { time: formatDateTime(takenAtFromName(open.fileName)) })}</Text> : null}
          <View style={styles.lightboxClose}>
            <Ionicons name="close-circle" size={36} color={colors.onOverlay} />
          </View>
        </Touchable>
      </Modal>
    </Card>
  );
}

const DECISIONS: {
  decision: ReviewDecision;
  label: string;
  done: string;
  variant: 'success' | 'accent' | 'danger';
  icon: 'checkmark' | 'create-outline' | 'close';
  /** What the sheet asks for, and reasons a tap fills in (the approver can add to them). */
  ask: string;
  field: string;
  quick: string[];
  missing?: string;
}[] = [
  { decision: 'APPROVE', label: 'Approve', done: 'Approved', variant: 'success', icon: 'checkmark', ask: 'Add an optional note for the submitter.', field: 'Note (optional)', quick: [] },
  {
    decision: 'REQUEST_CHANGES',
    label: 'Request changes',
    done: 'Changes requested',
    variant: 'accent',
    icon: 'create-outline',
    ask: 'Say what needs changing. The submitter sees it with the entry.',
    field: 'What needs changing',
    quick: ['Add photos of the work', 'Quantities do not match the site', 'Wrong date or project'],
    missing: 'Say what needs changing',
  },
  {
    decision: 'REJECT',
    label: 'Reject',
    done: 'Rejected',
    variant: 'danger',
    icon: 'close',
    ask: 'Say why you are rejecting it. The submitter sees it with the entry.',
    field: 'Reason for rejecting',
    quick: ['Entered twice', 'Work not done on site'],
    missing: 'Say why you are rejecting it',
  },
];

/** Entry forms on the phone; RA bills, purchase orders and vendor bills are prepared on the web. */
const EDIT_PATH: Partial<Record<SubmissionType, string>> = { PROGRESS: '/progress/new', DPR: '/dpr/new', MATERIAL_REQUEST: '/material-request/new', MACHINERY: '/machinery/new', EXPENSE: '/expense/new', MEASUREMENT: '/measurement/new', INSPECTION: '/inspection/new' };

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
  INSPECTION: 'inspections',
  PAYMENT_REQUEST: 'payment-requests',
};

/**
 * Approve / request changes / reject with an optional note, for whoever decides a SUBMITTED entry at the level it waits
 * at (v5 item 94, the API's stage). Everyone else sees whose queue it is in, since when, and why they cannot decide it.
 */
export function ReviewActions<T extends SubmissionBase>({ type, item, onReviewed }: { type: SubmissionType; item: T; onReviewed: (updated: T) => void }) {
  const { user } = useAuth();
  const api = useApi();
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const t = useT();
  const snackbar = useSnackbar();

  const known = item as unknown as { totalAmount?: string; amount?: string; grossAmount?: string };
  const amount = type === 'EXPENSE' ? known.totalAmount : type === 'MEASUREMENT' ? known.amount : type === 'BILL' ? known.grossAmount : undefined;
  const waiting = item.status === 'SUBMITTED' && type !== 'INSPECTION';
  const { data: stage } = useFetch<ApprovalStageDto>((a) => a.get(`/approvals/${REVIEW_PATH[type]}/${item.id}/stage`), [type, item.id, item.status], { enabled: waiting });
  // An inspection is reviewed with its checklist on its own screen.
  if (!user || !waiting) return null;
  // Until the stage arrives, the user's level-1 limit decides (the whole answer for a company without levels).
  if (!(stage ? stage.canReview : mayApproveType(user, type, amount))) return stage ? <StageCard stage={stage} /> : null;
  const meta = DECISIONS.find((d) => d.decision === pending);

  const confirm = async (note: string) => {
    if (!pending) return;
    const result = await reviewSubmission(api, type, item.id, pending, note);
    const updated = await api.get<T>(`/${DETAIL_API[type]}/${item.id}`);
    onReviewed(updated);
    const level = approvedLine(result);
    if (meta) snackbar.show(level ? t(...level) : t(meta.done), { tone: pending === 'APPROVE' ? 'success' : 'info' });
  };

  return (
    <Card title={t('Review')}>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.reviewHint]}>
        {t('This entry is awaiting your decision.')}
        {stage && stage.levels > 1 ? ` ${t('Level {level} of {levels}.', { level: stage.level, levels: stage.levels })}` : ''}
      </Text>
      <View style={styles.actions}>
        {DECISIONS.map((d) => (
          <Button key={d.decision} title={t(d.label)} variant={d.variant} icon={d.icon} onPress={() => setPending(d.decision)} style={styles.actionBtn} />
        ))}
      </View>
      {meta ? (
        <ReasonSheet
          visible={!!pending}
          onClose={() => setPending(null)}
          title={meta.label}
          subtitle={t(meta.ask)}
          field={meta.field}
          quick={meta.quick}
          required={meta.decision !== 'APPROVE'}
          missing={meta.missing}
          confirm={meta.label}
          variant={meta.variant}
          onConfirm={confirm}
        />
      ) : null}
    </Card>
  );
}

/** Where a waiting entry stands (v5 item 94): its level, whose queue it is in and since when, and why this user cannot decide it. */
function StageCard({ stage }: { stage: ApprovalStageDto }) {
  const t = useT();
  const who = stage.waitingWith.map((r) => t(r)).join(', ');
  return (
    <Card title={t('Approval')}>
      {stage.levels > 1 ? <KeyValue label={t('Level')} value={t('{level} of {levels}', { level: stage.level, levels: stage.levels })} /> : null}
      <KeyValue label={t('Waiting with')} value={who || t('No approver yet')} />
      {stage.waitingSince ? <KeyValue label={t('Since')} value={formatDateTime(stage.waitingSince)} /> : null}
      {stage.escalated ? <KeyValue label={t('Escalated')} value={t('Yes, the next level can decide it too')} /> : null}
      {stage.reason ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.stageReason]}>{stage.reason}</Text> : null}
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
  const t = useT();
  const path = EDIT_PATH[type];
  if (!user || !path || !canEditSubmission(user, item) || !canResubmit(user, item)) return null;
  const draft = item.status === 'DRAFT';
  const hint = draft
    ? t('This entry has not been sent for approval yet.')
    : item.status === 'REJECTED'
      ? t('This entry was rejected. Fix it and send it again for approval.')
      : t('The approver asked for changes. Update the entry and resubmit it.');
  return (
    <Card title={draft ? t('Draft') : t('Needs your attention')}>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.reviewHint]}>{hint}</Text>
      <Button title={draft ? t('Edit and submit') : t('Edit and resubmit')} icon="create-outline" onPress={() => router.push({ pathname: path, params: { editId: item.id } })} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start' },
  more: { marginLeft: spacing.sm },
  subtitle: { marginTop: 2 },
  statusRow: { marginVertical: spacing.md },
  note: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  noteLabel: { ...typography.label, color: colors.info, marginBottom: 2 },
  noteText: { ...typography.body },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.neutralSoft },
  thumb: { width: '100%', height: '100%' },
  stamp: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: colors.scrim, color: colors.onOverlay, fontSize: fontSize.small, textAlign: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  fileName: { ...typography.body, flex: 1 },
  lightbox: { flex: 1, backgroundColor: colors.scrimDeep, alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  lightboxPressed: { opacity: 1 },
  lightboxStamp: { color: colors.onOverlay, fontSize: fontSize.secondary, marginTop: spacing.sm },
  lightboxClose: { position: 'absolute', top: 48, right: 20 },
  reviewHint: { marginBottom: spacing.md },
  stageReason: { marginTop: spacing.sm },
  actions: { gap: spacing.sm },
  actionBtn: {},
});
