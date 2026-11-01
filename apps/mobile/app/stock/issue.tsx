import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { canKeepStock, canViewWorkOrders, type ActivityDto, type AttendanceSuggestionsDto, type Paginated, type StockBalanceDto, type StockEntryDto, type WorkOrderDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, EmptyState, ErrorBanner, Input, Loading, Screen, Select, IconButton } from '../../src/components';
import { QueuedSuccess, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { DraftNotice, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, fontSize, maxFontScale, spacing, touch, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

const QTY = /^\d+(\.\d{1,3})?$/;
const newKey = () => Math.random().toString(36).slice(2, 9);

interface Row {
  key: string;
  itemId: string | null;
  quantity: string;
}

/**
 * Issue slip: material handed out at site, limited to the stock on hand this phone last saw. Without a signal it waits
 * in the outbox and the stock is checked when it reaches the office.
 */
export default function IssueScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const { user } = useAuth();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const api = useApi();
  const { online, enqueue, newId } = useOffline();
  // One id for a direct send and the outbox, so a slip that timed out but arrived is never saved twice.
  const clientId = useRef(newId());
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
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  const draft = useFormDraft('stock-issue', { projectId, date, issuedTo, workOrderId, activityId, rows, remarks }, (d) => {
    setProjectId(d.projectId);
    setDate(d.date);
    setIssuedTo(d.issuedTo);
    setWorkOrderId(d.workOrderId);
    setActivityId(d.activityId);
    setRows(d.rows);
    setRemarks(d.remarks);
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });

  useEffect(() => {
    if (!projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [projects.options, projectId, draft]);

  // Kept on the phone, so a slip can be made without a signal.
  const stock = useFetch<Paginated<StockBalanceDto>>((a) => a.get('/stock/balances', { projectId: projectId!, inStock: true, pageSize: 500, sortBy: 'item' }), [projectId], {
    enabled: !!projectId,
    refetchOnFocus: false,
    cacheKey: projectId ? `stock-in-hand:${projectId}` : undefined,
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
    if (!isIsoDate(date)) e.date = t('Pick the date from the calendar');
    else if (date > today()) e.date = t('Choose a date up to today');
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
      const body = { projectId, date, issuedTo: issuedTo.trim(), workOrderId: workOrderId || undefined, activityId, remarks: remarks.trim() || null, lines };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        const what = lines.map((l) => byId.get(l.itemId!)?.itemName).filter(Boolean).join(', ');
        setQueued(await enqueue({ id: clientId.current, type: 'STOCK_ISSUE', payload: body, photos: [], title: `${t('Issue')} · ${what} · ${issuedTo.trim()}`, subtitle: `${projectName} · ${formatDate(date)}` }));
        draft.clear();
      };
      if (!online) {
        await queueIt();
        return;
      }
      try {
        setSaved(await api.post<StockEntryDto>('/stock/issues', { id: clientId.current, ...body }));
        draft.clear();
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        await queueIt();
      }
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const another = () => {
    clientId.current = newId();
    setSaved(null);
    setQueued(null);
    setRows([{ key: newKey(), itemId: null, quantity: '' }]);
    setRemarks('');
    setErrors({});
    stock.reload();
  };
  const startOver = () => {
    setDate(today());
    setIssuedTo('');
    setWorkOrderId('');
    setActivityId(null);
    setRows([{ key: newKey(), itemId: null, quantity: '' }]);
    setRemarks('');
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={another} />;
  if (saved) {
    return (
      <SubmitSuccess
        title={t('{no} saved', { no: saved.entryNo })}
        subtitle={t('{lines} issued to {name}.', { lines: saved.lines.map((l) => `${l.itemName} ${fmtQty(Math.abs(Number(l.quantity)))} ${l.unit}`).join(', '), name: saved.issuedTo })}
        onAnother={another}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (user && !canKeepStock(user.roleKey)) return <EmptyState title={t('Not available for your role')} subtitle={t('The store manager, site engineers and approvers issue material.')} icon="lock-closed-outline" />;

  const chosen = new Set(rows.map((r) => r.itemId).filter(Boolean));
  const contractors = (suggestions.data?.contractors ?? []).slice(0, 8);

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: t('Issue material') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? (online ? stock.error : null)} />
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
        <Input {...field()} label={t('Issued to')} required value={issuedTo} onChangeText={setIssuedTo} placeholder={t('Contractor, gang or person')} error={errors.issuedTo} />
        {contractors.length ? <Chips value={null} clearable={false} options={contractors.map((c) => ({ value: c, label: c }))} onChange={(v) => v && setIssuedTo(v)} /> : null}
        <Select label={t('For activity')} value={activityId} options={(activities.data ?? []).map((a) => ({ value: a.id, label: a.name }))} onChange={setActivityId} placeholder={t('Optional')} disabled={!projectId} />
      </Card>

      <Card title={t('Items')}>
        {projectId && !stock.loading && !items.length ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Nothing is in stock at this project yet.')}</Text> : null}
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
                <Input {...field()}
                  value={r.quantity}
                  onChangeText={(v) => updateRow(r.key, { quantity: v })}
                  keyboardType="decimal-pad"
                  placeholder={t('Quantity')}
                  accessibilityLabel={item ? t('Quantity of {item} to issue', { item: item.itemName }) : t('Quantity to issue')}
                  right={item ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{item.unit}</Text> : undefined}
                  hint={item ? t('{qty} {unit} in stock', { qty: fmtQty(item.balance), unit: item.unit }) : undefined}
                  error={errors[r.key]}
                  containerStyle={styles.qty}
                />
              </View>
              {rows.length > 1 ? (
                <IconButton icon="close-circle-outline" size={22} color={colors.textMuted} onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} accessibilityLabel={item ? t('Remove {item}', { item: item.itemName }) : t('Remove item')} style={styles.remove} />
              ) : null}
            </View>
          );
        })}
        {errors.lines ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{errors.lines}</Text> : null}
        <Button title={t('Add item')} variant="ghost" size="sm" icon="add" onPress={() => setRows((rs) => [...rs, { key: newKey(), itemId: null, quantity: '' }])} disabled={!projectId} />
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline containerStyle={styles.last} />
      </Card>
      <Button title={t('Save issue')} icon="checkmark" onPress={save} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingBottom: spacing.sm, marginBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  grow: { flex: 1 },
  qty: { marginBottom: 0 },
  remove: { height: touch.height },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: fontSize.secondary },
  last: { marginTop: spacing.md, marginBottom: 0 },
});
