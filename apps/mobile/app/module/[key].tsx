import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { canSeeNav, navNode, navTilesFor, type NavNode } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { EmptyState, Screen } from '../../src/components';
import { NavIcon } from '../../src/components/NavIcon';
import { NavRow, navTone } from '../../src/components/NavTile';
import { useOpenNode } from '../../src/launcher/open';
import { phoneTarget } from '../../src/launcher/routes';
import { useTileMenu } from '../../src/launcher/TileMenu';
import { useLauncher } from '../../src/launcher/useLauncher';
import { colors, maxFontScale, spacing, typography } from '../../src/theme';
import { useT } from '../../src/i18n/LanguageContext';

/**
 * A module's screen on the phone (launcher phase 4), as `/modules/<key>` on the web: its pages from the navigation tree
 * that the role opens, under their headings. A page the phone has a screen of opens it; the others open on the web.
 */
export default function ModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { user } = useAuth();
  const t = useT();
  const launcher = useLauncher();
  const { open, sheet } = useOpenNode(launcher.webUrl);
  const { openMenu, menu } = useTileMenu(launcher);
  const module = key ? navNode(key) : undefined;
  const visible = !!user && !!module && module.parent === null && canSeeNav(user, module);
  const pages = visible ? navTilesFor(user, module.id) : [];

  // Pages under their heading, in the tree's order; pages without one first.
  const groups: { title: string | null; nodes: NavNode[] }[] = [];
  for (const n of pages) {
    const title = n.group ?? null;
    const g = groups.find((x) => x.title === title);
    if (g) g.nodes.push(n);
    else groups.push({ title, nodes: [n] });
  }

  return (
    <Screen refreshing={launcher.refreshing} onRefresh={launcher.refresh}>
      <Stack.Screen options={{ title: module ? t(module.label) : t('Module') }} />
      {!visible || !module ? (
        <EmptyState title={t('Your role does not open this module')} subtitle={t('Ask your admin if you need it.')} icon="lock-closed-outline" />
      ) : (
        <>
          <View style={styles.head}>
            <View style={[styles.chip, { backgroundColor: navTone(module) }]}>
              <NavIcon name={module.icon} size={26} color={colors.onTile} />
            </View>
            <Text style={[typography.caption, styles.flex]} maxFontSizeMultiplier={maxFontScale}>
              {t(module.description)}
            </Text>
          </View>
          {groups.map((g) => (
            <View key={g.title ?? '-'} style={styles.group}>
              {g.title ? (
                <Text style={typography.label} accessibilityRole="header" maxFontSizeMultiplier={maxFontScale}>
                  {t(g.title)}
                </Text>
              ) : null}
              {g.nodes.map((n) => (
                <NavRow key={n.id} node={n} badge={launcher.badges[n.id]} web={phoneTarget(n)?.kind === 'web' || phoneTarget(n)?.kind === 'project'} onOpen={() => open(n)} onMenu={() => openMenu(n)} />
              ))}
            </View>
          ))}
        </>
      )}
      {sheet}
      {menu}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  chip: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  group: { marginBottom: spacing.lg },
});
