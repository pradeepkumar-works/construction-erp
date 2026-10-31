import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import {
  MARKUP_KIND_LABELS,
  REVISION_STATUS_LABELS,
  canEditMarkup,
  canViewDrawingFile,
  drawingFileKind,
  isBuildable,
  marksForSheet,
  roundPoint,
  type AttachmentDto,
  type DocumentDetailDto,
  type DrawingMarkupDto,
} from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { useOffline } from '../../src/offline';
import { canSaveOffline, localUri, openPdf, savedFileIds } from '../../src/offline/drawings';
import { Button, Card, EmptyState, ErrorBanner, ErrorState, Input, Loading, Pill, Screen, Touchable, slopFor, useSnackbar } from '../../src/components';
import { BottomSheet, SheetActions, type SheetAction } from '../../src/components/BottomSheet';
import { absoluteUrl } from '../../src/config';
import { colors, fontSize, markupInk, maxFontScale, radius, spacing, toneIcon, touch, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

/** Where a mark sits for a dot on the phone: a pin's point, the middle of anything else. */
const centre = (m: DrawingMarkupDto) => {
  const xs = m.points.map((p) => p[0]);
  const ys = m.points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

/**
 * A drawing on the phone (item 109): its current revision, the file to open (saved on the phone or online), and the
 * marks made on it in the office or on site, with the open ones carried from earlier revisions. On a photo or scanned
 * drawing the marks show as numbered dots and a tap adds a comment pin; PDFs and CAD files are marked up on the web.
 */
export default function DrawingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const api = useApi();
  const { user } = useAuth();
  const { online } = useOffline();
  const snackbar = useSnackbar();
  const doc = useFetch<DocumentDetailDto>((a) => a.get(`/documents/${id}`), [id], { enabled: !!id, cacheKey: `document:${id}` });
  const marks = useFetch<DrawingMarkupDto[]>((a) => a.get(`/documents/${id}/markups`), [id], { enabled: !!id, cacheKey: `markups:${id}` });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<DrawingMarkupDto | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    void savedFileIds().then(setSaved);
  }, [doc.data]);

  const rev = doc.data?.current ?? null;
  const revisionIds = useMemo(() => (doc.data?.revisions ?? []).map((r) => r.id), [doc.data]);
  const files = (rev?.attachments ?? []).filter(canViewDrawingFile);
  const file: AttachmentDto | undefined = files[0];
  const isImage = !!file && drawingFileKind(file) === 'image';
  const fileIndex = file && rev ? rev.attachments.indexOf(file) : -1;
  const sheetMarks = useMemo(() => {
    if (!rev || !file) return [];
    const { own, carried } = marksForSheet(marks.data ?? [], revisionIds, { revisionId: rev.id, attachmentId: file.id, fileIndex, page: 1 }, true);
    return [...carried, ...own];
  }, [marks.data, revisionIds, rev, file, fileIndex]);
  // Everything on this revision's other pages and files, and anything carried, for the list.
  const listed = useMemo(() => {
    if (!rev) return [];
    const all = marks.data ?? [];
    const onRev = all.filter((m) => m.revisionId === rev.id);
    const carried = all.filter((m) => m.status === 'OPEN' && m.revisionId !== rev.id && revisionIds.indexOf(m.revisionId) > revisionIds.indexOf(rev.id));
    return [...carried, ...onRev].sort((a, b) => (a.status === b.status ? a.markupNo - b.markupNo : a.status === 'OPEN' ? -1 : 1));
  }, [marks.data, rev, revisionIds]);
  const open = listed.filter((m) => m.status === 'OPEN').length;

  const uriOf = (a: AttachmentDto) => (saved.has(a.id) && canSaveOffline ? localUri(a) : absoluteUrl(a.url));

  const openFile = async (a: AttachmentDto) => {
    const isSaved = saved.has(a.id);
    if (!isSaved && !online) return Alert.alert(t('Not saved on this phone'), t('Connect to the internet, or save the drawings offline when you have a signal.'));
    if (drawingFileKind(a) === 'image') return setZoomed(true);
    try {
      await openPdf(a, isSaved);
    } catch {
      Alert.alert(t('Could not open the drawing'), t('Install a PDF viewer, or open it online.'));
    }
  };

  const onTap = (x: number, y: number) => {
    if (!adding || !box.w) return;
    setDraft(roundPoint([x / box.w, y / box.h]));
    setNote('');
    setError(null);
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await marks.refresh();
      snackbar.show(done);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const savePin = async () => {
    if (!draft || !rev || !file) return;
    if (!note.trim()) return setError(t('Write the comment'));
    const ok = await run(
      () => api.post(`/documents/${id}/markups`, { id: Crypto.randomUUID(), revisionId: rev.id, attachmentId: file.id, page: 1, kind: 'PIN', points: [draft], color: 'RED', note: note.trim() }),
      t('Comment added to the drawing'),
    );
    if (ok) {
      setDraft(null);
      setAdding(false);
    }
  };

  const actions = (m: DrawingMarkupDto): SheetAction[] => {
    const edit = !!user && canEditMarkup(user.roleKey, m.createdById === user.id);
    if (!edit || !online) return [];
    return [
      m.status === 'OPEN'
        ? { label: t('Resolve'), icon: 'checkmark-circle-outline', onPress: () => void run(() => api.post(`/documents/${id}/markups/${m.id}/resolve`, {}), t('M{n} resolved', { n: m.markupNo })) }
        : { label: t('Reopen'), icon: 'refresh-outline', onPress: () => void run(() => api.post(`/documents/${id}/markups/${m.id}/reopen`, {}), t('M{n} reopened', { n: m.markupNo })) },
      {
        label: t('Delete'),
        icon: 'trash-outline',
        tone: 'danger',
        onPress: () =>
          Alert.alert(t('Delete M{n}?', { n: m.markupNo }), undefined, [
            { text: t('Cancel'), style: 'cancel' },
            { text: t('Delete'), style: 'destructive', onPress: () => void run(() => api.del(`/documents/${id}/markups/${m.id}`), t('M{n} deleted', { n: m.markupNo })) },
          ]),
      },
    ];
  };

  if (doc.loading && !doc.data) return <Loading />;
  if (doc.error && !doc.data) return <ErrorState message={doc.error} onRetry={doc.reload} />;
  if (!doc.data) return null;
  const d = doc.data;
  const buildable = rev ? isBuildable(rev.status) : false;
  const imgH = aspect && box.w ? box.w / aspect : 0;

  return (
    <Screen
      refreshing={doc.refreshing || marks.refreshing}
      onRefresh={() => {
        void doc.refresh();
        void marks.refresh();
      }}
    >
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
          {d.docNo} · {d.projectName}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{d.title}</Text>
        {rev ? (
          <View style={styles.pills}>
            <Pill text={t('Rev {rev}', { rev: rev.revision })} fg={colors.text} bg={colors.neutralSoft} />
            <Pill text={t(REVISION_STATUS_LABELS[rev.status])} fg={buildable ? colors.success : colors.warning} bg={buildable ? colors.successSoft : colors.warningSoft} icon={buildable ? toneIcon.done : toneIcon.warning} />
          </View>
        ) : null}
        {rev && !buildable ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.warn}>{t(rev.status === 'AS_BUILT' ? 'As-built record' : 'Not for construction')}</Text> : null}
      </View>

      {!rev || !rev.attachments.length ? (
        <EmptyState title={t('No file yet')} subtitle={t('The office adds the drawing file with its revision.')} icon="document-outline" />
      ) : isImage && file ? (
        <Card>
          <View
            style={[styles.sheet, { height: imgH || 240 }]}
            onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: imgH || e.nativeEvent.layout.height })}
            onStartShouldSetResponder={() => adding}
            onResponderRelease={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            accessible={adding}
            accessibilityLabel={adding ? t('Tap the drawing where the comment goes') : undefined}
          >
            <Image
              source={{ uri: uriOf(file) }}
              style={StyleSheet.absoluteFill}
              contentFit="fill"
              onLoad={(e) => {
                setAspect(e.source.width / e.source.height);
                setBox((b) => ({ ...b, h: b.w / (e.source.width / e.source.height) }));
              }}
              accessibilityLabel={t('{doc} Rev {rev}', { doc: d.docNo, rev: rev.revision })}
            />
            {sheetMarks.map((m) => {
              const [x, y] = centre(m);
              return (
                <Touchable
                  key={m.id}
                  onPress={() => setActionsFor(m)}
                  hitSlop={slopFor(32)}
                  accessibilityRole="button"
                  accessibilityLabel={t('Mark M{n}: {note}', { n: m.markupNo, note: m.note ?? t(MARKUP_KIND_LABELS[m.kind]) })}
                  style={[styles.dot, { left: x * box.w - 16, top: y * (imgH || box.h) - 16, backgroundColor: markupInk[m.color], opacity: m.status === 'RESOLVED' ? 0.5 : 1 }]}
                >
                  <Text style={styles.dotText} maxFontSizeMultiplier={1.2}>
                    {m.markupNo}
                  </Text>
                </Touchable>
              );
            })}
            {draft ? <View pointerEvents="none" style={[styles.dot, styles.draftDot, { left: draft[0] * box.w - 16, top: draft[1] * (imgH || box.h) - 16 }]} /> : null}
          </View>
          <View style={styles.row}>
            <Button title={t(adding ? 'Cancel' : 'Add a comment')} size="sm" variant="secondary" icon={adding ? 'close' : 'chatbox-ellipses-outline'} disabled={!online} onPress={() => (setAdding((a) => !a), setDraft(null))} style={styles.flex} />
            <Button title={t('Full screen')} size="sm" variant="secondary" icon="expand-outline" onPress={() => void openFile(file)} style={styles.flex} />
          </View>
          {adding && !draft ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.gap]}>{t('Tap the drawing where the comment goes')}</Text> : null}
          {!online ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.gap]}>{t('Comments need a connection.')}</Text> : null}
        </Card>
      ) : (
        <Card>
          {rev.attachments.map((a) => (
            <Button key={a.id} title={t('Open {file}', { file: a.fileName })} variant="secondary" icon={drawingFileKind(a) === 'pdf' ? 'document-text-outline' : 'download-outline'} onPress={() => void openFile(a)} style={styles.gapBottom} />
          ))}
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Comments, clouds and arrows on PDF and CAD drawings are added on the web. They are listed below.')}</Text>
        </Card>
      )}

      <ErrorBanner message={error ?? marks.error} />
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.h3, styles.gap]}>{t('Marks ({n} open)', { n: open })}</Text>
      {!listed.length ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('No marks on this drawing yet.')}</Text>
      ) : (
        listed.map((m) => (
          <Touchable key={m.id} accessibilityRole="button" onPress={() => setActionsFor(m)} style={styles.mark}>
            <View style={[styles.swatch, { backgroundColor: markupInk[m.color] }]} />
            <View style={styles.flex}>
              <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
                M{m.markupNo} · {t(MARKUP_KIND_LABELS[m.kind])}
                {m.revisionId !== rev?.id ? ` · ${t('from Rev {rev}', { rev: m.revision })}` : ''}
                {m.page > 1 ? ` · ${t('page {n}', { n: m.page })}` : ''}
              </Text>
              {m.note ? (
                <Text style={typography.body} maxFontSizeMultiplier={maxFontScale}>
                  {m.note}
                </Text>
              ) : null}
              <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
                {m.createdByName} · {formatDate(m.createdAt)}
                {m.rfiNo ? ` · ${m.rfiNo}` : ''}
              </Text>
            </View>
            {m.status === 'RESOLVED' ? <Pill text={t('Resolved')} fg={colors.success} bg={colors.successSoft} icon={toneIcon.done} /> : null}
          </Touchable>
        ))
      )}
      {marks.fromCache ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.gap]}>{t('Showing the list saved on this phone.')}</Text> : null}

      <BottomSheet visible={!!draft} onClose={() => setDraft(null)} title={t('Comment on the drawing')}>
        <Input label={t('Comment')} value={note} onChangeText={setNote} multiline placeholder={t('What to check or change')} error={error ?? undefined} maxLength={1000} />
        <Button title={t('Save comment')} icon="checkmark" loading={busy} onPress={() => void savePin()} />
      </BottomSheet>
      <BottomSheet visible={!!actionsFor} onClose={() => setActionsFor(null)} title={actionsFor ? `M${actionsFor.markupNo} · ${t(MARKUP_KIND_LABELS[actionsFor.kind])}` : undefined} subtitle={actionsFor?.note ?? undefined}>
        {actionsFor && actions(actionsFor).length ? (
          <SheetActions actions={actions(actionsFor)} onClose={() => setActionsFor(null)} />
        ) : (
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t(online ? 'Only whoever made this mark, or document control, can change it.' : 'Marks change with a connection.')}</Text>
        )}
      </BottomSheet>
      <Modal visible={zoomed && !!file} transparent animationType="fade" onRequestClose={() => setZoomed(false)}>
        <Touchable style={styles.lightbox} onPress={() => setZoomed(false)} accessibilityRole="button" accessibilityLabel={t('Close photo')}>
          {file ? <Image source={{ uri: uriOf(file) }} style={styles.full} contentFit="contain" /> : null}
          <View style={styles.lightboxClose}>
            <Ionicons name="close-circle" size={36} color={colors.onOverlay} />
          </View>
        </Touchable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { marginBottom: spacing.md, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  warn: { color: colors.warning, fontWeight: '700', fontSize: fontSize.small },
  sheet: { width: '100%', backgroundColor: markupInk.sheet, borderRadius: radius.sm, overflow: 'hidden' },
  dot: { position: 'absolute', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: markupInk.onInk },
  draftDot: { backgroundColor: markupInk.RED, opacity: 0.7 },
  dotText: { color: markupInk.onInk, fontWeight: '700', fontSize: fontSize.small },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  gap: { marginTop: spacing.md },
  gapBottom: { marginBottom: spacing.sm },
  mark: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm, minHeight: touch.min },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  lightbox: { flex: 1, backgroundColor: colors.scrimDeep, alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  lightboxClose: { position: 'absolute', top: 48, right: 20 },
});
