import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { DOCUMENT_DISCIPLINE_LABELS, REVISION_STATUS_LABELS, isBuildable, type AttachmentDto, type DocumentDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { useOffline } from '../src/offline';
import { canSaveOffline, localUri, openPdf, saveProjectFiles, savedFileIds } from '../src/offline/drawings';
import { useProjectOptions } from '../src/forms/common';
import { Button, EmptyState, ErrorBanner, Input, Loading, Pill, Screen, SectionTitle, Select } from '../src/components';
import { absoluteUrl } from '../src/config';
import { colors, radius, spacing, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';

const LAST_PROJECT = 'documents:lastProject';

/**
 * Drawings on site: the current revision of every drawing and document of a project, with a warning on anything not
 * for construction. "Save offline" keeps the files on the phone (and drops superseded ones), so they open without a signal.
 */
export default function DocumentsScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projects = useProjectOptions();
  const { online } = useOffline();
  // A "drawing issued" notification opens its project.
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [image, setImage] = useState<AttachmentDto | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_PROJECT).then((p) => p && setProjectId((cur) => cur ?? p));
  }, []);
  useEffect(() => {
    const first = projects.options[0]?.value;
    if (!projectId && first) setProjectId(first);
    if (projectId && projects.data && !projects.options.some((o) => o.value === projectId) && first) setProjectId(first);
  }, [projectId, projects.options, projects.data]);

  const docs = useFetch<DocumentDto[]>((a) => a.get('/documents/site', { projectId: projectId! }), [projectId], { cacheKey: `documents:${projectId}`, enabled: !!projectId });
  const refreshSaved = useCallback(() => {
    void savedFileIds().then(setSaved);
  }, []);
  useEffect(refreshSaved, [refreshSaved, docs.data]);

  const files = useMemo(() => (docs.data ?? []).flatMap((d) => d.current?.attachments ?? []), [docs.data]);
  const missing = files.filter((f) => !saved.has(f.id)).length;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (docs.data ?? []).filter((d) => !q || `${d.docNo} ${d.title}`.toLowerCase().includes(q));
    const groups = new Map<string, DocumentDto[]>();
    for (const d of list) groups.set(d.discipline, [...(groups.get(d.discipline) ?? []), d]);
    return [...groups.entries()];
  }, [docs.data, search]);

  const saveAll = async () => {
    if (!projectId) return;
    setSaving('Starting…');
    try {
      const r = await saveProjectFiles(projectId, files, (done, total) => setSaving(`Saving ${done} of ${total}…`));
      refreshSaved();
      if (r.failed) Alert.alert('Some drawings were not saved', `${r.failed} file${r.failed > 1 ? 's' : ''} could not be downloaded. Try again with a better signal.`);
    } finally {
      setSaving(null);
    }
  };

  const open = async (d: DocumentDto) => {
    const f = d.current?.attachments[0];
    if (!f) return Alert.alert('No file', `${d.docNo} Rev ${d.current?.revision ?? ''} has no file attached yet.`);
    const isSaved = saved.has(f.id);
    if (!isSaved && !online) return Alert.alert('Not saved on this phone', 'Connect to the internet, or save the drawings offline when you have a signal.');
    if (f.mimeType.startsWith('image/')) return setImage(f);
    try {
      await openPdf(f, isSaved);
    } catch {
      Alert.alert('Could not open the drawing', 'Install a PDF viewer, or open it online.');
    }
  };

  return (
    <Screen
      refreshing={docs.refreshing}
      onRefresh={() => {
        void docs.refresh();
      }}
    >
      <Select
        label="Project"
        value={projectId}
        options={projects.options}
        onChange={(v) => {
          setProjectId(v);
          void AsyncStorage.setItem(LAST_PROJECT, v);
        }}
        searchable
      />
      <Input placeholder="Search number or title" value={search} onChangeText={setSearch} autoCorrect={false} />
      {canSaveOffline && files.length ? (
        <View style={styles.offline}>
          <Ionicons name={missing ? 'cloud-download-outline' : 'checkmark-circle'} size={20} color={missing ? colors.textMuted : colors.success} />
          <Text style={[typography.caption, styles.flex]}>{missing ? `${files.length - missing} of ${files.length} drawings saved on this phone` : 'All current drawings saved on this phone'}</Text>
          {missing ? <Button title={saving ?? 'Save offline'} size="sm" variant="secondary" icon="download-outline" loading={!!saving} disabled={!online || !!saving} onPress={() => void saveAll()} /> : null}
        </View>
      ) : null}
      <ErrorBanner message={docs.error} />
      {docs.loading && !docs.data ? (
        <Loading />
      ) : !shown.length ? (
        <EmptyState title={search ? 'Nothing matches' : 'No drawings yet'} subtitle="Drawings issued to this project show here with their current revision." icon="document-outline" />
      ) : (
        shown.map(([discipline, list]) => (
          <View key={discipline}>
            <SectionTitle title={DOCUMENT_DISCIPLINE_LABELS[discipline as DocumentDto['discipline']]} />
            {list.map((d) => {
              const cur = d.current!;
              const buildable = isBuildable(cur.status);
              const f = cur.attachments[0];
              return (
                <Pressable key={d.id} onPress={() => void open(d)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={typography.caption}>
                      {d.docNo} · Rev {cur.revision} · {formatDate(cur.issuedOn)}
                    </Text>
                    <Text style={styles.title} numberOfLines={2}>
                      {d.title}
                    </Text>
                    {!buildable ? <Text style={styles.warn}>{cur.status === 'AS_BUILT' ? 'As-built record' : 'Not for construction'}</Text> : null}
                    {cur.remarks ? (
                      <Text style={typography.caption} numberOfLines={2}>
                        {cur.remarks}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.side}>
                    <Pill text={REVISION_STATUS_LABELS[cur.status]} fg={buildable ? colors.success : colors.warning} bg={buildable ? colors.successSoft : colors.warningSoft} />
                    {f ? <Ionicons name={saved.has(f.id) ? 'phone-portrait-outline' : 'cloud-outline'} size={18} color={saved.has(f.id) ? colors.success : colors.textMuted} accessibilityLabel={saved.has(f.id) ? 'Saved on this phone' : 'Online only'} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
      {docs.fromCache ? <Text style={[typography.caption, styles.center]}>Showing the list saved on this phone.</Text> : null}
      <Modal visible={!!image} transparent animationType="fade" onRequestClose={() => setImage(null)}>
        <Pressable style={styles.lightbox} onPress={() => setImage(null)}>
          {image ? <Image source={{ uri: saved.has(image.id) && canSaveOffline ? localUri(image) : absoluteUrl(image.url) }} style={styles.full} contentFit="contain" /> : null}
          <View style={styles.lightboxClose}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center', marginTop: spacing.md },
  offline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  pressed: { opacity: 0.7 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text, marginVertical: 2 },
  warn: { color: colors.warning, fontWeight: '700', fontSize: 12 },
  side: { alignItems: 'flex-end', gap: 6 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  lightboxClose: { position: 'absolute', top: 48, right: 20 },
});
