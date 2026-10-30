import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { homeTabSections, type HomeTabKey, type HOME_TABS, type NavMenuModule, type NavNode } from '@erp/shared';
import { Touchable } from '../components/Touchable';
import { useT } from '../i18n/LanguageContext';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { MenuGrid } from './MenuGrid';
import type { MenuItem } from './menu';

type Tab = (typeof HOME_TABS)[number];

/**
 * The row of tabs over Home's menu: Overview (the menu as it is) and the work the user's modules are for (`homeTabsFor`),
 * as pills that scroll sideways on a narrow phone. The picked tab is scrolled into view.
 */
export function HomeTabs({ tabs, value, onChange }: { tabs: readonly Tab[]; value: HomeTabKey; onChange: (key: HomeTabKey) => void }) {
  const t = useT();
  const scroll = useRef<ScrollView>(null);
  const at = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = at.current[value];
    if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - spacing.xl), animated: true });
  }, [value]);
  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.row} accessibilityRole="tablist" accessibilityLabel={t('Menu')}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Touchable
            key={tab.key}
            onLayout={(e) => (at.current[tab.key] = e.nativeEvent.layout.x)}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(tab.label)}
            style={[styles.tab, active && styles.active]}
          >
            <Text style={[styles.text, active && styles.activeText]} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
              {t(tab.label)}
            </Text>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

/**
 * A Home tab other than Overview: each module of the company's menu that belongs here (or the part of it that does) as a
 * heading, under the company's name, with its pages as icons. The heading opens the module's screen, where its masters are.
 */
export function TabPages({ menu, tab, badges, onOpen, onMenu }: { menu: NavMenuModule[]; tab: Exclude<HomeTabKey, 'overview'>; badges: Record<string, number>; onOpen: (node: NavNode) => void; onMenu: (node: NavNode) => void }) {
  const t = useT();
  return (
    <View style={styles.pages}>
      {homeTabSections(menu, tab).map((s) => {
        const items: MenuItem[] = s.nodes.map((n) => ({ kind: 'node', key: n.id, node: n, badge: badges[n.shortcutOf ?? n.id] }));
        return (
          <View key={s.key}>
            <Touchable
              onPress={() => router.push({ pathname: '/module/[key]', params: { key: s.module.key } })}
              accessibilityRole="link"
              accessibilityLabel={t('Open {name}', { name: t(s.module.label) })}
              style={styles.head}
            >
              <Text style={[typography.label, styles.headText]} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
                {t(s.title)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Touchable>
            <MenuGrid items={items} onOpen={(item) => item.kind === 'node' && onOpen(item.node)} onMenu={onMenu} compact />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginTop: spacing.xl, marginHorizontal: -spacing.lg, flexGrow: 0 },
  row: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  tab: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.text },
  activeText: { color: colors.textOnPrimary },
  pages: { marginTop: spacing.md, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touch.min },
  headText: { flexShrink: 1 },
});
