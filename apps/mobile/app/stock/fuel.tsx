import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MAX_PAGE_SIZE, canIssueFuel, meterUnit, type EquipmentDto, type FuelPositionDto, type Paginated, type StockEntryDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, EmptyState, ErrorBanner, Input, Loading, Screen, SectionTitle, Select } from '../../src/components';
import { QueuedSuccess, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { DraftNotice, useFormDraft, useLeaveGuard } from '../../src/forms/draft';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import { useFieldChain } from '../../src/forms/keyboard';
import { useT } from '../../src/i18n/LanguageContext';
import { isOfflineError, useOffline, type OutboxItem } from '../../src/offline';
import { colors, maxFontScale, spacing, touch, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';

const QTY = /^\d+(\.\d{1,3})?$/;
const METER = /^\d+(\.\d{1,2})?$/;

/**
 * Fuel issue: diesel from the site store into one machine, with its hour meter or odometer, and the
 * site's fuel position for today. Works offline through the outbox; the server checks the stock when it is sent.
 */
export default function FuelIssueScreen() {
  const params = useLocalSearchParams<{ projectId?: string; equipmentId?: string }>();
  const { user } = useAuth();
  const api = useApi();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const { online, enqueue, newId } = useOffline();
  // One id for a direct send and the outbox, so a slip that timed out but arrived is never saved twice.
  const clientId = useRef(newId());
  const projects = useProjectOptions();

  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [date, setDate] = useState(today());
  const [equipmentId, setEquipmentId] = useState<string | null>(params.equipmentId ?? null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [meter, setMeter] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<StockEntryDto | null>(null);
  const [queued, setQueued] = useState<OutboxItem | null>(null);

  const draft = useFormDraft('fuel-issue', { projectId, date, equipmentId, itemId, quantity, meter, issuedTo, remarks }, (d) => {
    setProjectId(d.projectId);
    setDate(d.date);
    setEquipmentId(d.equipmentId);
    setItemId(d.itemId);
    setQuantity(d.quantity);
    setMeter(d.meter);
    setIssuedTo(d.issuedTo);
    setRemarks(d.remarks);
  });
  useLeaveGuard(draft, { keepsDraft: true, busy });

  useEffect(() => {
    if (!projectId && projects.options.length === 1) {
      setProjectId(projects.options[0].value);
      if (!draft.restoredAt) draft.settle();
    }
  }, [projects.options, projectId, draft]);

  const fleet = useFetch<Paginated<EquipmentDto>>((a) => a.get('/equipment', { pageSize: MAX_PAGE_SIZE }), [], { refetchOnFocus: false, cacheKey: 'equipment:v1' });
  const position = useFetch<FuelPositionDto>((a) => a.get('/fleet/fuel-position', { projectId: projectId! }), [projectId], {
    enabled: !!projectId,
    cacheKey: projectId ? `fuel-position:${projectId}` : undefined,
  });
  const fuels = useMemo(() => (position.data?.rows ?? []).filter((r) => r.projectId === projectId), [position.data, projectId]);
  const fuel = fuels.find((f) => f.itemId === itemId);
  // Machines at this site first, then the rest of the fleet (one may be fuelled while passing through).
  const machines = useMemo(() => {
    const all = (fleet.data?.items ?? []).filter((e) => e.isActive);
    return [...all.filter((e) => e.projectId === projectId), ...all.filter((e) => e.projectId !== projectId)];
  }, [fleet.data, projectId]);
  const machine = machines.find((m) => m.id === equipmentId);
  const unit = meterUnit(machine?.fuelNormUnit);

  useEffect(() => {
    if (fuels.length === 1 && !itemId) setItemId(fuels[0].itemId);
  }, [fuels, itemId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectId) e.projectId = t('Choose a project');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    else if (date > today()) e.date = t('Enter a date up to today');
    if (!equipmentId) e.equipmentId = t('Choose the machine the fuel went into');
    if (!itemId) e.itemId = t('Choose the fuel');
    if (!QTY.test(quantity.trim()) || Number(quantity) <= 0) e.quantity = t('Enter a quantity (up to 3 decimals)');
    else if (fuel && Number(quantity) > Number(fuel.closing)) e.quantity = t('Enter at most {qty} {unit}, the stock on hand', { qty: fmtQty(fuel.closing), unit: fuel.unit });
    if (meter.trim() && !METER.test(meter.trim())) e.meter = t('Enter the reading as a number');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = { projectId, date, equipmentId, itemId, quantity: quantity.trim(), meterReading: meter.trim() || null, issuedTo: issuedTo.trim() || null, remarks: remarks.trim() || null };
      const queueIt = async () => {
        const projectName = projects.options.find((o) => o.value === projectId)?.label ?? t('Project');
        const item = await enqueue({
          id: clientId.current,
          type: 'FUEL_ISSUE',
          payload: body,
          photos: [],
          title: `${t('Fuel')} · ${machine?.code ?? ''} · ${fmtQty(quantity)} ${fuel?.unit ?? 'Ltr'}`,
          subtitle: `${projectName} · ${formatDate(date)}`,
        });
        draft.clear();
        setQueued(item);
      };
      if (!online) {
        await queueIt();
        return;
      }
      try {
        const e = await api.post<StockEntryDto>('/stock/fuel-issues', { id: clientId.current, ...body });
        draft.clear();
        setSaved(e);
      } catch (err) {
        if (!isOfflineError(err)) throw err;
        await queueIt();
      }
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    clientId.current = newId();
    setSaved(null);
    setQueued(null);
    setEquipmentId(null);
    setQuantity('');
    setMeter('');
    setIssuedTo('');
    setRemarks('');
    setErrors({});
    position.refresh();
    draft.settle();
  };
  const startOver = () => {
    setDate(today());
    setEquipmentId(null);
    setItemId(null);
    setQuantity('');
    setMeter('');
    setIssuedTo('');
    setRemarks('');
    setErrors({});
  };

  if (queued) return <QueuedSuccess title={t('Saved on this phone')} subtitle={`${queued.title} · ${queued.subtitle}`} onAnother={reset} />;
  if (saved)
    return (
      <SubmitSuccess
        title={t('{no} saved', { no: saved.entryNo })}
        subtitle={t('{qty} {unit} into {machine}.', { qty: fmtQty(Math.abs(Number(saved.lines[0]?.quantity ?? quantity))), unit: saved.lines[0]?.unit ?? '', machine: saved.equipmentCode ?? '' })}
        onAnother={reset}
      />
    );
  if (projects.loading && !projects.data) return <Loading />;
  if (user && !canIssueFuel(user.roleKey)) return <EmptyState title={t('Not available for your role')} subtitle={t('The store manager, site engineers and approvers issue fuel.')} icon="lock-closed-outline" />;

  const issues = (position.data?.issues ?? []).filter((i) => i.projectId === projectId);
  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef} refreshing={position.refreshing} onRefresh={position.refresh}>
      <Stack.Screen options={{ title: t('Fuel issue') }} />
      <DraftNotice draft={draft} onStartOver={startOver} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? (position.data ? null : position.error)} />
      <Card>
        <Select
          label={t('Project')}
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setItemId(null);
          }}
          placeholder={t('Choose project')}
          error={errors.projectId}
        />
        <Select
          label={t('Machine')}
          required
          value={equipmentId}
          options={machines.map((m) => ({ value: m.id, label: `${m.code} ${m.name}`, hint: m.fuelNorm && m.fuelNormUnit ? t(m.fuelNormUnit === 'KM_PER_LITRE' ? 'Norm {n} km a litre' : 'Norm {n} litres an hour', { n: fmtQty(m.fuelNorm) }) : undefined }))}
          onChange={setEquipmentId}
          placeholder={fleet.loading ? t('Loading…') : t('Choose the machine')}
          error={errors.equipmentId}
        />
        <DatePicker label={t('Date')} required value={date} onChange={setDate} error={errors.date} />
        <Select
          label={t('Fuel')}
          required
          value={itemId}
          options={fuels.map((f) => ({ value: f.itemId, label: f.itemName, hint: t('{qty} {unit} in stock', { qty: fmtQty(f.closing), unit: f.unit }) }))}
          onChange={setItemId}
          placeholder={projectId && !position.loading && !fuels.length ? t('No fuel in stock here') : t('Choose the fuel')}
          disabled={!projectId}
          error={errors.itemId}
        />
        <Input
          {...field()}
          label={t('Quantity')}
          required
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          right={<Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>{fuel?.unit ?? 'Ltr'}</Text>}
          hint={fuel ? t('{qty} {unit} in stock', { qty: fmtQty(fuel.closing), unit: fuel.unit }) : undefined}
          error={errors.quantity}
        />
        <Input
          {...field()}
          label={unit === 'km' ? t('Odometer') : t('Hour meter')}
          value={meter}
          onChangeText={setMeter}
          keyboardType="decimal-pad"
          right={<Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>{unit}</Text>}
          hint={t('Reading when it was filled')}
          error={errors.meter}
        />
        <Input {...field()} label={t('Handed to')} value={issuedTo} onChangeText={setIssuedTo} maxLength={120} placeholder={t('The operator or driver')} />
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline maxLength={1000} containerStyle={styles.last} />
      </Card>
      <Button title={online ? t('Save fuel issue') : t('Save on this phone')} icon="checkmark" onPress={submit} loading={busy} />

      {projectId && fuels.length ? (
        <>
          <SectionTitle title={t('Fuel today')} />
          <Card>
            {fuels.map((f) => {
              const low = f.minLevel !== null && Number(f.closing) < Number(f.minLevel);
              return (
                <View key={f.itemId} style={styles.row}>
                  <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
                    {f.itemName}
                  </Text>
                  <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
                    {t('Opening {a} · in {b} · into machines {c} · other {d}', { a: fmtQty(f.opening), b: fmtQty(f.received), c: fmtQty(f.issuedToMachines), d: fmtQty(f.otherOut) })}
                  </Text>
                  <Text style={[typography.body, low ? { color: colors.danger } : null]} maxFontSizeMultiplier={maxFontScale}>
                    {low ? t('Closing {qty} {unit}, below the minimum {min}', { qty: fmtQty(f.closing), unit: f.unit, min: fmtQty(f.minLevel!) }) : t('Closing {qty} {unit}', { qty: fmtQty(f.closing), unit: f.unit })}
                  </Text>
                </View>
              );
            })}
            {issues.map((i) => (
              <View key={i.entryId} style={styles.row}>
                <Text style={typography.body} maxFontSizeMultiplier={maxFontScale}>
                  {`${i.equipmentCode ?? ''} · ${fmtQty(i.litres)} ${i.unit}`}
                </Text>
                <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
                  {[i.entryNo, i.meterReading ? t('meter {m}', { m: fmtQty(i.meterReading) }) : null, i.issuedTo].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ))}
            {!issues.length ? (
              <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
                {t('No fuel has gone into machines today.')}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm, minHeight: touch.min, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  last: { marginBottom: 0 },
});
