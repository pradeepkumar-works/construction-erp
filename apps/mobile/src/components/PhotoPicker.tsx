import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../api/hooks';
import { errorMessage } from '../api/client';
import { isOfflineError, useOffline } from '../offline/OfflineContext';
import { shrinkPhoto } from '../offline/shrink';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { formatDateTime, formatTime } from '../utils/format';
import { captureTime, stampedName, takenAtFromName } from '../utils/photoTime';
import { slopFor, Touchable } from './Touchable';

export interface LocalPhoto {
  key: string;
  uri: string;
  name: string;
  type: string;
  /** Set once uploaded to POST /uploads. */
  attachmentId?: string;
  uploading: boolean;
  error?: string;
  /** No connection: kept on the phone and uploaded when the queued entry is sent. */
  queued?: boolean;
}

/** When a photo was taken, from the time stamped into its name (`takenAtFromName`), or null for an older photo. */
export const photoTakenAt = (p: Pick<LocalPhoto, 'name'>) => takenAtFromName(p.name);

interface Props {
  label?: string;
  photos: LocalPhoto[];
  onChange: React.Dispatch<React.SetStateAction<LocalPhoto[]>>;
  max?: number;
}

let shot = 0;

function guessType(uri: string, mime?: string | null): string {
  if (mime) return mime;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

/**
 * Camera + library picker that uploads each photo immediately and keeps the returned attachment ids.
 * Without a connection the photo stays on the phone (`queued`) and travels with the entry through the outbox.
 *
 * Several at a time (UX item 88): the library picks many in one go, and the camera opens again after each shot until
 * Back is pressed, so a walk round the site is one tap. Each photo keeps the time it was taken (the camera's EXIF time,
 * or the moment of the shot) in its file name, shown on its thumbnail and kept with the attachment.
 */
export function PhotoPicker({ label, photos, onChange, max = 10 }: Props) {
  const api = useApi();
  const t = useT();
  const { online } = useOffline();
  const [busy, setBusy] = useState(false);
  // How many photos are in the form, for the camera loop (which runs past the render that started it).
  const count = useRef(photos.length);
  count.current = photos.length;

  const upload = useCallback(
    async (photo: LocalPhoto) => {
      if (!online) {
        onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, uploading: false, queued: true, error: undefined } : p)));
        return;
      }
      try {
        const att = await api.upload({ uri: photo.uri, name: photo.name, type: photo.type });
        onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, uploading: false, attachmentId: att.id, error: undefined, queued: false } : p)));
      } catch (e) {
        if (isOfflineError(e)) {
          onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, uploading: false, queued: true, error: undefined } : p)));
          return;
        }
        onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, uploading: false, error: errorMessage(e) } : p)));
      }
    },
    [api, online, onChange],
  );

  /** Adds picked photos (as many as there is room for); resolves to how many were added. */
  const addAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], fromCamera: boolean) => {
      const room = Math.max(0, max - count.current);
      const fresh: LocalPhoto[] = [];
      for (const [i, a] of assets.slice(0, room).entries()) {
        const type = guessType(a.uri, a.mimeType);
        const ext = type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1];
        // A photo just taken was taken now; one from the library keeps its own time when the phone tells us it.
        const takenAt = fromCamera ? captureTime(a.exif) : captureTime(a.exif, new Date(NaN));
        shot += 1;
        const name = Number.isNaN(takenAt.getTime()) ? (a.fileName ?? `site-photo-${Date.now()}-${i}.${ext}`) : stampedName(takenAt, shot, ext);
        const small = await shrinkPhoto({ uri: a.uri, width: a.width, height: a.height, name, type });
        fresh.push({ key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`, uri: small.uri, name: small.name, type: small.type, uploading: true });
      }
      if (!fresh.length) return 0;
      count.current += fresh.length;
      onChange((prev) => [...prev, ...fresh]);
      fresh.forEach((p) => void upload(p));
      return fresh.length;
    },
    [max, onChange, upload],
  );

  const takePhoto = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('Camera permission needed'), t('Allow camera access to take site photos.'));
        return;
      }
      // Shot after shot: the camera comes back after each photo until Back is pressed or the form is full.
      while (count.current < max) {
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: true });
        if (res.canceled || !(await addAssets(res.assets, true))) break;
      }
    } catch (e) {
      Alert.alert(t('Camera unavailable'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [addAssets, max, t]);

  const pickFromLibrary = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('Photos permission needed'), t('Allow photo library access to attach pictures.'));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        exif: true,
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: Math.max(1, max - count.current),
      });
      if (!res.canceled) await addAssets(res.assets, false);
    } catch (e) {
      Alert.alert(t('Could not open photos'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [addAssets, max, t]);

  // Android may close the app while the camera is open; the photo taken then is handed back once the app restarts, to
  // the next photo field opened, which is the form with the reopened draft (UX item 80).
  const recovered = useRef(false);
  useEffect(() => {
    if (recovered.current) return;
    recovered.current = true;
    ImagePicker.getPendingResultAsync()
      .then((r) => {
        if (r && 'assets' in r && !r.canceled && r.assets?.length) void addAssets(r.assets, true);
      })
      .catch(() => undefined);
  }, [addAssets]);

  const remove = (key: string) => onChange((prev) => prev.filter((p) => p.key !== key));
  const retry = (photo: LocalPhoto) => {
    onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, uploading: true, error: undefined, queued: false } : p)));
    void upload({ ...photo, uploading: true, error: undefined, queued: false });
  };
  const full = photos.length >= max;
  const stateOf = (p: LocalPhoto) => (p.uploading ? t('uploading') : p.error ? t('upload failed') : p.queued ? t('waiting for connection') : t('uploaded'));

  return (
    <View style={styles.container}>
      <Text style={styles.label} maxFontSizeMultiplier={maxFontScale}>
        {label ?? t('Photos')} <Text maxFontSizeMultiplier={maxFontScale} style={styles.count}>({photos.length}/{max})</Text>
      </Text>
      <View style={styles.actions}>
        <Touchable onPress={takePhoto} disabled={busy || full} accessibilityRole="button" accessibilityHint={t('The camera opens again after each photo. Press Back when you are done.')} style={[styles.actionBtn, (busy || full) && styles.disabled]}>
          <Ionicons name="camera" size={22} color={colors.primary} />
          <Text style={styles.actionText} maxFontSizeMultiplier={maxFontScale}>
            {t('Camera')}
          </Text>
        </Touchable>
        <Touchable onPress={pickFromLibrary} disabled={busy || full} accessibilityRole="button" accessibilityHint={t('Pick several photos at once')} style={[styles.actionBtn, (busy || full) && styles.disabled]}>
          <Ionicons name="images" size={22} color={colors.primary} />
          <Text style={styles.actionText} maxFontSizeMultiplier={maxFontScale}>
            {t('Library')}
          </Text>
        </Touchable>
      </View>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {photos.map((p, i) => {
            const taken = photoTakenAt(p);
            const name = taken ? t('Photo {n} of {total}, taken {time}', { n: i + 1, total: photos.length, time: formatDateTime(taken) }) : t('Photo {n} of {total}', { n: i + 1, total: photos.length });
            return (
              <View key={p.key} style={styles.thumbWrap}>
                <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" accessible accessibilityRole="image" accessibilityLabel={`${name}, ${stateOf(p)}`} />
                {taken ? (
                  <Text style={styles.stamp} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {formatTime(taken)}
                  </Text>
                ) : null}
                {p.uploading ? (
                  <View style={styles.overlay}>
                    <ActivityIndicator color={colors.onOverlay} accessibilityLabel={t('uploading')} />
                  </View>
                ) : p.error ? (
                  <Touchable onPress={() => retry(p)} style={[styles.overlay, styles.overlayError]} accessibilityRole="button" accessibilityLabel={t('Retry upload of photo {n}', { n: i + 1 })}>
                    <Ionicons name="refresh" size={22} color={colors.onOverlay} />
                    <Text maxFontSizeMultiplier={maxFontScale} style={styles.overlayText}>{t('Retry')}</Text>
                  </Touchable>
                ) : p.queued ? (
                  <Touchable onPress={() => (online ? retry(p) : undefined)} style={styles.okMark} hitSlop={slopFor(18)} accessibilityRole="button" accessibilityLabel={t('Waiting for connection')} accessibilityHint={online ? t('Uploads it now') : undefined}>
                    <Ionicons name="cloud-offline" size={18} color={colors.warning} />
                  </Touchable>
                ) : (
                  <View style={styles.okMark}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  </View>
                )}
                <Touchable onPress={() => remove(p.key)} style={styles.removeBtn} hitSlop={8} borderless accessibilityRole="button" accessibilityLabel={t('Remove photo {n}', { n: i + 1 })}>
                  <Ionicons name="close" size={18} color={colors.onOverlay} />
                </Touchable>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.hint} maxFontSizeMultiplier={maxFontScale}>
          {online ? t('Optional. Photos upload immediately and are attached on submit.') : t('Optional. You are offline: photos stay on the phone and upload with the entry.')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.sm },
  count: { textTransform: 'none', fontWeight: '400' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.height,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  actionText: { marginLeft: spacing.sm, color: colors.primary, fontWeight: '700', fontSize: fontSize.body },
  disabled: { opacity: 0.5 },
  strip: { gap: spacing.sm, paddingTop: spacing.md },
  thumbWrap: { width: 104, height: 104, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.neutralSoft },
  thumb: { width: '100%', height: '100%' },
  stamp: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 2, borderTopLeftRadius: radius.sm, backgroundColor: colors.scrim, color: colors.onOverlay, fontSize: fontSize.small, fontWeight: '700', fontVariant: ['tabular-nums'] },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  overlayError: { backgroundColor: colors.scrimDeep, borderWidth: 3, borderColor: colors.danger, borderRadius: radius.md },
  overlayText: { color: colors.onOverlay, fontSize: fontSize.small, fontWeight: '700' },
  okMark: { position: 'absolute', left: 6, bottom: 6, backgroundColor: colors.surface, borderRadius: 10 },
  // 40 dp of visible button in the photo's corner; hitSlop takes the touch area to 56.
  removeBtn: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderBottomLeftRadius: radius.md, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  hint: { ...typography.caption, marginTop: spacing.sm },
});
