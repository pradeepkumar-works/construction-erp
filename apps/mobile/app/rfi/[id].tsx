import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { RfiDto } from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, Card, ErrorState, KeyValue, Loading, Pill, Screen } from '../../src/components';
import { rfiStatus } from '../../src/components/rfiTone';
import { colors, maxFontScale, spacing, toneIcon, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

/** One RFI on the phone: the question, our proposal and the answer once it comes. Answers are recorded in the office or by the client. */
export default function RfiScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<RfiDto>((a) => a.get(`/rfis/${id}`), [id], { enabled: !!id, cacheKey: `rfi:${id}` });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const st = rfiStatus(data.status, data.age, t);
  const days = (n: number) => (n === 1 ? t('1 day') : t('{n} days', { n }));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
          {data.rfiNo} · {data.projectName}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{data.subject}</Text>
        <View style={styles.pills}>
          <Pill text={st.text} fg={st.fg} bg={st.bg} icon={st.icon} />
          {data.priority === 'URGENT' ? <Pill text={t('Urgent')} fg={colors.danger} bg={colors.dangerSoft} icon={toneIcon.warning} /> : null}
        </View>
      </View>
      <Card title={t('Question')}>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>{data.question}</Text>
        {data.proposal ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={[typography.body, styles.gap]}>
            <Text maxFontSizeMultiplier={maxFontScale} style={typography.bodyStrong}>{t('Our proposal')}: </Text>
            {data.proposal}
          </Text>
        ) : null}
      </Card>
      <Card>
        <KeyValue label={t('Addressed to')} value={data.toParty} />
        <KeyValue label={t('Raised')} value={`${formatDate(data.raisedOn)} · ${data.raisedByName}`} />
        <KeyValue label={t('Answer needed by')} value={formatDate(data.replyBy)} />
        <KeyValue label={t('Location')} value={data.location} />
        <KeyValue label={t('Drawing')} value={data.documentLabel} />
        <KeyValue label={t('BOQ item')} value={data.boqItemLabel} />
      </Card>
      <Card title={t('Answer')}>
        {data.answer ? (
          <>
            <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>{data.answer}</Text>
            <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.gap]}>
              {data.answeredByName} · {formatDate(data.answeredOn)}
              {data.answerRef ? ` · ${data.answerRef}` : ''}
            </Text>
          </>
        ) : (
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{data.status === 'WITHDRAWN' ? t('Withdrawn before an answer.') : t('Not answered yet. Waiting {days}.', { days: days(data.age.daysOpen) })}</Text>
        )}
        {data.closedOn ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.gap]}>
            {t(data.status === 'WITHDRAWN' ? 'Withdrawn on {date}' : 'Closed on {date}', { date: formatDate(data.closedOn) })}
            {data.closeNote ? `: ${data.closeNote}` : ''}
          </Text>
        ) : null}
      </Card>
      {data.attachments.length ? (
        <Card title={t('Photos')}>
          <AttachmentGallery attachments={data.attachments} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  gap: { marginTop: spacing.sm },
});
