import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NOTIFICATION_TYPE_LABELS, type NotificationDto, type NotificationListDto, type NotificationType } from '@erp/shared';
import { useApi, useFetch } from '../src/api/hooks';
import { useNotifications } from '../src/notifications/NotificationsContext';
import { notificationRoute } from '../src/notifications/push';
import { Button, EmptyState, ErrorState, Loading, Screen } from '../src/components';
import { colors, radius, spacing, typography } from '../src/theme';
import { timeAgo } from '../src/utils/format';

const ICON: Record<NotificationType, { name: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  SUBMISSION_SUBMITTED: { name: 'time', color: colors.warning, bg: colors.warningSoft },
  SUBMISSION_APPROVED: { name: 'checkmark-circle', color: colors.success, bg: colors.successSoft },
  SUBMISSION_REJECTED: { name: 'close-circle', color: colors.danger, bg: colors.dangerSoft },
  SUBMISSION_CHANGES_REQUESTED: { name: 'create', color: colors.info, bg: colors.infoSoft },
  DPR_REMINDER: { name: 'alarm', color: colors.primary, bg: colors.primarySoft },
  APPROVAL_DIGEST: { name: 'list-circle', color: colors.accent, bg: colors.accentSoft },
  LOW_STOCK: { name: 'warning', color: colors.danger, bg: colors.dangerSoft },
  RISK_RAISED: { name: 'alert-circle', color: colors.danger, bg: colors.dangerSoft },
  TEST_DUE: { name: 'flask', color: colors.info, bg: colors.infoSoft },
  TEST_FAILED: { name: 'flask', color: colors.danger, bg: colors.dangerSoft },
  DOCUMENT_ISSUED: { name: 'document-text', color: colors.success, bg: colors.successSoft },
  LEAVE: { name: 'calendar', color: colors.info, bg: colors.infoSoft },
  NCR: { name: 'warning', color: colors.warning, bg: colors.warningSoft },
  BILLS_DUE: { name: 'wallet', color: colors.accent, bg: colors.accentSoft },
  PORTAL: { name: 'business', color: colors.info, bg: colors.infoSoft },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const api = useApi();
  const { refreshUnread } = useNotifications();
  const [busy, setBusy] = useState(false);
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<NotificationListDto>((a) => a.get('/notifications', { limit: 100 }), []);

  const open = useCallback(
    async (n: NotificationDto) => {
      if (!n.readAt) {
        setData((prev) => (prev ? { unreadCount: Math.max(0, prev.unreadCount - 1), items: prev.items.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)) } : prev));
        api.post(`/notifications/${n.id}/read`).then(() => refreshUnread()).catch(() => undefined);
      }
      router.push(notificationRoute({ type: n.type, entityType: n.entityType, entityId: n.entityId, projectId: n.projectId }) as never);
    },
    [api, router, setData, refreshUnread],
  );

  const markAll = async () => {
    setBusy(true);
    try {
      await api.post('/notifications/read-all');
      setData((prev) => (prev ? { unreadCount: 0, items: prev.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) } : prev));
      await refreshUnread();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          items.length ? (
            <View style={styles.headerRow}>
              <Text style={typography.caption}>{unread ? `${unread} unread` : 'All read'}</Text>
              {unread ? <Button title="Mark all read" variant="ghost" size="sm" icon="checkmark-done" onPress={markAll} loading={busy} /> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState title="No notifications yet" subtitle="You will be told here when your submissions are approved, rejected or need changes." icon="notifications-off-outline" />}
        renderItem={({ item }) => <Row item={item} onPress={() => open(item)} />}
      />
    </Screen>
  );
}

function Row({ item, onPress }: { item: NotificationDto; onPress: () => void }) {
  const icon = ICON[item.type];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !item.readAt && styles.unread, pressed && styles.pressed]} android_ripple={{ color: colors.border }}>
      <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
        <Ionicons name={icon.name} size={22} color={icon.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !item.readAt && styles.titleUnread]} numberOfLines={2}>
            {item.title}
          </Text>
          {!item.readAt ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.text} numberOfLines={3}>
          {item.body}
        </Text>
        <Text style={styles.meta}>
          {NOTIFICATION_TYPE_LABELS[item.type]} · {timeAgo(item.createdAt)}
          {item.projectName ? ` · ${item.projectName}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, minHeight: 36 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.md },
  unread: { borderColor: colors.primary, borderWidth: 1 },
  pressed: { opacity: 0.85 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.body, flex: 1 },
  titleUnread: { fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  text: { ...typography.caption, color: colors.text },
  meta: { ...typography.caption, fontSize: 12 },
});
