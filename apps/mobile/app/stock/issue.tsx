import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canKeepStock, canViewWorkOrders, type ActivityDto, type AttendanceSuggestionsDto, type Paginated, type StockBalanceDto, type StockEntryDto, type WorkOrderDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, Input, Loading, Screen, Select } from '../../src/components';
import { SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useOffline } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, isIsoDate, today } from '../../src/utils/format';

const QTY = /^\d+(\.\d{1,3})?$/;
const newKey = () => Math.random().toString(36).slice(2, 9);

interface Row {
  key: string;
  itemId: string | null;
  quantity: string;
}

/** Issue slip: material handed out at site, limited to what the project has in stock. Needs a connection. */
export default function IssueScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const { user } = useAuth();
  const t = useT();
  const errorSummary = useErrorSummary();
  const api = useApi();
  const { online } = useOffline();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [issuedTo, setIssuedTo] = useState('');
  const [workOrderId, setWorkOrderId] = useState<string>('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([{ key: newKey(), itemId: null, quantity: '' }]);
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<StockEntryDto | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const stock = useFetch<Paginated<StockBalanceDto>>((a) => a.get('/stock/balances', { projectId: projectId!, inStock: true, pageSize: 500, sortBy: 'item' }), [projectId], {
    enabled: !!projectId,
    refetchOnFocus: false,
  });
  const activities = useFetch<ActivityDto[]>((a) => a.get(`/projects/${projectId}/activities`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: projectId ? `activities:${projectId}` : undefined });
  const suggestions = useFetch<AttendanceSuggestionsDto>((a) => a.get('/attendance/suggestions', { projectId: projectId! }), [projectId], {
    enabled: !!projectId,
    refetchOnFocus: false,
    cacheKey: projectId ? `attendance-suggestions:${projectId}` : undefined,
  });

  const wos = useFetch<Paginated<WorkOrderDto>>((a) => a.get('/work-orders', { projectId: projectId!, open: true, pageSize: 50 }), [projectId], {
    enabled: !!projectId && !!user && canViewWorkOrders(user.roleKey),
    refetchOnFocus: false,
  });
  const woOptions = (wos.data?.items ?? []).map((w) => ({ value: w.id, label: `${w.woNo} · ${w.vendorName}` }));
  const items = useMemo(() => stock.data?.items ?? [], [stock.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.itemId, i])), [items]);
  const updateRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    else if (date > today()) e.date = t('Enter a date up to today');
    if (!issuedTo.trim()) e.issuedTo = t('Enter who took the material');
    const used = rows.filter((r) => r.itemId || r.quantity.trim());
    if (!used.length) e.lines = t('Add at least one item');
    for (const r of used) {
      const item = r.itemId ? byId.get(r.itemId) : undefined;
      if (!item) e[r.key] = t('Choose the item');
      else if (!QTY.test(r.quantity.trim()) || Number(r.quantity) <= 0) e[r.key] = t('Enter a quantity (up to 3 decimals)');
      else if (Number(r.quantity) > Number(item.balance)) e[r.key] = t('Enter at most {qty} {unit}, the stock on hand', { qty: fmtQty(item.balance), unit: item.unit });
    }
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const lines = rows.filter((r) => r.itemId && r.quantity.trim()).map((r) => ({ itemId: r.itemId, quantity: r.quantity.trim() }));
      setSaved(await api.post<StockEntryDto>('/stock/issues', { projectId, date, issuedTo: issuedTo.trim(), workOrderId: workOrderId || undefined, activityId, remarks: remarks.trim() || null, lines }));
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <SubmitSuccess
        title={t('{no} saved', { no: saved.entryNo })}
        subtitle={t('{lines} issued to {name}.', { lines: saved.lines.map((l) => `${l.itemName} ${fmtQty(Math.abs(Number(l.quantity)))} ${l.unit}`).join(', '), name: saved.issuedTo })}
        onAnother={() => {
          setSaved(null);
          setRows([{ key: newKey(), itemId: null, quantity: '' }]);
          setRemarks('');
          stock.reload();
        }}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (user && !canKeepStock(user.roleKey)) return <EmptyState title={t('Not available for your role')} subtitle={t('The store manager, site engineers and approvers issue material.')} icon="lock-closed-outline" />;

  const chosen = new Set(rows.map((r) => r.itemId).filter(Boolean));
  const contractors = (suggestions.data?.contractors ?? []).slice(0, 8);

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: t('Issue Material') }} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? (online ? stock.error : t('You are offline. Issuing material needs a connection.'))} />
      <Card>
        <Select
          label={t('Project')}
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setActivityId(null);
            setWorkOrderId('');
            setRows([{ key: newKey(), itemId: null, quantity: '' }]);
          }}
          placeholder={t('Choose project')}
          error={errors.projectId}
        />
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        {woOptions.length ? (
          <Select
            label={t('To a subcontractor')}
            value={workOrderId}
            options={[{ value: '', label: t('No (departmental)') }, ...woOptions]}
            onChange={(v) => {
              setWorkOrderId(v);
              const w = wos.data?.items.find((x) => x.id === v);
              if (w) setIssuedTo(w.vendorName);
            }}
            placeholder={t('No (departmental)')}
          />
        ) : null}
        <Input label={t('Issued to')} required value={issuedTo} onChangeText={setIssuedTo} placeholder={t('Contractor, gang or person')} error={errors.issuedTo} />
        {contractors.length ? <Chips value={null} clearable={false} options={contractors.map((c) => ({ value: c, label: c }))} onChange={(v) => v && setIssuedTo(v)} /> : null}
        <Select label={t('For activity')} value={activityId} options={(activities.data ?? []).map((a) => ({ value: a.id, label: a.name }))} onChange={setActivityId} placeholder={t('Optional')} disabled={!projectId} />
      </Card>

      <Card title={t('Items')}>
        {projectId && !stock.loading && !items.length ? <Text style={typography.caption}>{t('Nothing is in stock at this project yet.')}</Text> : null}
        {rows.map((r) => {
          const item = r.itemId ? byId.get(r.itemId) : undefined;
          return (
            <View key={r.key} style={styles.row}>
              <View style={styles.grow}>
                <Select
                  value={r.itemId}
                  options={items.filter((i) => i.itemId === r.itemId || !chosen.has(i.itemId)).map((i) => ({ value: i.itemId, label: i.itemName, hint: t('{qty} {unit} in stock', { qty: fmtQty(i.balance), unit: i.unit }) }))}
                  onChange={(v) => updateRow(r.key, { itemId: v })}
                  placeholder={stock.loading ? t('Loading…') : t('Item')}
                  disabled={!projectId}
                />
                <Input
                  value={r.quantity}
                  onChangeText={(v) => updateRow(r.key, { quantity: v })}
                  keyboardType="decimal-pad"
                  placeholder={t('Quantity')}
                  accessibilityLabel={item ? t('Quantity of {item} to issue', { item: item.itemName }) : t('Quantity to issue')}
                  right={item ? <Text style={typography.caption}>{item.unit}</Text> : undefined}
                  hint={item ? t('{qty} {unit} in stock', { qty: fmtQty(item.balance), unit: item.unit }) : undefined}
                  error={errors[r.key]}
                  containerStyle={styles.qty}
                />
              </View>
              {rows.length > 1 ? (
                <Pressable onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} style={styles.remove} hitSlop={8} accessibilityRole="button" accessibilityLabel={item ? t('Remove {item}', { item: item.itemName }) : t('Remove item')}>
                  <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {errors.lines ? <Text style={styles.err}>{errors.lines}</Text> : null}
        <Button title={t('Add item')} variant="ghost" size="sm" icon="add" onPress={() => setRows((rs) => [...rs, { key: newKey(), itemId: null, quantity: '' }])} disabled={!projectId} />
        <Input label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline containerStyle={styles.last} />
      </Card>
      <Button title={t('Save issue')} icon="checkmark" onPress={save} loading={busy} disabled={!online} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingBottom: spacing.sm, marginBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  grow: { flex: 1 },
  qty: { marginBottom: 0 },
  remove: { width: 32, height: 52, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: 13 },
  last: { marginTop: spacing.md, marginBottom: 0 },
});
