import React, { memo, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { STOCK_ENTRY_TYPE_LABELS, canKeepStock, type Paginated, type StockBalanceDto, type StockEntryDto, type StockEntryType } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useFetch } from '../../src/api/hooks';
import { Button, Card, Chips, EmptyState, ErrorBanner, Loading, Pill, Screen, SectionTitle, Select } from '../../src/components';
import { useProjectOptions } from '../../src/forms/common';
import { useT } from '../../src/i18n/LanguageContext';
import { useOffline } from '../../src/offline';
import { colors, fontSize, spacing, toneIcon, typography, type Tone } from '../../src/theme';
import type { TranslateVars } from '../../src/i18n/translate';
import { formatDate, fmtQty } from '../../src/utils/format';

type Filter = 'all' | 'low';

const TYPE_TONE: Record<StockEntryType, Tone> = {
  RECEIPT: { fg: colors.success, bg: colors.successSoft },
  ISSUE: { fg: colors.primary, bg: colors.primarySoft },
  ADJUSTMENT: { fg: colors.info, bg: colors.infoSoft },
  TRANSFER_OUT: { fg: colors.warning, bg: colors.warningSoft },
  TRANSFER_IN: { fg: colors.success, bg: colors.successSoft },
  RETURN_TO_VENDOR: { fg: colors.warning, bg: colors.warningSoft },
  RETURN_FROM_SITE: { fg: colors.primary, bg: colors.primarySoft },
};

/** Stock on hand at one project, low items first when filtered, plus the latest store entries. */
export default function StockScreen() {
  const params = useLocalSearchParams<{ projectId?: string; low?: string }>();
  const router = useRouter();
  const t = useT();
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
  const entries = useFetch<Paginated<StockEntryDto>>((a) => a.get('/stock/entries', { projectId: projectId!, pageSize: 10, allTypes: true }), [projectId], {
    enabled: !!projectId,
    cacheKey: projectId ? `stock-entries:${projectId}` : undefined,
  });

  if (projects.loading && !projects.data) return <Loading />;
  const rows = balances.data?.items ?? [];
  const lowCount = rows.filter((r) => r.low).length;

  const refresh = () => {
    balances.refresh();
    entries.refresh();
  };

  const header = (
    <>
      <Stack.Screen options={{ title: t('Stock') }} />
      <ErrorBanner message={projects.error ?? (balances.data ? null : balances.error)} />
      <Card>
        <Select label={t('Project')} value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} />
        <Chips
          value={filter}
          clearable={false}
          options={[
            { value: 'all', label: t('All items') },
            { value: 'low', label: t('Low stock') },
          ]}
          onChange={(v) => v && setFilter(v)}
        />
        {keeper ? (
          <View style={styles.actions}>
            <Button title={t('Receive')} icon="download-outline" onPress={() => router.push(`/stock/receive${projectId ? `?projectId=${projectId}` : ''}`)} style={styles.flex} disabled={!online} />
            <Button title={t('Issue')} icon="arrow-up-circle-outline" variant="secondary" onPress={() => router.push(`/stock/issue${projectId ? `?projectId=${projectId}` : ''}`)} style={styles.flex} disabled={!online} />
          </View>
        ) : null}
        {keeper ? <Button title={t('Fuel issue')} icon="water-outline" variant="secondary" onPress={() => router.push(`/stock/fuel${projectId ? `?projectId=${projectId}` : ''}`)} style={styles.fuel} /> : null}
        {keeper && !online ? <Text style={[typography.caption, styles.offline]}>{t('Receipts and issues need a connection: the stock must be checked on the server. A fuel issue is kept on this phone and sent later.')}</Text> : null}
      </Card>
      {projectId && rows.length ? (
        <SectionTitle title={rows.length === 1 ? t('{n} item', { n: 1 }) : t('{n} items', { n: rows.length })} right={lowCount && filter === 'all' ? <Text style={styles.lowText}>{t('{n} low', { n: lowCount })}</Text> : null} />
      ) : null}
    </>
  );

  const empty = !projectId ? (
    <EmptyState title={t('Choose a project')} subtitle={t('Stock is kept per project.')} icon="cube-outline" />
  ) : balances.loading && !balances.data ? (
    <Loading />
  ) : (
    <EmptyState
      title={filter === 'low' ? t('Nothing is low') : t('No stock yet')}
      subtitle={filter === 'low' ? t('Every item is at or above its minimum level.') : t('Material appears here once it is received against an approved request.')}
      icon="cube-outline"
    />
  );

  const footer =
    projectId && entries.data?.items.length ? (
      <>
        <SectionTitle title={t('Latest entries')} />
        {entries.data.items.map((e) => (
          <Card key={e.id}>
            <View style={styles.entryHead}>
              <Text style={typography.bodyStrong}>{e.entryNo}</Text>
              <Pill text={t(STOCK_ENTRY_TYPE_LABELS[e.type])} {...TYPE_TONE[e.type]} />
            </View>
            <Text style={typography.caption}>
              {formatDate(e.date)} · {e.createdByName}
              {e.type === 'RECEIPT' && e.requestNo ? ` · ${e.requestNo}` : ''}
              {(e.type === 'ISSUE' || e.type === 'TRANSFER_OUT') && e.issuedTo ? ` · ${t('to {name}', { name: e.issuedTo })}` : ''}
            </Text>
            <Text style={[typography.body, styles.lines]}>{e.lines.map((l) => `${l.itemName} ${Number(l.quantity) > 0 ? '+' : ''}${fmtQty(l.quantity)} ${l.unit}`).join('\n')}</Text>
          </Card>
        ))}
      </>
    ) : null;

  // Up to 500 balances at a big store: a virtualised list (UX item 88) rather than every card drawn at once.
  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={projectId ? rows : []}
        keyExtractor={(r) => r.itemId}
        renderItem={({ item }) => <BalanceRow row={item} t={t} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={styles.list}
        initialNumToRender={15}
        windowSize={11}
        refreshControl={<RefreshControl refreshing={balances.refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      />
    </Screen>
  );
}

const BalanceRow = memo(function BalanceRow({ row: r, t }: { row: StockBalanceDto; t: (en: string, vars?: TranslateVars) => string }) {
  return (
    <Card>
      <View style={styles.itemRow}>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>{r.itemName}</Text>
          <Text style={typography.caption}>
            {t('In {in} · out {out}', { in: fmtQty(r.received), out: fmtQty(r.issued) })}
            {Number(r.adjusted) !== 0 ? ` · ${t('adj {n}', { n: fmtQty(r.adjusted) })}` : ''}
            {r.minQty ? ` · ${t('min {n}', { n: fmtQty(r.minQty) })}` : ''}
          </Text>
        </View>
        <View style={styles.balance}>
          <Text style={[styles.balanceValue, r.low && styles.lowText]}>
            {fmtQty(r.balance)} <Text style={styles.unit}>{r.unit}</Text>
          </Text>
          {r.low ? (
            <View style={styles.lowTag}>
              <Ionicons name={toneIcon.warning} size={14} color={colors.danger} />
              <Text style={styles.lowTagText}>{t('Low')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  offline: { marginTop: spacing.sm },
  fuel: { marginTop: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  balance: { alignItems: 'flex-end' },
  balanceValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  unit: { fontSize: fontSize.secondary, fontWeight: '400', color: colors.textMuted },
  lowText: { color: colors.danger, fontWeight: '700' },
  lowTag: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  lowTagText: { color: colors.danger, fontSize: fontSize.small, fontWeight: '700' },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  lines: { marginTop: spacing.xs },
});
