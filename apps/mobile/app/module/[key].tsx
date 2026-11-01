import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { canSeeNav, isGuest, isSupplier, navMenuFor, navNode, navSettingsOf, navTilesFor, type NavMenuModule, type NavNode } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { EmptyState, Screen } from '../../src/components';
import { NavIcon } from '../../src/components/NavIcon';
import { NavRow } from '../../src/components/NavTile';
import { useOpenNode } from '../../src/launcher/open';
import { phoneTarget } from '../../src/launcher/routes';
import { useTileMenu } from '../../src/launcher/TileMenu';
import { useLauncher } from '../../src/launcher/useLauncher';
import { familyTint, maxFontScale, spacing, typography } from '../../src/theme';
import { useT } from '../../src/i18n/LanguageContext';

/**
 * A module's screen on the phone, as `/modules/<key>` on the web: a module of the company's menu
 * (`navMenuFor`, in its set and under its name) with the pages the role opens. The tree's own modules keep their pages'
 * headings; a department module shows its sub-modules as the headings. A page the phone has a screen of opens it; the
 * others open on the web.
 */
export default function ModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { user } = useAuth();
  const t = useT();
  const launcher = useLauncher();
  const { open, sheet } = useOpenNode(launcher.webUrl);
  const { openMenu, menu } = useTileMenu(launcher);
  const inMenu = user && !isGuest(user.roleKey) && !isSupplier(user.roleKey) ? navMenuFor(user, navSettingsOf(user)).find((m) => m.key === key) : undefined;
  // One of the tree's modules opened from a pin or Recent while the company's menu is in departments.
  const treeModule = key ? navNode(key) : undefined;
  const ownTree = !!user && !!treeModule && treeModule.parent === null && !treeModule.route && canSeeNav(user, treeModule);
  const module: Pick<NavMenuModule, 'key' | 'label' | 'icon' | 'family' | 'description' | 'subs'> | undefined =
    inMenu ?? (ownTree && treeModule ? { key: treeModule.id, label: treeModule.label, icon: treeModule.icon, family: treeModule.family ?? 'work', description: treeModule.description, subs: [] } : undefined);

  // The tree's module: its pages under their heading, in the tree's order, pages without one first. A department
  // module: each sub-module a heading.
  const groups: { title: string | null; nodes: NavNode[] }[] = [];
  if (module && user && ownTree && treeModule) {
    for (const n of navTilesFor(user, treeModule.id)) {
      const title = n.group ?? null;
      const g = groups.find((x) => x.title === title);
      if (g) g.nodes.push(n);
      else groups.push({ title, nodes: [n] });
    }
  } else if (module) {
    for (const sub of module.subs) groups.push({ title: sub.label, nodes: sub.nodes });
  }
  const tint = module ? familyTint[module.family] : null;

  return (
    <Screen refreshing={launcher.refreshing} onRefresh={launcher.refresh}>
      <Stack.Screen options={{ title: module ? t(module.label) : t('Module') }} />
      {!module || !tint ? (
        <EmptyState title={t('Your role does not open this module')} subtitle={t('Ask your admin if you need it.')} icon="lock-closed-outline" />
      ) : (
        <>
          <View style={styles.head}>
            <View style={[styles.chip, { backgroundColor: tint.bg }]}>
              <NavIcon name={module.icon} size={26} color={tint.fg} />
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
