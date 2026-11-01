import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { AttachmentDto, PhotoCheckKind, PhotoChecksDto } from '@erp/shared';
import { absoluteUrl } from '../config';
import { useApi } from '../api/hooks';
import { colors, maxFontScale, radius, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { Card } from './Card';

/**
 * What Ask Nirmaan saw in a record's photos: a caption each, and flags such as workers without helmets.
 * Photos not looked at yet are checked when the screen opens, while Ask Nirmaan is on for the company. Advisory only.
 */
export function PhotoChecks({ kind, id, attachments }: { kind: PhotoCheckKind; id: string; attachments: AttachmentDto[] }) {
  const api = useApi();
  const t = useT();
  const photos = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const [data, setData] = useState<PhotoChecksDto | null>(null);
  const [busy, setBusy] = useState(false);
  const lastPending = useRef<number | null>(null);

  useEffect(() => {
    if (!photos.length) return;
    let live = true;
    api
      .get<PhotoChecksDto>(`/photo-checks/${kind}/${id}`)
      .then((d) => live && setData(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, kind, id, photos.length]);

  // Ask again while photos are left and the last run checked some; a failed run stops it quietly.
  useEffect(() => {
    if (!data?.available || !data.pending || busy || lastPending.current === data.pending) return;
    lastPending.current = data.pending;
    setBusy(true);
    api
      .post<PhotoChecksDto>(`/photo-checks/${kind}/${id}/run`)
      .then(setData)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [api, kind, id, data, busy]);

  if (!data || (!data.checks.length && !busy)) return null;
  const byPhoto = new Map(data.checks.map((c) => [c.attachmentId, c]));
  return (
    <Card title={t('Photo checks')}>
      <View style={styles.note}>
        <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} />
        <Text style={[typography.caption, styles.flex]} maxFontSizeMultiplier={maxFontScale}>
          {t('What Ask Nirmaan sees in the photos. It can be wrong and never holds up a submission.')}
        </Text>
      </View>
      {photos.map((p) => {
        const c = byPhoto.get(p.id);
        if (!c) return null;
        return (
          <View key={p.id} style={styles.row}>
            <Image source={{ uri: absoluteUrl(p.url) }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
            <View style={styles.flex}>
              <Text style={typography.body} maxFontSizeMultiplier={maxFontScale}>
                {c.caption ?? (c.status === 'DONE' ? t('No caption') : t(c.reason ?? 'Not checked'))}
              </Text>
              {c.flags.map((f) => (
                <View key={f.key} style={styles.flag} accessible accessibilityLabel={`${t(f.label)}. ${f.detail ?? ''} ${t('{n}% sure', { n: Math.round(f.confidence * 100) })}`}>
                  <Ionicons name="warning" size={16} color={colors.warning} style={styles.flagIcon} />
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.warning }]} maxFontSizeMultiplier={maxFontScale}>
                      {t(f.label)}
                    </Text>
                    <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
                      {f.detail ? `${f.detail}. ` : ''}
                      {t('{n}% sure', { n: Math.round(f.confidence * 100) })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })}
      {busy ? (
        <View style={styles.note}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('Ask Nirmaan is looking at the photos')}
          </Text>
        </View>
      ) : null}
      {data.flagsOff ? (
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {t('Photo flags are off on this project; captions still show.')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, minHeight: 56 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.border },
  flag: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  flagIcon: { marginTop: 2 },
});
