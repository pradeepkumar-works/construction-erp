import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, EmptyState, Screen, SubmissionRow } from '../src/components';
import { useOffline, type OutboxItem } from '../src/offline';
import { colors, spacing, typography } from '../src/theme';
import { timeAgo } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

const STATUS_TEXT: Record<OutboxItem['status'], string> = {
  PENDING: 'Waiting to send',
  SYNCING: 'Sending…',
  FAILED: 'Not accepted',
};

/** Entries saved on this phone while offline, with retry / discard for ones the server refused. */
export default function OutboxScreen() {
  const { items, online, syncing, sync, retry, discard } = useOffline();
  const t = useT();

  const confirmDiscard = (item: OutboxItem) =>
    Alert.alert(t('Discard entry'), t('This entry has not reached the server and will be deleted from this phone.'), [
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
              <Text style={[typography.bodyStrong, styles.flex]}>{online ? (syncing ? t('Sending queued entries…') : t('Online')) : t('Offline: entries will send when the connection is back')}</Text>
            </View>
            {items.length ? <Button title={t('Send now')} icon="cloud-upload-outline" variant="secondary" onPress={() => void sync()} disabled={!online || syncing} /> : null}
          </Card>
        }
        ListEmptyComponent={<EmptyState title={t('Outbox is empty')} subtitle={t('Entries you save without a connection wait here until they are sent.')} icon="cloud-done-outline" art="approved" />}
        renderItem={({ item }) => (
          <View>
            <SubmissionRow type={item.type} title={item.title} subtitle={item.subtitle} meta={`${t(STATUS_TEXT[item.status])} · ${t('saved {ago}', { ago: timeAgo(item.createdAt) })}`} onPress={() => (item.status === 'FAILED' ? confirmDiscard(item) : undefined)} />
            {item.status === 'FAILED' ? (
              <View style={styles.failed}>
                <Text style={styles.error}>{item.error}</Text>
                <View style={styles.actions}>
                  <Button title={t('Retry')} size="sm" variant="secondary" icon="refresh" onPress={() => void retry(item.id)} />
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  flex: { flex: 1 },
  failed: { marginTop: -spacing.xs, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
