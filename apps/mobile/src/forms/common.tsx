import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProjectSummary } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { Button, Screen, type LocalPhoto, type SelectOption } from '../components';
import { colors, spacing, typography } from '../theme';

/** Projects the user can submit against, as Select options. */
export function useProjectOptions() {
  const state = useFetch<ProjectSummary[]>((api) => api.get('/projects'), [], { refetchOnFocus: false });
  const options = useMemo<SelectOption[]>(() => (state.data ?? []).map((p) => ({ value: p.id, label: p.name, hint: `${p.code} · ${p.location ?? ''}`.replace(/ · $/, '') })), [state.data]);
  return { ...state, options };
}

export function photosUploading(photos: LocalPhoto[]) {
  return photos.some((p) => p.uploading);
}

export function photosFailed(photos: LocalPhoto[]) {
  return photos.some((p) => !!p.error);
}

export function attachmentIds(photos: LocalPhoto[]): string[] {
  return photos.map((p) => p.attachmentId).filter((id): id is string => !!id);
}

/** Full-screen success state shown after a submission is created. */
export function SubmitSuccess({ title, subtitle, detailHref, onAnother }: { title: string; subtitle: string; detailHref: string; onAnother?: () => void }) {
  const router = useRouter();
  return (
    <Screen style={styles.center} edges={['left', 'right', 'bottom']}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark" size={48} color="#fff" />
      </View>
      <Text style={[typography.h1, styles.text]}>{title}</Text>
      <Text style={[typography.body, styles.text, styles.sub]}>{subtitle}</Text>
      <View style={styles.actions}>
        <Button title="View submission" icon="open-outline" onPress={() => router.replace(detailHref)} />
        {onAnother ? <Button title="Submit another" variant="secondary" onPress={onAnother} /> : null}
        <Button title="Back to home" variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  text: { textAlign: 'center' },
  sub: { color: colors.textMuted, marginTop: spacing.sm },
  actions: { alignSelf: 'stretch', marginTop: spacing.xxl, gap: spacing.sm },
});
