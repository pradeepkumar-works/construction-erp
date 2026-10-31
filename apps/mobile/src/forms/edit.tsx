import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AttachmentDto, SubmissionBase } from '@erp/shared';
import { absoluteUrl } from '../config';
import type { LocalPhoto } from '../components';
import { useOffline, type OutboxItem, type OutboxPhoto } from '../offline';
import { colors, maxFontScale, radius, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';

/** Existing attachments shown in the PhotoPicker as already-uploaded photos (so they can be kept or removed). */
export function attachmentsToPhotos(attachments: AttachmentDto[]): LocalPhoto[] {
  return attachments.map((a) => ({ key: a.id, uri: absoluteUrl(a.url), name: a.fileName, type: a.mimeType, attachmentId: a.id, uploading: false }));
}

/**
 * An outbox entry the server refused, opened in its form by "Fix and send" (`?outboxId=`, UX item 80). The form fills
 * itself from `payload`, sends with the entry's own id, and the outbox entry goes when it is sent (or is replaced when
 * it is queued again).
 */
export function useOutboxEntry(outboxId: string | null | undefined): OutboxItem | null {
  const { items } = useOffline();
  return outboxId ? (items.find((i) => i.id === outboxId) ?? null) : null;
}

/** An outbox entry's photos back in the PhotoPicker: uploaded ones keep their attachment, the rest wait to upload. */
export function outboxToPhotos(photos: OutboxPhoto[]): LocalPhoto[] {
  return photos.map((p, i) => ({ key: `${i}-${p.name}`, uri: p.uri, name: p.name, type: p.type, attachmentId: p.attachmentId, uploading: false, queued: !p.attachmentId }));
}

/** Why the server refused an outbox entry, above its form. */
export function OutboxRefusal({ item }: { item: OutboxItem | null }) {
  const t = useT();
  if (!item?.error) return null;
  return (
    <View style={[styles.note, styles.refused]}>
      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
      <View style={styles.body}>
        <Text maxFontSizeMultiplier={maxFontScale} style={[styles.label, styles.refusedLabel]}>{t('Refused')}</Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>{item.error}</Text>
      </View>
    </View>
  );
}

/** The approver's note shown above the form while editing a rejected / changes-requested entry. */
export function ReviewerNote({ entry }: { entry: SubmissionBase | null }) {
  const t = useT();
  if (!entry?.reviewNote) return null;
  return (
    <View style={styles.note}>
      <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.warning} />
      <View style={styles.body}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.label}>{entry.reviewedByName ? t('{name} asked', { name: entry.reviewedByName }) : t('Reviewer note')}</Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>{entry.reviewNote}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  body: { flex: 1 },
  label: { ...typography.label, color: colors.warning, marginBottom: 2 },
  refused: { backgroundColor: colors.dangerSoft },
  refusedLabel: { color: colors.danger },
});
