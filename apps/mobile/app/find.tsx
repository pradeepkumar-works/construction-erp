import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LAUNCHER_PIN_MAX, isGuest, isSupplier, navMenuFor, navNode, navSettingsOf, navTarget, type NavMenuModule, type NavNode, type NavVisitDto } from '@erp/shared';
import { useAuth } from '../src/auth/AuthContext';
import { IconButton, Input, Screen, SectionTitle, Touchable } from '../src/components';
import { NavIcon } from '../src/components/NavIcon';
import { findInMenu, menuPages } from '../src/home/find';
import { familyOf } from '../src/home/menu';
import { useOpenNode } from '../src/launcher/open';
import { phoneTarget, visitNode } from '../src/launcher/routes';
import { useTileMenu } from '../src/launcher/TileMenu';
import { useLauncher } from '../src/launcher/useLauncher';
import { colors, familyTint, maxFontScale, spacing, typography } from '../src/theme';
import { timeAgo } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

const RECENT_SHOWN = 8;

/**
 * Search and Edit menu (Home's search icon, and its last icon): the modules and pages of the company's menu by name, the
 * places opened lately on any device, and a pin on each page to put it on Home or take it off. With `edit` it starts
 * from the pins and lists every page of each module to choose from.
 */
export default function FindScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === '1';
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const launcher = useLauncher();
  const { open, openVisit, sheet } = useOpenNode(launcher.webUrl);
  const { openMenu, menu: tileMenu } = useTileMenu(launcher);
  const [query, setQuery] = useState('');
  const menu = useMemo(() => (!user || isGuest(user.roleKey) || isSupplier(user.roleKey) ? [] : navMenuFor(user, navSettingsOf(user))), [user]);
  const found = useMemo(() => findInMenu(menu, query, t), [menu, query, t]);
  const pinnedNodes = launcher.pins.flatMap((p) => (p.kind === 'NODE' ? (navNode(p.target) ?? []) : []));
  const openModule = (m: NavMenuModule) => router.push({ pathname: '/module/[key]', params: { key: m.key } });

  const togglePin = (node: NavNode) => {
    const pinned = launcher.pinOf(node);
    if (pinned) void launcher.unpin(pinned);
    else void launcher.pin(node);
  };
  const row = (node: NavNode, place: string | null, key: string) => (
    <PageRow key={key} node={node} place={place} pinned={!!launcher.pinOf(node)} onOpen={() => open(node)} onMenu={() => openMenu(node)} onPin={() => togglePin(node)} />
  );

  return (
    <Screen keyboard refreshing={launcher.refreshing} onRefresh={() => void launcher.refresh()}>
      <Stack.Screen options={{ title: editing ? t('Edit menu') : t('Search') }} />
      <Input
        accessibilityLabel={t('Search modules and pages')}
        placeholder={t('Search modules and pages')}
        value={query}
        onChangeText={setQuery}
        autoFocus={!editing}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {query.trim() ? (
        <>
          {found.modules.length ? (
            <>
              <SectionTitle title={t('Modules')} />
              {found.modules.map((m) => (
                <ModuleRow key={m.key} module={m} onOpen={() => openModule(m)} />
              ))}
            </>
          ) : null}
          {found.pages.length ? (
            <>
              <SectionTitle title={t('Pages')} />
              {found.pages.map((p) => row(p.node, t(p.module.label), `${p.module.key}-${p.node.id}`))}
            </>
          ) : null}
          {!found.modules.length && !found.pages.length ? (
            <Text style={[typography.caption, styles.hint]} maxFontSizeMultiplier={maxFontScale}>
              {t('Nothing in your menu is called that. Try another word.')}
            </Text>
          ) : null}
        </>
      ) : editing ? (
        <>
          <Text style={[typography.caption, styles.hint]} maxFontSizeMultiplier={maxFontScale}>
            {t('Pin up to {n} pages to Home. A long press on a pinned page moves it. Pins follow you to the web.', { n: LAUNCHER_PIN_MAX })}
          </Text>
          <SectionTitle title={t('On Home')} />
          {pinnedNodes.length ? (
            pinnedNodes.map((n) => row(n, null, `pin-${n.id}`))
          ) : (
            <Text style={[typography.caption, styles.hint]} maxFontSizeMultiplier={maxFontScale}>
              {t('Nothing pinned yet.')}
            </Text>
          )}
          {menu.map((m) => (
            <View key={m.key}>
              <SectionTitle title={t(m.label)} />
              {menuPages([m]).map((p) => row(p.node, null, `${m.key}-${p.node.id}`))}
            </View>
          ))}
        </>
      ) : (
        <>
          {launcher.recent.length ? (
            <>
              <SectionTitle title={t('Recent')} />
              {launcher.recent.slice(0, RECENT_SHOWN).map((v) => (
                <RecentRow key={`${v.kind}-${v.target}`} visit={v} onPress={() => openVisit(v)} />
              ))}
            </>
          ) : null}
          <SectionTitle title={t('Modules')} />
          {menu.map((m) => (
            <ModuleRow key={m.key} module={m} onOpen={() => openModule(m)} />
          ))}
        </>
      )}
      {sheet}
      {tileMenu}
    </Screen>
  );
}

