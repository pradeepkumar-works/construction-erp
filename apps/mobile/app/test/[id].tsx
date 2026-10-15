import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { QualityTestDto, QualityTestReadingDto } from '@erp/shared';
import { TEST_KIND_LABELS, TEST_RESULT_LABELS, canRecordTest, specRange } from '@erp/shared';
import { useApi, useFetch } from '../../src/api/hooks';
import { errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { AttachmentGallery, Button, Card, ErrorBanner, ErrorState, Input, KeyValue, Loading, Pill, Screen } from '../../src/components';
import { TEST_RESULT_TONE } from '../../src/components/qualityTone';
import { colors, spacing, typography } from '../../src/theme';
import { formatDate } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

/** Enter one reading (the 7-day or 28-day cubes); the last reading decides the result against the specification. */
function ReadingRow({ test, r, onSaved }: { test: QualityTestDto; r: QualityTestReadingDto; onSaved: (x: QualityTestDto) => void }) {
  const api = useApi();
  const t = useT();
  const [value, setValue] = useState(r.value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const v = value.trim().replace(',', '.');
    if (v && !/^\d+(\.\d+)?$/.test(v)) return setError(t('Enter a number'));
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.post<QualityTestDto>(`/quality/tests/${test.id}/readings/${r.id}`, { value: v || null }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.reading}>
      <Text style={styles.label}>
        {r.label}
        {r.dueOn ? <Text style={[typography.caption, r.overdue && styles.overdue]}> · {t('due {date}', { date: formatDate(r.dueOn) })}</Text> : null}
      </Text>
      <View style={styles.row}>
        <Input value={value} onChangeText={setValue} placeholder={test.unit ?? t('Value')} keyboardType="decimal-pad" error={error ?? undefined} style={styles.flex} />
        <Button title={t('Save')} onPress={save} loading={busy} disabled={value.trim() === (r.value ?? '')} variant="secondary" />
      </View>
    </View>
  );
}

export default function TestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<QualityTestDto>((a) => a.get(`/quality/tests/${id}`), [id], { enabled: !!id });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const mayRecord = !!user && canRecordTest(user.roleKey);
  const spec =
    data.specMin !== null && data.specMax !== null
      ? `${t('{from} to {to}', { from: Number(data.specMin), to: Number(data.specMax) })}${data.unit ? ` ${data.unit}` : ''}`
      : specRange(data.specMin, data.specMax, data.unit);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} keyboard>
      <View style={styles.head}>
        <Text style={typography.caption}>
          {data.testNo} · {t(TEST_KIND_LABELS[data.kind])} · {data.projectName}
        </Text>
        <Text style={typography.h2}>{data.title}</Text>
        <View style={styles.pills}>
          <Pill text={t(TEST_RESULT_LABELS[data.result])} {...TEST_RESULT_TONE[data.result]} />
          {data.overdue ? <Pill text={t('Result overdue')} fg={colors.danger} bg={colors.dangerSoft} /> : null}
        </View>
      </View>
      <ErrorBanner message={null} />
      <Card>
        <KeyValue label={t('Sampled on')} value={formatDate(data.sampledOn)} />
        <KeyValue label={t('Location')} value={data.location} />
        <KeyValue label={t('Activity')} value={data.activityName} />
        <KeyValue label={t('Specification')} value={data.specification} multiline />
        <KeyValue label={t('Passes at')} value={spec ?? t('As judged by the tester')} />
        <KeyValue label={t('Remarks')} value={data.remarks} multiline />
      </Card>
      <Card title={t('Readings')}>
        {data.readings.map((r) =>
          mayRecord ? (
            <ReadingRow key={`${r.id}:${r.value}`} test={data} r={r} onSaved={setData} />
          ) : (
            <KeyValue key={r.id} label={r.label} value={r.value !== null ? `${Number(r.value)}${data.unit ? ` ${data.unit}` : ''}` : r.dueOn ? t('due {date}', { date: formatDate(r.dueOn) }) : null} />
          ),
        )}
        {spec && data.readings.length > 1 ? <Text style={typography.caption}>{t('The last reading decides the result.')}</Text> : null}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  reading: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  overdue: { color: colors.danger, fontWeight: '700' },
});
