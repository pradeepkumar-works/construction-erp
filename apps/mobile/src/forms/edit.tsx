import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AttachmentDto, SubmissionBase } from '@erp/shared';
import { absoluteUrl } from '../config';
import type { LocalPhoto } from '../components';
import { colors, radius, spacing, typography } from '../theme';

/** Existing attachments shown in the PhotoPicker as already-uploaded photos (so they can be kept or removed). */
export function attachmentsToPhotos(attachments: AttachmentDto[]): LocalPhoto[] {
  return attachments.map((a) => ({ key: a.id, uri: absoluteUrl(a.url), name: a.fileName, type: a.mimeType, attachmentId: a.id, uploading: false }));
}

/** The approver's note shown above the form while editing a rejected / changes-requested entry. */
export function ReviewerNote({ entry }: { entry: SubmissionBase | null }) {
  if (!entry?.reviewNote) return null;
  return (
    <View style={styles.note}>
      <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.warning} />
      <View style={styles.body}>
        <Text style={styles.label}>{entry.reviewedByName ? `${entry.reviewedByName} asked` : 'Reviewer note'}</Text>
        <Text style={typography.body}>{entry.reviewNote}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  body: { flex: 1 },
  label: { ...typography.label, color: colors.warning, marginBottom: 2 },
});
