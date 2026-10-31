import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MATERIAL_PRIORITY_LABELS, canKeepStock, type ReceivableOrderDto, type ReceivableRequestDto, type StockEntryDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, EmptyState, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { useT } from '../../src/i18n/LanguageContext';
import { ErrorSummary, useErrorSummary } from '../../src/forms/errors';
import type { TranslateVars } from '../../src/i18n/translate';
import { useOffline } from '../../src/offline';
import { colors, fontSize, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';
import { useFieldChain } from '../../src/forms/keyboard';

const QTY = /^\d+(\.\d{1,3})?$/;

type T = (en: string, vars?: TranslateVars) => string;

/** What a GRN is received against: an approved material request or an approved, open purchase order. */
interface Source {
  key: string;
  kind: 'MR' | 'PO';
  id: string;
  no: string;
  label: string;
  hint: string;
  vendorName: string | null;
  lines: { id: string; itemName: string; unit: string; due: string; received: string; pending: string }[];
}

const fromRequest = (r: ReceivableRequestDto, t: T): Source => ({
  key: `mr:${r.id}`,
  kind: 'MR',
  id: r.id,
  no: r.requestNo,
  label: `${r.requestNo} · ${r.lines.map((l) => l.itemName).join(', ')}`,
  hint: `${t('Request, needed {date}', { date: formatDate(r.requiredDate) })} · ${t(MATERIAL_PRIORITY_LABELS[r.priority])}`,
  vendorName: null,
  lines: r.lines.map((l) => ({ id: l.materialRequestItemId, itemName: l.itemName, unit: l.unit, due: l.requested, received: l.received, pending: l.pending })),
});

const fromOrder = (o: ReceivableOrderDto, t: T): Source => ({
  key: `po:${o.id}`,
  kind: 'PO',
  id: o.id,
  no: o.poNo,
  label: `${o.poNo} · ${o.vendorName}`,
  hint: `${o.deliveryBy ? t('Purchase order, due {date}', { date: formatDate(o.deliveryBy) }) : t('Purchase order')} · ${o.lines.map((l) => l.itemName).join(', ')}`,
  vendorName: o.vendorName,
  lines: o.lines.map((l) => ({ id: l.purchaseOrderLineId, itemName: l.itemName, unit: l.unit, due: l.ordered, received: l.received, pending: l.pending })),
});

/** Goods received note against an approved purchase order or material request. Needs a connection (the pending quantities live on the server). */
export default function ReceiveScreen() {
  const params = useLocalSearchParams<{ projectId?: string; materialRequestId?: string; purchaseOrderId?: string }>();
  const { user } = useAuth();
  const t = useT();
  const field = useFieldChain();
  const errorSummary = useErrorSummary();
  const api = useApi();
  const { online } = useOffline();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [sourceKey, setSourceKey] = useState<string | null>(params.purchaseOrderId ? `po:${params.purchaseOrderId}` : params.materialRequestId ? `mr:${params.materialRequestId}` : null);
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [supplier, setSupplier] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<StockEntryDto | null>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);

  const receivable = useFetch<ReceivableRequestDto[]>((a) => a.get('/stock/receivable', { projectId: projectId! }), [projectId], { enabled: !!projectId, refetchOnFocus: false });
  const orders = useFetch<ReceivableOrderDto[]>((a) => a.get('/purchase-orders/receivable', { projectId: projectId! }), [projectId], { enabled: !!projectId, refetchOnFocus: false });
  const sources = useMemo(() => [...(orders.data ?? []).map((o) => fromOrder(o, t)), ...(receivable.data ?? []).map((r) => fromRequest(r, t))], [orders.data, receivable.data, t]);
  const request = sources.find((s) => s.key === sourceKey) ?? null;
  const requestOptions = useMemo(() => sources.map((s) => ({ value: s.key, label: s.label, hint: s.hint })), [sources]);

  // Each line starts at what is still pending.
  useEffect(() => {
    if (request) setQty(Object.fromEntries(request.lines.map((l) => [l.id, Number(l.pending) > 0 ? l.pending : ''])));
  }, [request]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!request) e.request = t('Choose the purchase order or material request');
    if (!isIsoDate(date)) e.date = t('Enter a valid date');
    else if (date > today()) e.date = t('Enter a date up to today');
    let any = false;
    for (const l of request?.lines ?? []) {
      const v = (qty[l.id] ?? '').trim();
      if (!v) continue;
      if (!QTY.test(v)) e[l.id] = t('Enter a number (up to 3 decimals)');
      else if (Number(v) > Number(l.pending)) e[l.id] = t('Enter at most {qty} {unit}, the quantity pending', { qty: fmtQty(l.pending), unit: l.unit });
      else if (Number(v) > 0) any = true;
    }
    if (request && !any && !Object.keys(e).length) e.lines = t('Enter the quantity received on at least one line');
    if (photosUploading(photos)) e.photos = t('Wait for photos to finish uploading');
    else if (photosFailed(photos)) e.photos = t('Remove or retry failed photos');
    else if (photosQueued(photos)) e.photos = t('Photos need a connection; remove them or try again');
    setErrors(e);
    errorSummary.report(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setSubmitError(null);
    if (!validate() || !request) return;
    setBusy(true);
    try {
      const po = request.kind === 'PO';
      const lines = request.lines
        .map((l) => ({ [po ? 'purchaseOrderLineId' : 'materialRequestItemId']: l.id, quantity: (qty[l.id] ?? '').trim() }))
        .filter((l) => l.quantity && Number(l.quantity) > 0);
      setSaved(
        await api.post<StockEntryDto>('/stock/receipts', {
          ...(po ? { purchaseOrderId: request.id } : { materialRequestId: request.id, supplier: supplier.trim() || null }),
          date,
          challanNo: challanNo.trim() || null,
          vehicleNo: vehicleNo.trim() || null,
          remarks: remarks.trim() || null,
          attachmentIds: attachmentIds(photos),
          lines,
        }),
      );
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
        subtitle={t('{lines} received against {ref}.', { lines: saved.lines.map((l) => `${l.itemName} ${fmtQty(l.quantity)} ${l.unit}`).join(', '), ref: saved.poNo ?? saved.requestNo })}
        onAnother={() => {
          setSaved(null);
          setSourceKey(null);
          setPhotos([]);
          setSupplier('');
          setChallanNo('');
          setVehicleNo('');
          setRemarks('');
          receivable.reload();
          orders.reload();
        }}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (user && !canKeepStock(user.roleKey)) return <EmptyState title={t('Not available for your role')} subtitle={t('The store manager, site engineers and approvers receive material.')} icon="lock-closed-outline" />;

  return (
    <Screen keyboard scrollRef={errorSummary.scrollRef}>
      <Stack.Screen options={{ title: t('Receive material (GRN)') }} />
      <ErrorSummary errors={errors} />
      <ErrorBanner message={submitError ?? projects.error ?? (online ? (receivable.error ?? orders.error) : t('You are offline. Receiving material needs a connection.'))} />
      <Card>
        <Select
          label={t('Project')}
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setSourceKey(null);
          }}
          placeholder={t('Choose project')}
        />
        <Select
          label={t('Against')}
          required
          value={sourceKey}
          options={requestOptions}
          onChange={setSourceKey}
          placeholder={receivable.loading || orders.loading ? t('Loading…') : requestOptions.length ? t('Choose purchase order or request') : t('Nothing pending to receive')}
          disabled={!projectId || !requestOptions.length}
          error={errors.request}
        />
        <DatePicker label={t('Received on')} required value={date} onChange={setDate} error={errors.date} />
      </Card>

      {request ? (
        <Card title={t('Quantities received')}>
          {request.lines.map((l) => (
            <View key={l.id} style={styles.line}>
              <Text style={typography.bodyStrong}>{l.itemName}</Text>
              <Text style={typography.caption}>
                {request.kind === 'PO'
                  ? t('Ordered {due} · received {received} · pending {pending} {unit}', { due: fmtQty(l.due), received: fmtQty(l.received), pending: fmtQty(l.pending), unit: l.unit })
                  : t('Requested {due} · received {received} · pending {pending} {unit}', { due: fmtQty(l.due), received: fmtQty(l.received), pending: fmtQty(l.pending), unit: l.unit })}
              </Text>
              {Number(l.pending) > 0 ? (
                <Input {...field()}
                  value={qty[l.id] ?? ''}
                  onChangeText={(v) => setQty((q) => ({ ...q, [l.id]: v }))}
                  keyboardType="decimal-pad"
                  placeholder={`0 ${l.unit}`}
                  accessibilityLabel={t('Quantity of {item} received, in {unit}', { item: l.itemName, unit: l.unit })}
                  right={<Text style={typography.caption}>{l.unit}</Text>}
                  error={errors[l.id]}
                  containerStyle={styles.qty}
                />
              ) : (
                <Text style={styles.done}>{t('Fully received')}</Text>
              )}
            </View>
          ))}
          {errors.lines ? <Text style={styles.err}>{errors.lines}</Text> : null}
        </Card>
      ) : null}

      <Card title={t('Delivery')}>
        {request?.kind === 'PO' ? (
          <Input label={t('Supplier')} value={request.vendorName ?? ''} editable={false} />
        ) : (
          <Input {...field()} label={t('Supplier')} value={supplier} onChangeText={setSupplier} placeholder={t('Supplier name')} />
        )}
        <Input {...field()} label={t('Challan / invoice no.')} value={challanNo} onChangeText={setChallanNo} />
        <Input {...field()} label={t('Vehicle no.')} value={vehicleNo} onChangeText={setVehicleNo} autoCapitalize="characters" />
        <PhotoPicker label={t('Challan photo')} photos={photos} onChange={setPhotos} max={4} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
        <Input {...field({ multiline: true })} label={t('Remarks')} value={remarks} onChangeText={setRemarks} multiline containerStyle={styles.last} />
      </Card>
      <Button title={t('Save GRN')} icon="checkmark" onPress={save} loading={busy} disabled={!online || !request} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  qty: { marginTop: spacing.sm, marginBottom: 0 },
  done: { color: colors.success, fontWeight: '600', marginTop: spacing.xs },
  err: { color: colors.danger, marginTop: spacing.sm, fontSize: fontSize.secondary },
  last: { marginBottom: 0 },
});