/** A module of the company's menu: its icon in its colour, its name and line. */
function ModuleRow({ module, onOpen }: { module: NavMenuModule; onOpen: () => void }) {
  const t = useT();
  const tint = familyTint[module.family];
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={t(module.label)} onPress={onOpen} style={styles.row}>
      <View style={[styles.chip, { backgroundColor: tint.bg }]}>
        <NavIcon name={module.icon} size={20} color={tint.fg} />
      </View>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
          {t(module.label)}
        </Text>
        <Text style={typography.caption} numberOfLines={2} maxFontSizeMultiplier={maxFontScale}>
          {t(module.description)}
        </Text>
      </View>
      <NavIcon name="chevron-right" size={20} color={colors.textMuted} />
    </Touchable>
  );
}

/** A page: its icon, name, the module it is in (or where it opens), and its pin. */
function PageRow({ node, place, pinned, onOpen, onMenu, onPin }: { node: NavNode; place: string | null; pinned: boolean; onOpen: () => void; onMenu: () => void; onPin: () => void }) {
  const t = useT();
  const target = navTarget(node);
  const web = phoneTarget(target)?.kind === 'web' || phoneTarget(target)?.kind === 'project';
  const tint = familyTint[familyOf(node)];
  const sub = [place, web ? t('Opens on the web') : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <Touchable
        accessibilityRole={web ? 'link' : 'button'}
        accessibilityLabel={sub ? `${t(node.label)}, ${sub}` : t(node.label)}
        accessibilityActions={[{ name: 'longpress', label: t('Tile options') }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onMenu()}
        onPress={onOpen}
        onLongPress={onMenu}
        style={styles.rowMain}
      >
        <View style={[styles.chip, { backgroundColor: tint.bg }]}>
          <NavIcon name={node.icon} size={20} color={tint.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
            {t(node.label)}
          </Text>
          {sub ? (
            <Text style={typography.caption} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
              {sub}
            </Text>
          ) : null}
        </View>
      </Touchable>
      <IconButton
        icon={pinned ? 'pin' : 'pin-outline'}
        color={pinned ? colors.primary : colors.textMuted}
        accessibilityLabel={pinned ? t('Unpin {name} from Home', { name: t(node.label) }) : t('Pin {name} to Home', { name: t(node.label) })}
        onPress={onPin}
      />
    </View>
  );
}

/** A place opened lately, on this phone or the web: its icon, name and what it is. */
function RecentRow({ visit, onPress }: { visit: NavVisitDto; onPress: () => void }) {
  const t = useT();
  const node = visitNode(visit);
  const icon = node?.icon ?? (visit.kind === 'PROJECT' ? 'folder-kanban' : 'file-text');
  const kind = node && node.parent === null && !node.route ? t('Module') : visit.kind === 'PROJECT' ? t('Project') : visit.kind === 'RECORD' ? t('Entry') : t('Page');
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={`${node ? t(node.label) : visit.label}, ${kind}`} onPress={onPress} style={styles.row}>
      <NavIcon name={icon} size={20} color={colors.textMuted} />
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
          {node ? t(node.label) : visit.label}
        </Text>
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {kind} · {timeAgo(visit.lastAt)}
        </Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.xs },
  chip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
