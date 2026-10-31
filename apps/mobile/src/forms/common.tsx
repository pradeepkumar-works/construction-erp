import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProjectSummary } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { fetchProjects } from '../api/lists';
import { Button, Screen, confirmResult, type LocalPhoto, type SelectOption } from '../components';
import type { OutboxPhoto } from '../offline/types';
import { colors, maxFontScale, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';

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

/** Everything the outbox needs to upload (or reuse) each photo when the entry is sent; `line` for a DPR line's photos. */
export function toOutboxPhotos(photos: LocalPhoto[], line?: string): OutboxPhoto[] {
  return photos.filter((p) => !p.error).map((p) => ({ uri: p.uri, name: p.name, type: p.type, attachmentId: p.attachmentId, ...(line ? { line } : {}) }));
}

/** Full-screen success state shown after a submission is created. */
export function SubmitSuccess({ title, subtitle, detailHref, onAnother }: { title: string; subtitle: string; detailHref?: string; onAnother?: () => void }) {
  const router = useRouter();
  const t = useT();
  // A vibration and a spoken line, so the result is clear without reading the screen (UX item 80).
  useEffect(() => confirmResult(`${title}. ${subtitle}`), [title, subtitle]);
  return (
    <Screen style={styles.center} edges={['left', 'right', 'bottom']}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark" size={48} color={colors.textOnPrimary} />
      </View>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.h1, styles.text]}>{title}</Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.body, styles.text, styles.sub]}>{subtitle}</Text>
      <View style={styles.actions}>
        {detailHref ? <Button title={t('View submission')} icon="open-outline" onPress={() => router.replace(detailHref)} /> : null}
        {onAnother ? <Button title={t('Submit another')} variant="secondary" onPress={onAnother} /> : null}
        <Button title={t('Back to home')} variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
      </View>
    </Screen>
  );
}

/** Success state for an entry saved to the outbox because the phone is offline. */
export function QueuedSuccess({
  title,
  subtitle,
  onAnother,
  note,
}: {
  title: string;
  subtitle: string;
  onAnother?: () => void;
  note?: string;
}) {
  const router = useRouter();
  const t = useT();
  useEffect(() => confirmResult(`${title}. ${subtitle}`, 'info'), [title, subtitle]);
  return (
    <Screen style={styles.center} edges={['left', 'right', 'bottom']}>
      <View style={[styles.iconWrap, styles.iconQueued]}>
        <Ionicons name="cloud-upload-outline" size={48} color={colors.textOnPrimary} />
      </View>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.h1, styles.text]}>{title}</Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.body, styles.text, styles.sub]}>{subtitle}</Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.text, styles.sub]}>{note ?? t('It will be sent for approval automatically as soon as the phone is back online. You can check it under Outbox.')}</Text>
      <View style={styles.actions}>
        <Button title={t('View outbox')} icon="cloud-upload-outline" onPress={() => router.replace('/outbox')} />
        {onAnother ? <Button title={t('Submit another')} variant="secondary" onPress={onAnother} /> : null}
        <Button title={t('Back to home')} variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
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
