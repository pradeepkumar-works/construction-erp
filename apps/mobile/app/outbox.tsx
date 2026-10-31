import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, EmptyState, Screen, SubmissionRow } from '../src/components';
import { OUTBOX_FIX_PATH, useOffline, type OutboxItem } from '../src/offline';
import { colors, fontSize, maxFontScale, spacing, typography } from '../src/theme';
import { formatDateTime, timeAgo } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

const STATUS_TEXT: Record<OutboxItem['status'], string> = {
  PENDING: 'Waiting to send',
  SYNCING: 'Sending…',
  FAILED: 'Not accepted',
};

/** Entries saved on this phone while offline, with fix, retry and discard for ones the server refused. */
export default function OutboxScreen() {
  const { items, online, syncing, sync, retry, discard, lastSyncedAt, pendingCount, failedCount } = useOffline();
  const t = useT();
  const router = useRouter();
  const fix = (item: OutboxItem) => {
    const path = OUTBOX_FIX_PATH[item.type];
    if (path) router.push({ pathname: path as never, params: { outboxId: item.id } });
  };

  const confirmDiscard = (item: OutboxItem) =>
    Alert.alert(t('Discard entry'), t('This entry has not reached the office yet and will be deleted from this phone.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Discard'), style: 'destructive', onPress: () => void discard(item.id) },
    ]);

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Card>
            <View style={styles.head}>
              <Ionicons name={online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={22} color={online ? colors.success : colors.warning} />
              <Text maxFontSizeMultiplier={maxFontScale} style={[typography.bodyStrong, styles.flex]}>{online ? (syncing ? t('Sending queued entries…') : t('Online')) : t('Offline: entries will send when the connection is back')}</Text>
            </View>
            {items.length ? (
              <Text maxFontSizeMultiplier={maxFontScale} style={[typography.body, styles.count]} accessibilityLiveRegion="polite">
                {[pendingCount ? t('{n} waiting to send', { n: pendingCount }) : null, failedCount ? t('{n} need attention', { n: failedCount }) : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.synced]}>{lastSyncedAt ? t('Last sent {when}', { when: formatDateTime(lastSyncedAt) }) : t('Nothing sent from this phone yet')}</Text>
            {items.length ? <Button title={t('Send now')} icon="cloud-upload-outline" variant="secondary" onPress={() => void sync()} disabled={!online || syncing} /> : null}
          </Card>
        }
        ListEmptyComponent={<EmptyState title={t('Outbox is empty')} subtitle={t('Entries you save without a connection wait here until they are sent.')} icon="cloud-done-outline" art="approved" />}
        renderItem={({ item }) => (
          <View>
            <SubmissionRow type={item.type} title={item.title} subtitle={item.subtitle} meta={`${t(STATUS_TEXT[item.status])} · ${t('saved {ago}', { ago: timeAgo(item.createdAt) })}`} onPress={() => (item.status === 'FAILED' ? fix(item) : undefined)} />
            {item.status === 'FAILED' ? (
              <View style={styles.failed}>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.error}>{item.error}</Text>
                <View style={styles.actions}>
                  {OUTBOX_FIX_PATH[item.type] ? <Button title={t('Fix and send')} size="sm" icon="create-outline" onPress={() => fix(item)} /> : null}
                  <Button title={t('Send again')} size="sm" variant="secondary" icon="refresh" onPress={() => void retry(item.id)} />
                  <Button title={t('Discard')} size="sm" variant="ghost" icon="trash-outline" onPress={() => confirmDiscard(item)} />
                </View>
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { marginTop: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  flex: { flex: 1 },
  failed: { marginTop: -spacing.xs, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  error: { color: colors.danger, fontSize: fontSize.secondary, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  synced: { marginBottom: spacing.sm },
});
