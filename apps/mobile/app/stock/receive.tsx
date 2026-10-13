import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MATERIAL_PRIORITY_LABELS, canKeepStock, type ReceivableRequestDto, type StockEntryDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { Button, Card, DatePicker, EmptyState, ErrorBanner, Input, Loading, PhotoPicker, Screen, Select, type LocalPhoto } from '../../src/components';
import { attachmentIds, photosFailed, photosQueued, photosUploading, SubmitSuccess, useProjectOptions } from '../../src/forms/common';
import { useOffline } from '../../src/offline';
import { colors, spacing, typography } from '../../src/theme';
import { fmtQty, formatDate, isIsoDate, today } from '../../src/utils/format';

const QTY = /^\d+(\.\d{1,3})?$/;

/** Goods received note against an approved material request. Needs a connection (the pending quantities live on the server). */
export default function ReceiveScreen() {
  const params = useLocalSearchParams<{ projectId?: string; materialRequestId?: string }>();
  const { user } = useAuth();
  const api = useApi();
  const { online } = useOffline();
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [requestId, setRequestId] = useState<string | null>(params.materialRequestId ?? null);
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
  const request = receivable.data?.find((r) => r.id === requestId) ?? null;
  const requestOptions = useMemo(
    () => (receivable.data ?? []).map((r) => ({ value: r.id, label: `${r.requestNo} · ${r.lines.map((l) => l.itemName).join(', ')}`, hint: `Needed ${formatDate(r.requiredDate)} · ${MATERIAL_PRIORITY_LABELS[r.priority]}` })),
    [receivable.data],
  );

  // Each line starts at what is still pending.
  useEffect(() => {
    if (request) setQty(Object.fromEntries(request.lines.map((l) => [l.materialRequestItemId, Number(l.pending) > 0 ? l.pending : ''])));
  }, [request]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!request) e.request = 'Choose the material request';
    if (!isIsoDate(date)) e.date = 'Enter a valid date';
    else if (date > today()) e.date = 'The date cannot be in the future';
    let any = false;
    for (const l of request?.lines ?? []) {
      const v = (qty[l.materialRequestItemId] ?? '').trim();
      if (!v) continue;
      if (!QTY.test(v)) e[l.materialRequestItemId] = 'Enter a number (up to 3 decimals)';
      else if (Number(v) > Number(l.pending)) e[l.materialRequestItemId] = `Only ${fmtQty(l.pending)} ${l.unit} is pending`;
      else if (Number(v) > 0) any = true;
    }
    if (request && !any && !Object.keys(e).length) e.lines = 'Enter the quantity received on at least one line';
    if (photosUploading(photos)) e.photos = 'Wait for photos to finish uploading';
    else if (photosFailed(photos)) e.photos = 'Remove or retry failed photos';
    else if (photosQueued(photos)) e.photos = 'Photos need a connection to upload';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setSubmitError(null);
    if (!validate() || !request) return;
    setBusy(true);
    try {
      const lines = request.lines
        .map((l) => ({ materialRequestItemId: l.materialRequestItemId, quantity: (qty[l.materialRequestItemId] ?? '').trim() }))
        .filter((l) => l.quantity && Number(l.quantity) > 0);
      setSaved(
        await api.post<StockEntryDto>('/stock/receipts', {
          materialRequestId: request.id,
          date,
          supplier: supplier.trim() || null,
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
        title={`${saved.entryNo} saved`}
        subtitle={`${saved.lines.map((l) => `${l.itemName} ${fmtQty(l.quantity)} ${l.unit}`).join(', ')} received against ${saved.requestNo}.`}
        onAnother={() => {
          setSaved(null);
          setRequestId(null);
          setPhotos([]);
          setSupplier('');
          setChallanNo('');
          setVehicleNo('');
          setRemarks('');
          receivable.reload();
        }}
      />
    );
  }
  if (projects.loading && !projects.data) return <Loading />;
  if (user && !canKeepStock(user.roleKey)) return <EmptyState title="Not available for your role" subtitle="The store manager, site engineers and approvers receive material." icon="lock-closed-outline" />;

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Receive Material' }} />
      <ErrorBanner message={submitError ?? projects.error ?? (online ? receivable.error : 'You are offline. Receiving material needs a connection.')} />
      <Card>
        <Select
          label="Project"
          required
          value={projectId}
          options={projects.options}
          onChange={(v) => {
            setProjectId(v);
            setRequestId(null);
          }}
          placeholder="Choose project"
        />
        <Select
          label="Approved material request"
          required
          value={requestId}
          options={requestOptions}
          onChange={setRequestId}
          placeholder={receivable.loading ? 'Loading…' : requestOptions.length ? 'Choose request' : 'Nothing pending to receive'}
          disabled={!projectId || !requestOptions.length}
          error={errors.request}
        />
        <DatePicker label="Received on" required value={date} onChange={setDate} error={errors.date} />
      </Card>

      {request ? (
        <Card title="Quantities received">
          {request.lines.map((l) => (
            <View key={l.materialRequestItemId} style={styles.line}>
              <Text style={typography.bodyStrong}>{l.itemName}</Text>
              <Text style={typography.caption}>
                Requested {fmtQty(l.requested)} · received {fmtQty(l.received)} · pending {fmtQty(l.pending)} {l.unit}
              </Text>
              {Number(l.pending) > 0 ? (
                <Input
                  value={qty[l.materialRequestItemId] ?? ''}
                  onChangeText={(v) => setQty((q) => ({ ...q, [l.materialRequestItemId]: v }))}
                  keyboardType="decimal-pad"
                  placeholder={`0 ${l.unit}`}
                  right={<Text style={typography.caption}>{l.unit}</Text>}
                  error={errors[l.materialRequestItemId]}
                  containerStyle={styles.qty}
                />
              ) : (
                <Text style={styles.done}>Fully received</Text>
              )}
            </View>
          ))}
          {errors.lines ? <Text style={styles.err}>{errors.lines}</Text> : null}
        </Card>
      ) : null}

      <Card title="Delivery">
        <Input label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Supplier name" />
        <Input label="Challan / invoice no." value={challanNo} onChangeText={setChallanNo} />
        <Input label="Vehicle no." value={vehicleNo} onChangeText={setVehicleNo} autoCapitalize="characters" />
        <PhotoPicker label="Challan photo" photos={photos} onChange={setPhotos} max={4} />
        {errors.photos ? <Text style={styles.err}>{errors.photos}</Text> : null}
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} multiline containerStyle={styles.last} />
      </Card>
      <Button title="Save GRN" icon="checkmark" onPress={save} loading={busy} disabled={!online || !request} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  qty: { marginTop: spacing.sm, marginBottom: 0 },
  done: { color: colors.success, fontWeight: '600', marginTop: spacing.xs },
  err: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
  last: { marginBottom: 0 },
});
