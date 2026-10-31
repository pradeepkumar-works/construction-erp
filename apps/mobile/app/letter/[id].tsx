import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { LetterDto } from '@erp/shared';
import { LETTER_ACTION_LABELS, LETTER_DIRECTION_LABELS, LETTER_MODE_LABELS, LETTER_STATUS_LABELS } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, Pill, Screen, useSnackbar } from '../../src/components';
import { LETTER_STATUS_TONE } from '../../src/components/letterTone';
import { colors, maxFontScale, spacing, toneIcon, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

/**
 * One letter on the phone (item 136): read it, close one marked to you once it is dealt with, or approve one waiting for
 * your signature (it gets its number then) or return it with what to change. Marking, writing and dispatch are on the web.
 */
export default function LetterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useT();
  const snackbar = useSnackbar();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<LetterDto>((a) => a.get(`/letters/${id}`), [id], { enabled: !!id, cacheKey: `letter:${id}` });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const run = async (path: string, body: object, done: (l: LetterDto) => string) => {
    setBusy(true);
    setActionError(null);
    try {
      const l = await api.post<LetterDto>(`/letters/${data.id}/${path}`, body);
      setData(l);
      setNote('');
      snackbar.show(done(l));
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const tone = LETTER_STATUS_TONE[data.status];
  const isIn = data.direction === 'IN';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
          {data.letterNo ?? t('Draft')} · {data.projectName ?? t('Head office')}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{data.subject}</Text>
        <View style={styles.pills}>
          <Pill text={t(LETTER_STATUS_LABELS[data.status])} fg={tone.fg} bg={tone.bg} icon={tone.icon} />
          {data.priority === 'URGENT' ? <Pill text={t('Urgent')} fg={colors.danger} bg={colors.dangerSoft} icon={toneIcon.warning} /> : null}
          {data.actionOverdue || data.overdue ? <Pill text={t('Overdue')} fg={colors.danger} bg={colors.dangerSoft} icon={toneIcon.alert} /> : null}
        </View>
      </View>
      <ErrorBanner message={actionError} />
      <Card>
        <KeyValue label={t(isIn ? 'From' : 'To')} value={data.party} multiline />
        <KeyValue label={t('Letter')} value={t(LETTER_DIRECTION_LABELS[data.direction])} />
        <KeyValue label={t('Dated')} value={formatDate(data.letterDate)} />
        <KeyValue label={t(isIn ? 'Their reference' : 'Reference')} value={data.theirRef} />
        <KeyValue label={t('Category')} value={data.categoryName} />
        <KeyValue label={t(isIn ? 'Came by' : 'Sent by')} value={data.mode ? t(LETTER_MODE_LABELS[data.mode]) : null} />
        <KeyValue label={t(isIn ? 'Reply needed by' : 'Their reply by')} value={data.replyBy ? formatDate(data.replyBy) : null} />
        {isIn && data.markedToName ? (
          <KeyValue label={t('With')} value={`${data.markedToName}, ${t(LETTER_ACTION_LABELS[data.action ?? 'REPLY'])}${data.actionDue ? ` · ${t('by {date}', { date: formatDate(data.actionDue) })}` : ''}`} multiline />
        ) : null}
        {!isIn ? <KeyValue label={t('Signed by')} value={data.signatoryName} /> : null}
      </Card>
      {data.marks.length ? (
        <Card title={t('Marked')}>
          {data.marks.map((m) => (
            <Text maxFontSizeMultiplier={maxFontScale} key={m.id} style={[typography.body, styles.gap]}>
              {t('{from} to {to}', { from: m.fromName, to: m.toName })} · {t(LETTER_ACTION_LABELS[m.action])}
              {m.note ? `: ${m.note}` : ''}
            </Text>
          ))}
        </Card>
      ) : null}
      {(isIn ? data.summary : data.body) ? (
        <Card title={t(isIn ? 'Gist' : 'Letter text')}>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>{isIn ? data.summary : data.body}</Text>
        </Card>
      ) : null}
      {isIn && data.status === 'OPEN' && data.can.close ? (
        <Card title={t('Close')}>
          <Input value={note} onChangeText={setNote} placeholder={t('How it was dealt with')} accessibilityLabel={t('How it was dealt with')} multiline />
          <Button title={t('Close the letter')} variant="success" icon="checkmark" onPress={() => run('close', { note: note.trim() || null }, (l) => t('{no} closed', { no: l.letterNo ?? '' }))} loading={busy} style={styles.mt} />
        </Card>
      ) : null}
      {data.can.sign ? (
        <Card title={t('Your signature')}>
          <Input value={note} onChangeText={setNote} placeholder={t('What to change, to return it')} accessibilityLabel={t('What to change, to return it')} multiline />
          <View style={styles.row}>
            <Button title={t('Approve and number')} variant="success" icon="checkmark" onPress={() => run('approve', {}, (l) => t('Signed: {no}', { no: l.letterNo ?? '' }))} loading={busy} style={styles.flex} />
            <Button
              title={t('Return')}
              variant="secondary"
              icon="arrow-undo-outline"
              onPress={() => (note.trim() ? run('return', { note: note.trim() }, () => t('Returned to the writer')) : setActionError(t('Say what to change')))}
              disabled={busy}
              style={styles.flex}
            />
          </View>
        </Card>
      ) : null}
      <AttachmentGallery attachments={data.attachments} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  mt: { marginTop: spacing.md },
  gap: { marginTop: spacing.xs },
});
