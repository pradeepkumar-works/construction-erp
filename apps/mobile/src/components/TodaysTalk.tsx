import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ToolboxTalkDraftDto } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { useT } from '../i18n/LanguageContext';
import { maxFontScale, spacing, typography } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Chips } from './Chips';
import { Skeleton } from './Skeleton';

type Lang = 'hi' | 'en';
/** Each language named in its own script, so a worker finds theirs whatever the app's language. */
const LANGS: { value: Lang; label: string }[] = [
  { value: 'hi', label: 'हिन्दी' },
  { value: 'en', label: 'English' },
];

/**
 * Today's toolbox talk (intelligence quick win Q8): the five-minute talk for the project from `GET /safety/talks/today`,
 * in Hindi first, to read out before work. Use this talk fills the form's topic and points; nothing is saved until the
 * talk is recorded. Kept on the phone, so the last one shows offline.
 */
export function TodaysTalk({ projectId, onUse }: { projectId: string; onUse: (talk: ToolboxTalkDraftDto) => void }) {
  const t = useT();
  const [lang, setLang] = useState<Lang>('hi');
  const talk = useFetch<ToolboxTalkDraftDto>((a) => a.get('/safety/talks/today', { projectId }), [projectId], { refetchOnFocus: false, cacheKey: `talk-today:${projectId}` });
  if (talk.loading && !talk.data) return <Skeleton variant="card" rows={4} label={t("Loading today's talk")} />;
  const d = talk.data;
  if (!d) return null;
  return (
    <Card title={t("Today's talk")}>
      <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
        {t('Read this out before work, about {n} minutes.', { n: d.minutes })}
      </Text>
      <Chips groupLabel={t('Language of the talk')} value={lang} onChange={(v) => v && setLang(v)} clearable={false} options={LANGS} />
      <Text style={typography.body} maxFontSizeMultiplier={maxFontScale}>
        {d.opening[lang]}
      </Text>
      {d.sections.map((s) => (
        <View key={s.hazard} style={styles.section}>
          <Text style={typography.bodyStrong} accessibilityRole="header" maxFontSizeMultiplier={maxFontScale}>
            {s.title[lang]}
          </Text>
          {s.points.map((p) => (
            <Text key={p.en} style={[typography.body, styles.point]} maxFontSizeMultiplier={maxFontScale}>
              {`•  ${p[lang]}`}
            </Text>
          ))}
        </View>
      ))}
      {d.incidents.map((i) => (
        <Text key={i.en} style={[typography.body, styles.section]} maxFontSizeMultiplier={maxFontScale}>
          {i[lang]}
        </Text>
      ))}
      <Text style={[typography.bodyStrong, styles.section]} maxFontSizeMultiplier={maxFontScale}>
        {d.closing[lang]}
      </Text>
      <Button title={t('Use this talk')} icon="checkmark-circle-outline" variant="secondary" onPress={() => onUse(d)} style={styles.section} />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md },
  point: { marginTop: spacing.xs },
});
