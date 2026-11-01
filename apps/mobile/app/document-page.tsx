import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { DocumentPageViewDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { absoluteUrl } from '../src/config';
import { Button, Card, ErrorState, Loading, Screen } from '../src/components';
import { maxFontScale, spacing, typography } from '../src/theme';
import { useT } from '../src/i18n/LanguageContext';

/**
 * A page of a filed contract, specification or letter (Ask the contract): where a citation in an answer
 * leads on the phone. Shows the page's text, and opens the PDF at that page in the browser.
 */
export default function DocumentPageScreen() {
  const { file, page: pageParam } = useLocalSearchParams<{ file: string; page?: string }>();
  const page = Math.max(1, Number(pageParam) || 1);
  const router = useRouter();
  const t = useT();
  const { data, loading, refreshing, error, refresh, reload } = useFetch<DocumentPageViewDto>((a) => a.get(`/documents/files/${file}/pages/${page}`), [file, page], { enabled: !!file });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const go = (p: number) => router.setParams({ page: String(p) });
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.head}>
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {data.pages ? t('Page {n} of {total}', { n: page, total: data.pages }) : t('Page {n}', { n: page })}
        </Text>
        <Text style={typography.h2} maxFontSizeMultiplier={maxFontScale}>
          {data.title}
        </Text>
      </View>
      <Button title={t('Open the file at this page')} icon="document-text-outline" onPress={() => void WebBrowser.openBrowserAsync(`${absoluteUrl(data.url)}#page=${page}`)} />
      <Card title={t('Text on this page')}>
        <Text style={typography.body} selectable maxFontSizeMultiplier={maxFontScale}>
          {data.text ?? t('No text was read from this page. It may be a scanned image; read it in the file.')}
        </Text>
      </Card>
      <View style={styles.row}>
        <Button title={t('Previous page')} variant="secondary" icon="chevron-back" disabled={page <= 1} onPress={() => go(page - 1)} style={styles.half} />
        <Button title={t('Next page')} variant="secondary" icon="chevron-forward" disabled={!!data.pages && page >= data.pages} onPress={() => go(page + 1)} style={styles.half} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  half: { flex: 1 },
});
