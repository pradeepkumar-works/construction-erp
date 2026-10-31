import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { IMPREST_ENTRY_KIND_LABELS, IMPREST_ENTRY_STATUS_LABELS, type ImprestDetailDto, type ImprestDto } from '@erp/shared';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, EmptyState, ErrorBanner, Input, KeyValue, Loading, Pill, ProgressBar, Screen, SectionTitle, useSnackbar } from '../src/components';
import { useAuth } from '../src/auth/AuthContext';
import { DraftNotice, useFormDraft, useLeaveGuard } from '../src/forms/draft';
import { colors, maxFontScale, spacing, toneIcon, typography } from '../src/theme';
import { formatDate, formatMoney } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';
import { useFieldChain } from '../src/forms/keyboard';

const rupees = (v: string | number) => formatMoney(v);

/**
 * The site in-charge's imprests (v4 item 45): the float, the cash in hand after their cash expenses, and asking for
 * the top-up that brings it back. Needs a connection. With `id` (a fund request's Open imprest) it shows that imprest,
 * whoever holds it; only its holder requests a top-up.
 */
export default function ImprestScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const list = useFetch<ImprestDto[]>((a) => (id ? a.get<ImprestDto>(`/imprests/${id}`).then((x) => [x]) : a.get('/imprests', { mine: true })), [id]);
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <ErrorBanner message={list.error} />
      {list.loading && !list.data ? <Loading /> : null}
      {list.data && !list.data.length ? <EmptyState title={t('You hold no imprest')} subtitle={t('Accounts open one to give you a petty cash float for the site.')} icon="cash-outline" /> : null}
      {list.data?.map((i) => <ImprestCard key={i.id} imprest={i} onChanged={() => void list.reload()} />)}
    </Screen>
  );
}

function ImprestCard({ imprest: i, onChanged }: { imprest: ImprestDto; onChanged: () => void }) {
  const api = useApi();
  const t = useT();
  const { user } = useAuth();
  const snackbar = useSnackbar();
  const field = useFieldChain();
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useFormDraft(`top-up.${i.id}`, { asking, amount, reason }, (d) => {
    setAsking(d.asking);
    setAmount(d.amount);
    setReason(d.reason);
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });
  const pct = Number(i.floatAmount) > 0 ? Math.max(0, Math.min(100, (Number(i.cashInHand) / Number(i.floatAmount)) * 100)) : 0;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<ImprestDetailDto>(`/imprests/${i.id}/top-ups`, { amount: amount.trim() || undefined, reason: reason.trim() || undefined });
      snackbar.show(t('Top-up of {amount} requested. Accounts have been told.', { amount: rupees(d.openRequest?.amount ?? 0) }));
      draft.clear();
      setAsking(false);
      setAmount('');
      setReason('');
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <SectionTitle title={i.holderId === user?.id ? i.projectName : `${i.projectName} · ${i.holderName}`} />
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.h2, i.low ? { color: colors.danger } : null]}>{rupees(i.cashInHand)}</Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('in hand of a {float} float', { float: rupees(i.floatAmount) })}</Text>
      <ProgressBar value={pct} showLabel={false} color={i.low ? colors.danger : undefined} />
      <View style={styles.kv}>
        <KeyValue label={t('Spent, approved')} value={rupees(i.approvedSpend)} />
        <KeyValue label={t('Waiting for approval')} value={rupees(i.pendingSpend)} />
        {Number(i.disallowed) ? <KeyValue label={t('Disallowed')} value={rupees(i.disallowed)} /> : null}
        <KeyValue label={t('Top-up due')} value={rupees(i.topUpDue)} />
        {i.lastAdvanceOn ? <KeyValue label={t('Last cash received')} value={formatDate(i.lastAdvanceOn)} /> : null}
      </View>
      {i.openRequest ? (
        <View style={styles.request}>
          <Pill text={t(IMPREST_ENTRY_STATUS_LABELS[i.openRequest.status])} fg={colors.warning} bg={colors.warningSoft} icon={toneIcon.waiting} />
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>
            {t('{kind}: {amount} on {date}', { kind: t(IMPREST_ENTRY_KIND_LABELS[i.openRequest.kind]), amount: rupees(i.openRequest.amount), date: formatDate(i.openRequest.date) })}
            {i.openRequest.reason ? `. ${i.openRequest.reason}` : ''}
          </Text>
        </View>
      ) : asking ? (
        <View>
          <DraftNotice
            draft={draft}
            onStartOver={() => {
              setAmount('');
              setReason('');
            }}
          />
          <ErrorBanner message={error} />
          <Input {...field()} label={t('Amount (₹)')} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder={Number(i.topUpDue) ? i.topUpDue : '0'} hint={t('Leave blank to request {due}, which brings the cash back to the {float} float.', { due: rupees(i.topUpDue), float: rupees(i.floatAmount) })} />
          <Input {...field({ done: () => void ask() })} label={t('What for')} value={reason} onChangeText={setReason} placeholder={t("Diesel for the DG, the week's tea")} />
          <View style={styles.actions}>
            <Button title={t('Cancel')} variant="ghost" onPress={() => setAsking(false)} />
            <Button title={t('Request top-up')} loading={busy} onPress={() => void ask()} />
          </View>
        </View>
      ) : i.isActive && i.holderId === user?.id ? (
        <Button title={t('Request top-up')} icon="cash-outline" variant="secondary" onPress={() => setAsking(true)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  kv: { marginTop: spacing.sm, marginBottom: spacing.sm },
  request: { gap: spacing.xs, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', flexWrap: 'wrap' },
});
