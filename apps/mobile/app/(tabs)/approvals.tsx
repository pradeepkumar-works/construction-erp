import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SUBMISSION_TYPE_LABELS, type PendingApprovalDto, type SubmissionType } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { approvedLine, canQuickReview, reviewSubmission } from '../../src/api/review';
import { Button, EmptyState, ErrorBanner, ErrorState, Input, Loading, Screen, SubmissionRow, useSnackbar, Touchable } from '../../src/components';
import { BottomSheet } from '../../src/components/BottomSheet';
import { useNotifications } from '../../src/notifications/NotificationsContext';
import { colors, fontSize, radius, spacing, touch, typography } from '../../src/theme';
import { formatMoney, timeAgo } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

const ORDER: SubmissionType[] = ['DPR', 'PROGRESS', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT', 'BILL', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'SUPPLIER_CHOICE', 'PAYMENT_REQUEST', 'INSPECTION'];
const DETAIL_PATH: Record<SubmissionType, string> = { PROGRESS: '/progress/', DPR: '/dpr/', MATERIAL_REQUEST: '/material-request/', MACHINERY: '/machinery/', EXPENSE: '/expense/', MEASUREMENT: '/measurement/', BILL: '/bill/', PURCHASE_ORDER: '/purchase-order/', VENDOR_BILL: '/vendor-bill/', WORK_ORDER: '/work-order/', SUBCONTRACT_BILL: '/subcontract-bill/', INSPECTION: '/inspection/', PAYMENT_REQUEST: '/payment-request/', SUPPLIER_CHOICE: '/supplier-choice/' };

const keyOf = (p: PendingApprovalDto) => `${p.type}-${p.id}`;

export default function ApprovalsScreen() {
  const router = useRouter();
  const api = useApi();
  const t = useT();
  const snackbar = useSnackbar();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<PendingApprovalDto[]>((api) => api.get('/approvals/pending'), []);
  const { refreshPending } = useNotifications();
  // The tab's badge follows the list just loaded (and each approval taken off it).
  useEffect(() => {
    if (data) void refreshPending(data.length);
  }, [data, refreshPending]);
  const [approving, setApproving] = useState<PendingApprovalDto | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // One row open at a time: swiping another closes the last.
  const openRow = useRef<SwipeableMethods | null>(null);

  const sections = useMemo(
    () =>
      ORDER.map((type) => ({ type, title: t(SUBMISSION_TYPE_LABELS[type]), data: (data ?? []).filter((p) => p.type === type) })).filter((s) => s.data.length > 0),
    [data, t],
  );

  const open = useCallback((item: PendingApprovalDto) => router.push(`${DETAIL_PATH[item.type]}${item.id}`), [router]);
  const askApprove = useCallback((item: PendingApprovalDto) => {
    openRow.current?.close();
    setNote('');
    setSheetError(null);
    setApproving(item);
  }, []);

  const approve = async () => {
    if (!approving) return;
    setBusy(true);
    setSheetError(null);
    try {
      // The same review call the record screen makes.
      const result = await reviewSubmission(api, approving.type, approving.id, 'APPROVE', note);
      const done = keyOf(approving);
      setData((prev) => (prev ? prev.filter((p) => keyOf(p) !== done) : prev));
      setApproving(null);
      const level = approvedLine(result);
      snackbar.show(level ? t(...level) : t('Approved: {title}', { title: approving.title }));
      void reload();
    } catch (e) {
      setSheetError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <Screen scroll={false} padded={false}>
      <SectionList
        sections={sections}
        keyExtractor={keyOf}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          data && data.length ? (
            <Text style={styles.summary}>
              {data.length === 1 ? t('1 item waiting for your review') : t('{n} items waiting for your review', { n: data.length })}
              {' · '}
              {t('Swipe left to approve')}
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState title={t('All caught up')} subtitle={t('Nothing is waiting for your approval.')} icon="checkmark-done-circle-outline" art="approved" />}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={typography.h3}>{section.title}</Text>
            <Text style={typography.caption}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SwipeRow
            item={item}
            onOpen={() => open(item)}
            onApprove={canQuickReview(item.type) ? () => askApprove(item) : undefined}
            onSwipeOpen={(row) => {
              if (openRow.current && openRow.current !== row) openRow.current.close();
              openRow.current = row;
            }}
          />
        )}
      />
      <BottomSheet
        visible={!!approving}
        onClose={() => setApproving(null)}
        dismissable={!busy}
        title={approving ? t('Approve {title}?', { title: approving.title }) : undefined}
        subtitle={approving ? `${approving.projectName} · ${approving.submittedByName}` : undefined}
      >
        <Input value={note} onChangeText={setNote} placeholder={t('Note (optional)')} accessibilityLabel={t('Note for the submitter (optional)')} multiline />
        <ErrorBanner message={sheetError} />
        <View style={styles.sheetBtns}>
          <Button title={t('Cancel')} variant="ghost" onPress={() => setApproving(null)} disabled={busy} style={styles.flex} />
          <Button title={t('Approve')} variant="success" icon="checkmark" onPress={approve} loading={busy} style={styles.flex2} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

/**
 * A queue row: tap opens the record; swiping left shows Approve (where a plain decision will do) and Open. Screen
 * readers get the same Approve as a row action instead of the gesture.
 */
function SwipeRow({ item, onOpen, onApprove, onSwipeOpen }: { item: PendingApprovalDto; onOpen: () => void; onApprove?: () => void; onSwipeOpen: (row: SwipeableMethods) => void }) {
  const t = useT();
  const ref = useRef<SwipeableMethods>(null);
  const level = item.levels ? `${t('Level {level} of {levels}', { level: item.level ?? 1, levels: item.levels })} · ` : '';
  const meta = `${item.escalated ? `${t('Escalated')} · ` : ''}${level}${item.amount && item.type !== 'EXPENSE' ? `${formatMoney(item.amount, { paise: false })} · ` : ''}${item.submittedByName} · ${timeAgo(item.submittedAt)}`;
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={styles.swipe}
      onSwipeableWillOpen={() => ref.current && onSwipeOpen(ref.current)}
      renderRightActions={(_progress, _translation, methods) => (
        <View style={styles.actions}>
          {onApprove ? (
            <Touchable onPress={onApprove} accessibilityRole="button" accessibilityLabel={t('Approve')} style={[styles.action, styles.approve]}>
              <Ionicons name="checkmark-circle" size={24} color={colors.textOnPrimary} />
              <Text style={styles.actionText}>{t('Approve')}</Text>
            </Touchable>
          ) : null}
          <Touchable
            onPress={() => {
              methods.close();
              onOpen();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Open entry')}
            style={[styles.action, styles.openAction]}
          >
            <Ionicons name="open-outline" size={22} color={colors.textOnPrimary} />
            <Text style={styles.actionText}>{t('Open entry')}</Text>
          </Touchable>
        </View>
      )}
    >
      <SubmissionRow
        type={item.type}
        title={item.title}
        subtitle={item.projectName}
        meta={meta}
        onPress={onOpen}
        style={styles.row}
        accessibilityActions={onApprove ? [{ name: 'approve', label: t('Approve') }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'approve') onApprove?.();
        }}
      />
    </ReanimatedSwipeable>
  );
}

const ACTION_WIDTH = 88;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 1.6, marginLeft: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  summary: { ...typography.caption, marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  swipe: { marginBottom: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' },
  row: { marginBottom: 0 },
  actions: { flexDirection: 'row' },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: touch.height },
  approve: { backgroundColor: colors.success },
  openAction: { backgroundColor: colors.primary },
  // textOnPrimary: white on the day tones, night ink on the brighter night tones (AA in both palettes).
  actionText: { color: colors.textOnPrimary, fontSize: fontSize.secondary, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  sheetBtns: { flexDirection: 'row' },
});
