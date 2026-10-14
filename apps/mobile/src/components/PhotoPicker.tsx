import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../api/hooks';
import { errorMessage } from '../api/client';
import { isOfflineError, useOffline } from '../offline/OfflineContext';
import { shrinkPhoto } from '../offline/shrink';
import { colors, radius, spacing, typography } from '../theme';

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

interface Props {
  label?: string;
  photos: LocalPhoto[];
  onChange: React.Dispatch<React.SetStateAction<LocalPhoto[]>>;
  max?: number;
}

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
 */
export function PhotoPicker({ label = 'Photos', photos, onChange, max = 6 }: Props) {
  const api = useApi();
  const { online } = useOffline();
  const [busy, setBusy] = useState(false);

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

  const addAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]) => {
      const room = Math.max(0, max - photos.length);
      const fresh: LocalPhoto[] = [];
      for (const [i, a] of assets.slice(0, room).entries()) {
        const type = guessType(a.uri, a.mimeType);
        const ext = type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1];
        const small = await shrinkPhoto({ uri: a.uri, width: a.width, height: a.height, name: a.fileName ?? `site-photo-${Date.now()}-${i}.${ext}`, type });
        fresh.push({ key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`, uri: small.uri, name: small.name, type: small.type, uploading: true });
      }
      if (!fresh.length) return;
      onChange((prev) => [...prev, ...fresh]);
      fresh.forEach((p) => void upload(p));
    },
    [max, photos.length, onChange, upload],
  );

  const takePhoto = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access to take site photos.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!res.canceled) await addAssets(res.assets);
    } catch (e) {
      Alert.alert('Camera unavailable', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [addAssets]);

  const pickFromLibrary = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos permission needed', 'Allow photo library access to attach pictures.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, max - photos.length),
      });
      if (!res.canceled) await addAssets(res.assets);
    } catch (e) {
      Alert.alert('Could not open photos', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [addAssets, max, photos.length]);

  const remove = (key: string) => onChange((prev) => prev.filter((p) => p.key !== key));
  const retry = (photo: LocalPhoto) => {
    onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, uploading: true, error: undefined, queued: false } : p)));
    void upload({ ...photo, uploading: true, error: undefined, queued: false });
  };
  const full = photos.length >= max;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} <Text style={styles.count}>({photos.length}/{max})</Text>
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={takePhoto} disabled={busy || full} style={[styles.actionBtn, (busy || full) && styles.disabled]}>
          <Ionicons name="camera" size={22} color={colors.primary} />
          <Text style={styles.actionText}>Camera</Text>
        </Pressable>
        <Pressable onPress={pickFromLibrary} disabled={busy || full} style={[styles.actionBtn, (busy || full) && styles.disabled]}>
          <Ionicons name="images" size={22} color={colors.primary} />
          <Text style={styles.actionText}>Library</Text>
        </Pressable>
      </View>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {photos.map((p) => (
            <View key={p.key} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
              {p.uploading ? (
                <View style={styles.overlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : p.error ? (
                <Pressable onPress={() => retry(p)} style={[styles.overlay, styles.overlayError]}>
                  <Ionicons name="refresh" size={22} color="#fff" />
                  <Text style={styles.overlayText}>Retry</Text>
                </Pressable>
              ) : p.queued ? (
                <Pressable onPress={() => (online ? retry(p) : undefined)} style={styles.okMark} accessibilityLabel="Waiting for connection">
                  <Ionicons name="cloud-offline" size={18} color={colors.warning} />
                </Pressable>
              ) : (
                <View style={styles.okMark}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                </View>
              )}
              <Pressable onPress={() => remove(p.key)} style={styles.removeBtn} hitSlop={8} accessibilityLabel="Remove photo">
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.hint}>{online ? 'Optional. Photos upload immediately and are attached on submit.' : 'Optional. You are offline: photos stay on the phone and upload with the entry.'}</Text>
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
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  actionText: { marginLeft: spacing.sm, color: colors.primary, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  strip: { gap: spacing.sm, paddingTop: spacing.md },
  thumbWrap: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.neutralSoft },
  thumb: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  overlayError: { backgroundColor: 'rgba(220,38,38,0.7)' },
  overlayText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  okMark: { position: 'absolute', left: 6, bottom: 6, backgroundColor: '#fff', borderRadius: 10 },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  hint: { ...typography.caption, marginTop: spacing.sm },
});
