import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { IMPREST_ENTRY_KIND_LABELS, IMPREST_ENTRY_STATUS_LABELS, type ImprestDetailDto, type ImprestDto } from '@erp/shared';
import { useApi, useFetch } from '../src/api/hooks';
import { errorMessage } from '../src/api/client';
import { Button, Card, EmptyState, ErrorBanner, Input, KeyValue, Loading, Pill, ProgressBar, Screen, SectionTitle } from '../src/components';
import { colors, spacing, typography } from '../src/theme';
import { formatDate } from '../src/utils/format';

const rupees = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The site in-charge's imprests (v4 item 45): the float, the cash in hand after their cash expenses, and asking for
 * the top-up that brings it back. Needs a connection.
 */
export default function ImprestScreen() {
  const list = useFetch<ImprestDto[]>((a) => a.get('/imprests', { mine: true }), []);
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <ErrorBanner message={list.error} />
      {list.loading && !list.data ? <Loading /> : null}
      {list.data && !list.data.length ? <EmptyState title="You hold no imprest" subtitle="Accounts open one to give you a petty cash float for the site." icon="cash-outline" /> : null}
      {list.data?.map((i) => <ImprestCard key={i.id} imprest={i} onChanged={() => void list.reload()} />)}
    </Screen>
  );
}

function ImprestCard({ imprest: i, onChanged }: { imprest: ImprestDto; onChanged: () => void }) {
  const api = useApi();
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = Number(i.floatAmount) > 0 ? Math.max(0, Math.min(100, (Number(i.cashInHand) / Number(i.floatAmount)) * 100)) : 0;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<ImprestDetailDto>(`/imprests/${i.id}/top-ups`, { amount: amount.trim() || undefined, reason: reason.trim() || undefined });
      Alert.alert('Top-up asked for', `${rupees(d.openRequest?.amount ?? 0)}. Accounts have been told.`);
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
      <SectionTitle title={i.projectName} />
      <Text style={[typography.h2, i.low ? { color: colors.danger } : null]}>{rupees(i.cashInHand)}</Text>
      <Text style={typography.caption}>in hand of a {rupees(i.floatAmount)} float</Text>
      <ProgressBar value={pct} showLabel={false} color={i.low ? colors.danger : undefined} />
      <View style={styles.kv}>
        <KeyValue label="Spent, approved" value={rupees(i.approvedSpend)} />
        <KeyValue label="Awaiting approval" value={rupees(i.pendingSpend)} />
        {Number(i.disallowed) ? <KeyValue label="Turned down (to account for)" value={rupees(i.disallowed)} /> : null}
        <KeyValue label="Top-up due" value={rupees(i.topUpDue)} />
        {i.lastAdvanceOn ? <KeyValue label="Last cash received" value={formatDate(i.lastAdvanceOn)} /> : null}
      </View>
      {i.openRequest ? (
        <View style={styles.request}>
          <Pill text={IMPREST_ENTRY_STATUS_LABELS[i.openRequest.status]} fg={colors.warning} bg={colors.warningSoft} />
          <Text style={typography.body}>
            {IMPREST_ENTRY_KIND_LABELS[i.openRequest.kind]}: {rupees(i.openRequest.amount)} on {formatDate(i.openRequest.date)}
            {i.openRequest.reason ? `. ${i.openRequest.reason}` : ''}
          </Text>
        </View>
      ) : asking ? (
        <View>
          <ErrorBanner message={error} />
          <Input label="Amount (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder={Number(i.topUpDue) ? i.topUpDue : '0'} hint="Empty: what brings the cash back to the float" />
          <Input label="What for" value={reason} onChangeText={setReason} placeholder="Diesel for the DG, the week's tea" />
          <View style={styles.actions}>
            <Button title="Cancel" variant="ghost" onPress={() => setAsking(false)} />
            <Button title="Ask for top-up" loading={busy} onPress={() => void ask()} />
          </View>
        </View>
      ) : i.isActive ? (
        <Button title="Ask for a top-up" icon="cash-outline" variant="secondary" onPress={() => setAsking(true)} />
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
