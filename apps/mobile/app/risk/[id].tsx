import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { RiskDto } from '@erp/shared';
import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, RISK_KIND_LABELS, RISK_LEVEL_LABELS, RISK_STATUS_LABELS, canEditRisk, riskLevel } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, Pill, Screen } from '../../src/components';
import { LEVEL_TONE, RISK_STATUS_TONE } from '../../src/components/riskTone';
import { colors, maxFontScale, spacing, toneIcon, typography } from '../../src/theme';
import { formatDate, formatDateTime } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

/** One delay or risk: rating, days lost, action and owner; the raiser, owner or an approver can close or reopen it. */
export default function RiskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const t = useT();
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<RiskDto>((a) => a.get(`/risks/${id}`), [id], { enabled: !!id });
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const level = riskLevel(data.score);
  const mayEdit = !!user && canEditRisk(user, data);
  const change = async (body: Record<string, unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await api.patch<RiskDto>(`/risks/${data.id}`, body));
      setClosing(false);
      setNote('');
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
          {data.riskNo} · {t(RISK_KIND_LABELS[data.kind])} · {data.projectName}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{data.title}</Text>
        <View style={styles.pills}>
          <Pill text={t(RISK_STATUS_LABELS[data.status])} {...RISK_STATUS_TONE[data.status]} />
          <Pill text={`${t('Score {n}', { n: data.score })} · ${t(RISK_LEVEL_LABELS[level])}`} {...LEVEL_TONE[level]} />
          {data.overdue ? <Pill text={t('Action overdue')} fg={colors.danger} bg={colors.dangerSoft} icon={toneIcon.alert} /> : null}
        </View>
      </View>
      <ErrorBanner message={actionError} />
      {data.kind === 'DELAY' ? (
        <Card title={t('Delay')}>
          <View style={styles.daysBox}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.days}>{data.daysLost ?? 0}</Text>
            <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{data.daysLost === 1 ? t(data.delayEnd ? 'day lost' : 'day lost so far') : t(data.delayEnd ? 'days lost' : 'days lost so far')}</Text>
          </View>
          <KeyValue label={t('Held up since')} value={formatDate(data.delayStart)} />
          <KeyValue label={t('Resumed on')} value={data.delayEnd ? formatDate(data.delayEnd) : t('Still held up')} />
          <KeyValue label={t('Caused by')} value={data.responsibleParty ? t(DELAY_PARTY_LABELS[data.responsibleParty]) : null} />
          <KeyValue label={t('Extension of time')} value={t(data.eotClaimed ? 'Claimed' : 'Not claimed')} />
        </Card>
      ) : null}
      <Card>
        <KeyValue label={t('Category')} value={t(RISK_CATEGORY_LABELS[data.category])} />
        <KeyValue label={t('Activity')} value={data.activityName} />
        <KeyValue label={t('Probability × impact')} value={`${data.probability} × ${data.impact}`} />
        <KeyValue label={t('Details')} value={data.description} multiline />
        <KeyValue label={t(data.kind === 'DELAY' ? 'Action' : 'Mitigation')} value={data.mitigation} multiline />
        <KeyValue label={t('Owner')} value={data.ownerName} />
        <KeyValue label={t('Due')} value={data.dueDate ? formatDate(data.dueDate) : null} />
        <KeyValue label={t('Raised by')} value={`${data.raisedByName}, ${formatDateTime(data.createdAt)}`} />
        {data.status === 'CLOSED' ? <KeyValue label={t('Closed')} value={`${formatDateTime(data.closedAt)}${data.closureNote ? `: ${data.closureNote}` : ''}`} multiline /> : null}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      {mayEdit ? (
        closing ? (
          <Card title={t('Close this entry')}>
            {data.kind === 'DELAY' && !data.delayEnd ? <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.gap]}>{t('The delay will be recorded as ending today.')}</Text> : null}
            <Input label={t('How was it resolved')} required value={note} onChangeText={setNote} multiline />
            <Button title={t('Close entry')} icon="checkmark-circle" onPress={() => change({ status: 'CLOSED', closureNote: note.trim() })} loading={busy} disabled={!note.trim()} />
            <Button title={t('Cancel')} variant="ghost" onPress={() => setClosing(false)} />
          </Card>
        ) : (
          <View style={styles.actions}>
            {data.status === 'CLOSED' ? (
              <Button title={t('Reopen')} icon="refresh" variant="secondary" onPress={() => change({ status: 'OPEN' })} loading={busy} style={styles.flex} />
            ) : (
              <Button title={t('Close')} icon="checkmark-circle" onPress={() => setClosing(true)} style={styles.flex} />
            )}
            <Button title={t('Update')} icon="create" variant="secondary" onPress={() => router.push(`/risk/new?editId=${data.id}`)} style={styles.flex} />
          </View>
        )
      ) : null}
      <Button title={t('Open project')} variant="ghost" icon="business-outline" onPress={() => router.push(`/project/${data.projectId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  daysBox: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.dangerSoft, borderRadius: 12 },
  days: { fontSize: 32, fontWeight: '800', color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  flex: { flex: 1 },
  gap: { marginBottom: spacing.sm },
});
