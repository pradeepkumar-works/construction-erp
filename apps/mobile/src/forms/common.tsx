import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProjectSummary } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { fetchProjects } from '../api/lists';
import { Button, Screen, type LocalPhoto, type SelectOption } from '../components';
import type { OutboxPhoto } from '../offline/types';
import { colors, spacing, typography } from '../theme';

/** Projects the user can submit against, as Select options (cached on the device for offline use). */
export function useProjectOptions() {
  const state = useFetch<ProjectSummary[]>(fetchProjects, [], { refetchOnFocus: false, cacheKey: 'projects' });
  const options = useMemo<SelectOption[]>(() => (state.data ?? []).map((p) => ({ value: p.id, label: p.name, hint: `${p.code} · ${p.location ?? ''}`.replace(/ · $/, '') })), [state.data]);
  return { ...state, options };
}

export function photosUploading(photos: LocalPhoto[]) {
  return photos.some((p) => p.uploading);
}

export function photosFailed(photos: LocalPhoto[]) {
  return photos.some((p) => !!p.error);
}

/** Photos kept on the phone because there was no connection when they were picked. */
export function photosQueued(photos: LocalPhoto[]) {
  return photos.some((p) => !p.attachmentId && !p.error && !p.uploading);
}

export function attachmentIds(photos: LocalPhoto[]): string[] {
  return photos.map((p) => p.attachmentId).filter((id): id is string => !!id);
}

/** Everything the outbox needs to upload (or reuse) each photo when the entry is sent. */
export function toOutboxPhotos(photos: LocalPhoto[]): OutboxPhoto[] {
  return photos.filter((p) => !p.error).map((p) => ({ uri: p.uri, name: p.name, type: p.type, attachmentId: p.attachmentId }));
}

/** Full-screen success state shown after a submission is created. */
export function SubmitSuccess({ title, subtitle, detailHref, onAnother }: { title: string; subtitle: string; detailHref?: string; onAnother?: () => void }) {
  const router = useRouter();
  return (
    <Screen style={styles.center} edges={['left', 'right', 'bottom']}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark" size={48} color="#fff" />
      </View>
      <Text style={[typography.h1, styles.text]}>{title}</Text>
      <Text style={[typography.body, styles.text, styles.sub]}>{subtitle}</Text>
      <View style={styles.actions}>
        {detailHref ? <Button title="View submission" icon="open-outline" onPress={() => router.replace(detailHref)} /> : null}
        {onAnother ? <Button title="Submit another" variant="secondary" onPress={onAnother} /> : null}
        <Button title="Back to home" variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
      </View>
    </Screen>
  );
}

/** Success state for an entry saved to the outbox because the phone is offline. */
export function QueuedSuccess({
  title,
  subtitle,
  onAnother,
  note = 'It will be sent for approval automatically as soon as the phone is back online. You can check it under Outbox.',
}: {
  title: string;
  subtitle: string;
  onAnother?: () => void;
  note?: string;
}) {
  const router = useRouter();
  return (
    <Screen style={styles.center} edges={['left', 'right', 'bottom']}>
      <View style={[styles.iconWrap, styles.iconQueued]}>
        <Ionicons name="cloud-upload-outline" size={48} color="#fff" />
      </View>
      <Text style={[typography.h1, styles.text]}>{title}</Text>
      <Text style={[typography.body, styles.text, styles.sub]}>{subtitle}</Text>
      <Text style={[typography.caption, styles.text, styles.sub]}>{note}</Text>
      <View style={styles.actions}>
        <Button title="View outbox" icon="cloud-upload-outline" onPress={() => router.replace('/outbox')} />
        {onAnother ? <Button title="Submit another" variant="secondary" onPress={onAnother} /> : null}
        <Button title="Back to home" variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  iconQueued: { backgroundColor: colors.warning },
  text: { textAlign: 'center' },
  sub: { color: colors.textMuted, marginTop: spacing.sm },
  actions: { alignSelf: 'stretch', marginTop: spacing.xxl, gap: spacing.sm },
});
