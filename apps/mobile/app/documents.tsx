import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DOCUMENT_DISCIPLINE_LABELS, REVISION_STATUS_LABELS, isBuildable, type DocumentDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { useOffline } from '../src/offline';
import { canSaveOffline, saveProjectFiles, savedFileIds } from '../src/offline/drawings';
import { useProjectOptions } from '../src/forms/common';
import { Button, EmptyState, ErrorBanner, Input, Loading, Pill, Screen, SectionTitle, Select, Touchable } from '../src/components';
import { colors, fontSize, maxFontScale, radius, spacing, toneIcon, touch, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

const LAST_PROJECT = 'documents:lastProject';

/**
 * Drawings on site: the current revision of every drawing and document of a project, with a warning on anything not
 * for construction and its open marks. "Save offline" keeps the files on the phone (and drops superseded ones), so they open
 * without a signal; a tap opens the drawing with its marks (`drawing/[id]`).
 */
export default function DocumentsScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const router = useRouter();
  const projects = useProjectOptions();
  const t = useT();
  const { online } = useOffline();
  // A "drawing issued" notification opens its project.
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

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
    setSaving(t('Starting…'));
    try {
      const r = await saveProjectFiles(projectId, files, (done, total) => setSaving(t('Saving {done} of {total}…', { done, total })));
      refreshSaved();
      if (r.failed) Alert.alert(t('Some drawings were not saved'), r.failed > 1 ? t('{n} files could not be downloaded. Try again with a better signal.', { n: r.failed }) : t('1 file could not be downloaded. Try again with a better signal.'));
    } finally {
      setSaving(null);
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
        label={t('Project')}
        value={projectId}
        options={projects.options}
        onChange={(v) => {
          setProjectId(v);
          void AsyncStorage.setItem(LAST_PROJECT, v);
        }}
        searchable
      />
      <Input returnKeyType="search" placeholder={t('Search number or title')} accessibilityLabel={t('Search drawings by number or title')} value={search} onChangeText={setSearch} autoCorrect={false} />
      {canSaveOffline && files.length ? (
        <View style={styles.offline}>
          <Ionicons name={missing ? 'cloud-download-outline' : 'checkmark-circle'} size={20} color={missing ? colors.textMuted : colors.success} />
          <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.flex]}>{missing ? t('{saved} of {total} drawings saved on this phone', { saved: files.length - missing, total: files.length }) : t('All current drawings saved on this phone')}</Text>
          {missing ? <Button title={saving ?? t('Save offline')} size="sm" variant="secondary" icon="download-outline" loading={!!saving} disabled={!online || !!saving} onPress={() => void saveAll()} /> : null}
        </View>
      ) : null}
      <ErrorBanner message={docs.error} />
      {docs.loading && !docs.data ? (
        <Loading />
      ) : !shown.length ? (
        <EmptyState title={t(search ? 'Nothing matches' : 'No drawings yet')} subtitle={t('Drawings issued to this project show here with their current revision.')} icon="document-outline" />
      ) : (
        shown.map(([discipline, list]) => (
          <View key={discipline}>
            <SectionTitle title={t(DOCUMENT_DISCIPLINE_LABELS[discipline as DocumentDto['discipline']])} />
            {list.map((d) => {
              const cur = d.current!;
              const buildable = isBuildable(cur.status);
              const f = cur.attachments[0];
              return (
                <Touchable key={d.id} accessibilityRole="button" onPress={() => router.push(`/drawing/${d.id}`)} style={styles.row}>
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                      {d.docNo} · {t('Rev {rev}', { rev: cur.revision })} · {formatDate(cur.issuedOn)}
                    </Text>
                    <Text maxFontSizeMultiplier={maxFontScale} style={styles.title} numberOfLines={2}>
                      {d.title}
                    </Text>
                    {!buildable ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.warn}>{t(cur.status === 'AS_BUILT' ? 'As-built record' : 'Not for construction')}</Text> : null}
                    {cur.remarks ? (
                      <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption} numberOfLines={2}>
                        {cur.remarks}
                      </Text>
                    ) : null}
                    {d.openMarkups ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.marks}>{d.openMarkups === 1 ? t('1 open mark') : t('{n} open marks', { n: d.openMarkups })}</Text> : null}
                  </View>
                  <View style={styles.side}>
                    <Pill text={t(REVISION_STATUS_LABELS[cur.status])} fg={buildable ? colors.success : colors.warning} bg={buildable ? colors.successSoft : colors.warningSoft} icon={buildable ? toneIcon.done : toneIcon.warning} />
                    {f ? <Ionicons name={saved.has(f.id) ? 'phone-portrait-outline' : 'cloud-outline'} size={18} color={saved.has(f.id) ? colors.success : colors.textMuted} accessibilityLabel={t(saved.has(f.id) ? 'Saved on this phone' : 'Online only')} /> : null}
                  </View>
                </Touchable>
              );
            })}
          </View>
        ))
      )}
      {docs.fromCache ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.center]}>{t('Showing the list saved on this phone.')}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center', marginTop: spacing.md },
  offline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, minHeight: touch.min },
  pressed: { opacity: 0.7 },
  title: { fontSize: fontSize.body, fontWeight: '600', color: colors.text, marginVertical: 2 },
  warn: { color: colors.warning, fontWeight: '700', fontSize: fontSize.small },
  marks: { color: colors.primary, fontWeight: '600', fontSize: fontSize.small },
  side: { alignItems: 'flex-end', gap: 6 },
});
