import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { STOCK_ENTRY_TYPE_LABELS, canKeepStock, type Paginated, type StockBalanceDto, type StockEntryDto, type StockEntryType } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useFetch } from '../../src/api/hooks';
import { Button, Card, Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Select } from '../../src/components';
import { useProjectOptions } from '../../src/forms/common';
import { useOffline } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate, fmtQty } from '../../src/utils/format';

type Filter = 'all' | 'low';

const TYPE_TONE: Record<StockEntryType, { fg: string; bg: string }> = {
  RECEIPT: { fg: colors.success, bg: colors.successSoft },
  ISSUE: { fg: colors.primary, bg: colors.primarySoft },
  ADJUSTMENT: { fg: colors.info, bg: colors.infoSoft },
};

/** Stock on hand at one project, low items first when filtered, plus the latest store entries. */
export default function StockScreen() {
  const params = useLocalSearchParams<{ projectId?: string; low?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { online } = useOffline();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [filter, setFilter] = useState<Filter>(params.low === '1' ? 'low' : 'all');
  const keeper = !!user && canKeepStock(user.roleKey);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const balances = useFetch<Paginated<StockBalanceDto>>(
    (a) => a.get('/stock/balances', { projectId: projectId!, lowOnly: filter === 'low' ? true : undefined, pageSize: 500, sortBy: 'item' }),
    [projectId, filter],
    { enabled: !!projectId, cacheKey: projectId ? `stock:${projectId}:${filter}` : undefined },
  );
  const entries = useFetch<Paginated<StockEntryDto>>((a) => a.get('/stock/entries', { projectId: projectId!, pageSize: 10 }), [projectId], {
    enabled: !!projectId,
    cacheKey: projectId ? `stock-entries:${projectId}` : undefined,
  });

  if (projects.loading && !projects.data) return <Loading />;
  const rows = balances.data?.items ?? [];
  const lowCount = rows.filter((r) => r.low).length;

  return (
    <Screen
      refreshing={balances.refreshing}
      onRefresh={() => {
        balances.refresh();
        entries.refresh();
      }}
    >
      <Stack.Screen options={{ title: 'Stock' }} />
      <ErrorBanner message={projects.error ?? (balances.data ? null : balances.error)} />
      <Card>
        <Select label="Project" value={projectId} options={projects.options} onChange={setProjectId} placeholder="Choose project" />
        <Chips
          value={filter}
          clearable={false}
          options={[
            { value: 'all', label: 'All items' },
            { value: 'low', label: 'Low stock' },
          ]}
          onChange={(v) => v && setFilter(v)}
        />
        {keeper ? (
          <View style={styles.actions}>
            <Button title="Receive" icon="download-outline" onPress={() => router.push(`/stock/receive${projectId ? `?projectId=${projectId}` : ''}`)} style={styles.flex} disabled={!online} />
            <Button title="Issue" icon="arrow-up-circle-outline" variant="secondary" onPress={() => router.push(`/stock/issue${projectId ? `?projectId=${projectId}` : ''}`)} style={styles.flex} disabled={!online} />
          </View>
        ) : null}
        {keeper && !online ? <Text style={[typography.caption, styles.offline]}>Receipts and issues need a connection: the stock must be checked on the server.</Text> : null}
      </Card>

      {!projectId ? (
        <EmptyState title="Choose a project" subtitle="Stock is kept per project." icon="cube-outline" />
      ) : balances.loading && !balances.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'low' ? 'Nothing is low' : 'No stock yet'}
          subtitle={filter === 'low' ? 'Every item is at or above its minimum level.' : 'Material appears here once it is received against an approved request.'}
          icon="cube-outline"
        />
      ) : (
        <>
          <SectionTitle title={`${rows.length} item${rows.length === 1 ? '' : 's'}`} right={lowCount && filter === 'all' ? <Text style={styles.lowText}>{lowCount} low</Text> : null} />
          {rows.map((r) => (
            <Card key={r.itemId}>
              <View style={styles.itemRow}>
                <View style={styles.flex}>
                  <Text style={typography.bodyStrong}>{r.itemName}</Text>
                  <Text style={typography.caption}>
                    In {fmtQty(r.received)} · out {fmtQty(r.issued)}
                    {Number(r.adjusted) !== 0 ? ` · adj ${fmtQty(r.adjusted)}` : ''}
                    {r.minQty ? ` · min ${fmtQty(r.minQty)}` : ''}
                  </Text>
                </View>
                <View style={styles.balance}>
                  <Text style={[styles.balanceValue, r.low && styles.lowText]}>
                    {fmtQty(r.balance)} <Text style={styles.unit}>{r.unit}</Text>
                  </Text>
                  {r.low ? (
                    <View style={styles.lowTag}>
                      <Ionicons name="warning" size={12} color={colors.danger} />
                      <Text style={styles.lowTagText}>Low</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>
          ))}
        </>
      )}

      {projectId && entries.data?.items.length ? (
        <>
          <SectionTitle title="Latest entries" />
          {entries.data.items.map((e) => (
            <Card key={e.id}>
              <View style={styles.entryHead}>
                <Text style={typography.bodyStrong}>{e.entryNo}</Text>
                <Pill text={STOCK_ENTRY_TYPE_LABELS[e.type]} fg={TYPE_TONE[e.type].fg} bg={TYPE_TONE[e.type].bg} />
              </View>
              <Text style={typography.caption}>
                {formatDate(e.date)} · {e.createdByName}
                {e.type === 'RECEIPT' && e.requestNo ? ` · ${e.requestNo}` : ''}
                {e.type === 'ISSUE' && e.issuedTo ? ` · to ${e.issuedTo}` : ''}
              </Text>
              <Text style={[typography.body, styles.lines]}>{e.lines.map((l) => `${l.itemName} ${Number(l.quantity) > 0 ? '+' : ''}${fmtQty(l.quantity)} ${l.unit}`).join('\n')}</Text>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  offline: { marginTop: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  balance: { alignItems: 'flex-end' },
  balanceValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  unit: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  lowText: { color: colors.danger, fontWeight: '700' },
  lowTag: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  lowTagText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  lines: { marginTop: spacing.xs },
});
