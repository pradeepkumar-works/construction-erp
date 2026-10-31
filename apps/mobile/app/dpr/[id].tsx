import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DPR_BUILT_INS,
  DPR_SECTION_LABELS,
  STANDARD_DPR_FORM,
  WEATHER_LABELS,
  crewCheck,
  dprActivityLabel,
  dprSetting,
  dprShows,
  filledExtra,
  groupLines,
  lineLocation,
  ownFieldLabel,
  ownFieldsOf,
  type DailyReportDto,
  type DprBuiltInKey,
} from '@erp/shared';
import { useFetch } from '../../src/api/hooks';
import { AttachmentGallery, PhotoChecks, Card, ErrorState, KeyValue, Loading, ReviewActions, Screen, SubmissionHeader, SubmitterActions } from '../../src/components';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { formatDate, fmtQty } from '../../src/utils/format';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';

export default function DprDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const { language } = useLanguage();
  const { data, loading, refreshing, error, refresh, reload, setData } = useFetch<DailyReportDto>((api) => api.get(`/dpr/${id}`), [id], { enabled: !!id });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  // The company's own fields of the form it was made on (item 134 part 2), in the phone's language.
  const def = data.form?.def ?? STANDARD_DPR_FORM;
  // Named and shown as on the form it was made on: the company's own name as typed, else the web's in the phone's language.
  const L = (key: DprBuiltInKey) => dprSetting(def, key).label ?? t(DPR_BUILT_INS[key].label);
  const shows = (key: DprBuiltInKey, value: unknown) => dprShows(def, key) || (Array.isArray(value) ? value.length > 0 : !!value);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SubmissionHeader item={data} title={`DPR · ${formatDate(data.date)}`} subtitle={data.projectName} />
      <Card title={t('Site')}>
        {shows('weather', data.weather) ? <KeyValue label={L('weather')} value={data.weather ? t(WEATHER_LABELS[data.weather]) : null} /> : null}
        {shows('siteCondition', data.siteCondition) ? <KeyValue label={L('siteCondition')} value={data.siteCondition} /> : null}
        {filledExtra(ownFieldsOf(def, 'DAY'), data.extra).map((x) => (
          <KeyValue key={x.field.key} label={ownFieldLabel(x.field, language)} value={x.text === 'Yes' || x.text === 'No' ? t(x.text) : x.text} />
        ))}
      </Card>
      {shows('manpower', data.manpower) ? (
        <Card title={L('manpower')} right={<Text maxFontSizeMultiplier={maxFontScale} style={styles.total}>{t('Total {n}', { n: data.totalManpower })}</Text>}>
          {data.manpower.length === 0 ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('No manpower recorded')}</Text> : data.manpower.map((m, i) => <KeyValue key={`${m.category}-${i}`} label={t(m.category)} value={String(m.count)} />)}
        </Card>
      ) : null}
      {shows('machinery', data.machinery) ? (
        <Card title={L('machinery')}>
          {data.machinery.length === 0 ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('No machinery recorded')}</Text> : data.machinery.map((m, i) => <KeyValue key={`${m.name}-${i}`} label={m.name} value={t('{h} h', { h: m.hours })} />)}
        </Card>
      ) : null}
      {data.lines?.length ? (
        <Card title={L('lines')}>
          {groupLines(data.lines).map((g) => (
            <View key={g.key} style={styles.group}>
              <Text maxFontSizeMultiplier={maxFontScale} style={typography.label}>{g.label === 'Outside the breakdown' ? t('Outside the breakdown') : g.label}</Text>
              {g.lines.map((l) => (
                <View key={l.id} style={styles.line}>
                  <Text maxFontSizeMultiplier={maxFontScale} style={typography.bodyStrong}>{dprActivityLabel({ name: l.activityName, parentActivityName: l.parentActivityName })}</Text>
                  {lineLocation(l) ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{lineLocation(l)}</Text> : null}
                  <Text maxFontSizeMultiplier={maxFontScale} style={typography.body}>
                    {t('Today {q} {unit} · {cum} of {scope} ({pct}%)', { q: fmtQty(l.quantity), unit: l.unit, cum: fmtQty(l.cumulative), scope: fmtQty(l.scope), pct: l.pct ?? 0 })}
                  </Text>
                  {l.labour.length ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{l.labour.map((m) => `${t(m.category)} ${m.count}`).join(', ')}</Text> : null}
                  {l.materials.length ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{l.materials.map((m) => `${m.itemName} ${fmtQty(m.quantity)} ${m.unit}`).join(', ')}</Text> : null}
                  {filledExtra(ownFieldsOf(def, 'LINE'), l.extra).length ? (
                    <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                      {filledExtra(ownFieldsOf(def, 'LINE'), l.extra)
                        .map((x) => `${ownFieldLabel(x.field, language)}: ${x.text === 'Yes' || x.text === 'No' ? t(x.text) : x.text}`)
                        .join(', ')}
                    </Text>
                  ) : null}
                  {l.attachments.length ? <AttachmentGallery attachments={l.attachments} /> : null}
                </View>
              ))}
            </View>
          ))}
          {(() => {
            const c = crewCheck(data.lines!, data.manpower);
            return c.headCount !== null && c.difference ? (
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.muted}>
                {c.difference > 0 ? t('{on} of the {n} on site are on a work line; {off} on none', { on: c.onLines, n: c.headCount, off: c.difference }) : t('The work lines name {on} people, {more} more than the {n} on site', { on: c.onLines, more: -c.difference, n: c.headCount })}
              </Text>
            ) : null;
          })()}
        </Card>
      ) : null}
      <Card title={t(DPR_SECTION_LABELS.NOTES)}>
        <Block label={data.lines?.length ? t('Other work and notes') : t('Work executed')} value={data.workExecuted} />
        {shows('materialReceived', data.materialReceived) ? <Block label={L('materialReceived')} value={data.materialReceived} /> : null}
        {shows('testsConducted', data.testsConducted) ? <Block label={L('testsConducted')} value={data.testsConducted} /> : null}
        {shows('safetyObservations', data.safetyObservations) ? <Block label={L('safetyObservations')} value={data.safetyObservations} /> : null}
        {shows('issues', data.issues) ? <Block label={L('issues')} value={data.issues} /> : null}
        {shows('nextDayPlan', data.nextDayPlan) ? <Block label={L('nextDayPlan')} value={data.nextDayPlan} /> : null}
      </Card>
      <AttachmentGallery attachments={data.attachments} />
      <PhotoChecks kind="dpr" id={data.id} attachments={data.attachments} />
      <SubmitterActions type="DPR" item={data} />
      <ReviewActions type="DPR" item={data} onReviewed={setData} />
    </Screen>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.block}>
      <Text maxFontSizeMultiplier={maxFontScale} style={typography.label}>{label}</Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.body, !value && styles.muted]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  total: { ...typography.bodyStrong, color: colors.primary },
  block: { marginBottom: spacing.md, gap: 2 },
  muted: { color: colors.textMuted },
  group: { marginBottom: spacing.md, gap: spacing.xs },
  line: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
});
