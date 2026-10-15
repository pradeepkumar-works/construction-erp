import React, { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRODUCT_NAME } from '@erp/shared';
import { ILLUSTRATIONS } from '../illustrations';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './Button';
import { useT } from '../i18n/LanguageContext';

const SEEN_KEY = 'nirmaan.introSeen';

const SLIDES = [
  {
    art: ILLUSTRATIONS.reportFromSite,
    title: 'Report from site',
    text: 'Progress, DPRs, attendance and material requests from your phone, with photos. No signal? Entries wait and send themselves later.',
  },
  {
    art: ILLUSTRATIONS.approveOnTheGo,
    title: 'Approve on the go',
    text: 'Project managers get a notification and approve the day’s entries from the phone, or send them back with a reason.',
  },
  {
    art: ILLUSTRATIONS.billAndGetPaid,
    title: 'Bill and get paid',
    text: 'Approved measurements become RA bills, and every payment against them is tracked.',
  },
];

/** Whether the first-launch intro has been shown on this phone (null while reading). */
export function useIntroSeen(): [boolean | null, () => void] {
  const [seen, setSeen] = useState<boolean | null>(null);
  React.useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(true));
  }, []);
  const markSeen = () => {
    setSeen(true);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
  };
  return [seen, markSeen];
}

/** Three slides shown before the first sign-in on a phone. */
export function Intro({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const t = useT();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const last = page === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const next = () => {
    if (last) return onDone();
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };
  const art = Math.min(width - spacing.xl * 2, 340);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.top}>
        <Text style={styles.brand}>{PRODUCT_NAME.toUpperCase()}</Text>
        {!last ? <Button title={t('Skip')} variant="ghost" size="sm" onPress={onDone} /> : null}
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
        style={styles.pager}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width, height: pagerHeight || undefined }]}>
            <Image source={s.art} style={{ width: art, height: art }} accessibilityIgnoresInvertColors />
            <Text style={styles.title} accessibilityRole="header">
              {t(s.title)}
            </Text>
            <Text style={styles.text}>{t(s.text)}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityLabel={t('Page {n} of {total}', { n: page + 1, total: SLIDES.length })}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.footer}>
        <Button title={last ? t('Get started') : t('Next')} onPress={next} icon={last ? 'log-in-outline' : 'arrow-forward'} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, minHeight: 48 },
  brand: { ...typography.wordmark, fontSize: 18, letterSpacing: 2, color: colors.primaryDark },
  pager: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { ...typography.h1, marginTop: spacing.lg, textAlign: 'center' },
  text: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22, maxWidth: 360 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.primary },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
});
