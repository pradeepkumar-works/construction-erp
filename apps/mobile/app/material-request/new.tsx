import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COMMON_UNITS, MATERIAL_PRIORITIES, MATERIAL_PRIORITY_LABELS, type MaterialPriority, type MaterialRequestDto } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, Chips, DatePicker, ErrorBanner, ErrorState, Input, Loading, Screen, Select } from '../../src/components';
import { QueuedSuccess, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { ReviewerNote } from '../../src/forms/edit';
import { useT } from '../../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { addDays, formatDate, isIsoDate, today } from '../../src/utils/format';

interface ItemRow {
  key: string;
  itemName: string;
  specification: string;
  unit: string | null;
  quantity: string;
}

const newKey = () => Math.random().toString(36).slice(2, 9);
const UNIT_OPTIONS = [...COMMON_UNITS, 'Bags', 'Trip', 'Box'].map((u) => ({ value: u, label: u }));
const emptyItem = (): ItemRow => ({ key: newKey(), itemName: '', specification: '', unit: null, quantity: '' });

/** New material request, or (with `editId`) edit a draft / rejected / changes-requested request and resubmit it. */
export default function NewMaterialRequestScreen() {
  const params = useLocalSearchParams<{ projectId?: string; editId?: string }>();
  const editId = params.editId ?? null;
  const t = useT();
  const api = useApi();
  const { online, enqueue } = useOffline();
  const projects = useProjectOptions();
  const existing = useFetch<MaterialRequestDto>((a) => a.get(`/material-requests/${editId}`), [editId], { enabled: !!editId, refetchOnFocus: false });

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [requiredDate, setRequiredDate] = useState(addDays(today(), 3));
  const [priority, setPriority] = useState<MaterialPriority | null>('NORMAL');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<MaterialRequestDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  useEffect(() => {
    if (!editId && !projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [editId, projects.options, projectId]);

  // Editing: prefill the form from the loaded request.
  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setProjectId(e.projectId);
    setRequiredDate(e.requiredDate);
    setPriority(e.priority);
    setRemarks(e.remarks ?? '');
    setItems(e.items.length ? e.items.map((i) => ({ key: newKey(), itemName: i.itemName, specification: i.specification ?? '', unit: i.unit, quantity: i.quantity })) : [emptyItem()]);
  }, [existing.data]);

  const priorityChips = useMemo(() => MATERIAL_PRIORITIES.map((p) => ({ value: p, label: t(MATERIAL_PRIORITY_LABELS[p]) })), [t]);
  const update = (key: string, patch: Partial<ItemRow>) => setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!isIsoDate(requiredDate)) e.requiredDate = t('Enter a valid date');
    const filled = items.filter((r) => r.itemName.trim() || r.quantity.trim() || r.unit || r.specification.trim());
    if (!filled.length) e.items = t('Add at least one item');
    for (const r of filled) {
      if (!r.itemName.trim() || !r.unit || !r.quantity.trim()) e.items = t('Each item needs a name, unit and quantity');
      else if (Number.isNaN(Number(r.quantity)) || Number(r.quantity) <= 0) e.items = t('Quantities must be numbers greater than 0');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        requiredDate,
        priority: priority ?? 'NORMAL',
        remarks: remarks.trim() || (editId ? null : undefined),
        items: items
          .filter((r) => r.itemName.trim())
          .map((r) => ({ itemName: r.itemName.trim(), specification: r.specification.trim() || undefined, unit: r.unit as string, quantity: String(Number(r.quantity)) })),
      };
      if (editId) {
        setCreated(await api.patch<MaterialRequestDto>(`/material-requests/${editId}`, { ...body, submit: true }));
        return;
      }
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        setQueued(
          await enqueue({
            type: 'MATERIAL_REQUEST',
            payload: { projectId, ...body },
            photos: [],
            title: `${t('Material request')} · ${body.items.length === 1 ? t('{n} item', { n: 1 }) : t('{n} items', { n: body.items.length })}`,
            subtitle: `${projectName} · ${t('needed {date}', { date: formatDate(requiredDate) })}`,
          }),
        );
      };
      if (!online) {
        await queueIt();
        return;
      }
      try {
        setCreated(await api.post<MaterialRequestDto>('/material-requests', { projectId, ...body }));
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

  if (queued) {
    return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} />;
  }
  if (created) {
    return <SubmitSuccess title={editId ? t('Request resubmitted') : t('Request submitted')} subtitle={`${created.requestNo} · ${created.items.length === 1 ? t('{n} item needed by {date}. Sent for approval.', { n: 1, date: formatDate(created.requiredDate) }) : t('{n} items needed by {date}. Sent for approval.', { n: created.items.length, date: formatDate(created.requiredDate) })}`} detailHref={`/material-request/${created.id}`} />;
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (editId && existing.loading && !existing.data) return <Loading />;
  if (editId && existing.error && !existing.data) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editId ? t('Edit Material Request') : t('New Material Request') }} />
      <ErrorBanner message={submitError ?? projects.error} />
      <ReviewerNote entry={existing.data} />
      <Card>
        <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} error={errors.projectId} disabled={!!editId} />
        <DatePicker label={t('Required by')} required value={requiredDate} onChange={setRequiredDate} error={errors.requiredDate} />
        <Chips label={t('Priority')} value={priority} options={priorityChips} onChange={setPriority} clearable={false} />
      </Card>

      <Card title={t('Items')}>
        {items.map((r, i) => (
          <View key={r.key} style={styles.item}>
            <View style={styles.itemHead}>
              <Text style={typography.label}>{t('Item {n}', { n: i + 1 })}</Text>
              {items.length > 1 ? (
                <Pressable onPress={() => setItems((rows) => rows.filter((x) => x.key !== r.key))} hitSlop={8} style={styles.remove}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
            <Input value={r.itemName} onChangeText={(v) => update(r.key, { itemName: v })} placeholder={t('Item name, e.g. Cement OPC 53')} containerStyle={styles.field} />
            <Input value={r.specification} onChangeText={(v) => update(r.key, { specification: v })} placeholder={t('Specification (optional)')} containerStyle={styles.field} />
            <View style={styles.row}>
              <View style={styles.grow}>
                <Select value={r.unit} options={UNIT_OPTIONS} onChange={(v) => update(r.key, { unit: v })} placeholder={t('Unit')} />
              </View>
              <Input value={r.quantity} onChangeText={(v) => update(r.key, { quantity: v })} keyboardType="decimal-pad" placeholder={t('Qty')} containerStyle={styles.qty} />
            </View>
          </View>
        ))}
        {errors.items ? <Text style={styles.err}>{errors.items}</Text> : null}
        <Button title={t('Add item')} variant="ghost" size="sm" icon="add" onPress={() => setItems((rows) => [...rows, emptyItem()])} />
      </Card>

      <Card>
        <Input label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline placeholder={t('Delivery instructions, purpose, etc.')} containerStyle={styles.field} />
      </Card>
      <Button title={editId ? t('Resubmit request') : t('Submit request')} icon="send" onPress={submit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingBottom: spacing.sm, marginBottom: spacing.md },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  remove: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  grow: { flex: 1 },
  qty: { width: 110, marginBottom: spacing.sm },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: 13 },
});
