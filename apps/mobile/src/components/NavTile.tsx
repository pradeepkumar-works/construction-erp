import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { navNode, navTarget, type NavFamily, type NavNode } from '@erp/shared';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { NavIcon } from './NavIcon';
import { Touchable } from './Touchable';

/** A module's colour family on the phone: solid hues with a white icon, as the Submit tiles (the same in both palettes). */
const FAMILY_TONE: Record<NavFamily, string> = {
  work: colors.tileBlue,
  materials: colors.tileTeal,
  buying: colors.tileAmber,
  money: colors.tileGreen,
  people: colors.tileViolet,
  business: colors.tileBrick,
  insight: colors.tileCyan,
  admin: colors.tileSlate,
};

/** A node's tone: its own family, else its module's. */
export function navTone(node: NavNode): string {
  let n: NavNode | undefined = navTarget(node);
  while (n && !n.family) n = n.parent ? navNode(n.parent) : undefined;
  return n?.family ? FAMILY_TONE[n.family] : colors.tileSlate;
}

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/** What a screen reader hears for a tile: its name, and what waits there. */
function useTileLabel() {
  const t = useT();
  return (node: NavNode, badge?: number) => (badge ? t('{name}, {n} waiting', { name: t(node.label), n: badge }) : t(node.label));
}

/** Home's module tiles: two columns on a phone, more on a tablet. A long press opens the tile's menu (Pin to Home). */
export function NavTileGrid({ nodes, badges, onOpen, onMenu }: { nodes: NavNode[]; badges?: Record<string, number>; onOpen: (n: NavNode) => void; onMenu: (n: NavNode) => void }) {
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const label = useTileLabel();
  const t = useT();
  return (
    <View style={styles.grid}>
      {nodes.map((node) => {
        const badge = badges?.[node.id];
        return (
          <View key={node.id} style={{ width: `${100 / columns}%` }}>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={label(node, badge)}
              accessibilityHint={t('Long press for Pin to Home')}
              accessibilityActions={[{ name: 'longpress', label: t('Tile options') }]}
              onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onMenu(node)}
              onPress={() => onOpen(node)}
              onLongPress={() => onMenu(node)}
              style={styles.tile}
            >
              <View style={[styles.chip, { backgroundColor: navTone(node) }]}>
                <NavIcon name={node.icon} color={colors.onTile} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                      {badgeText(badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.tileLabel} numberOfLines={2} maxFontSizeMultiplier={maxFontScale}>
                {t(node.label)}
              </Text>
            </Touchable>
          </View>
        );
      })}
    </View>
  );
}

/** Pinned: name and icon in a row, so more fit; the same long press menu (Move, Unpin). */
export function PinnedRow({ nodes, onOpen, onMenu }: { nodes: NavNode[]; onOpen: (n: NavNode) => void; onMenu: (n: NavNode) => void }) {
  const t = useT();
  return (
    <View style={styles.pins}>
      {nodes.map((node) => (
        <Touchable
          key={node.id}
          accessibilityRole="button"
          accessibilityLabel={t(node.label)}
          accessibilityHint={t('Long press to move or unpin')}
          accessibilityActions={[{ name: 'longpress', label: t('Tile options') }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onMenu(node)}
          onPress={() => onOpen(node)}
          onLongPress={() => onMenu(node)}
          style={styles.pin}
        >
          <View style={[styles.pinChip, { backgroundColor: navTone(node) }]}>
            <NavIcon name={node.icon} size={18} color={colors.onTile} />
          </View>
          <Text style={styles.pinLabel} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
            {t(node.label)}
          </Text>
        </Touchable>
      ))}
    </View>
  );
}

/** A page on a module screen: icon, name, its line, what waits there, and where it opens when that is the web. */
export function NavRow({ node, badge, web, onOpen, onMenu }: { node: NavNode; badge?: number; web: boolean; onOpen: () => void; onMenu: () => void }) {
  const t = useT();
  const label = useTileLabel();
  return (
    <Touchable
      accessibilityRole={web ? 'link' : 'button'}
      accessibilityLabel={label(node, badge)}
      accessibilityHint={web ? t('Opens on the web') : t('Long press for Pin to Home')}
      accessibilityActions={[{ name: 'longpress', label: t('Tile options') }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onMenu()}
      onPress={onOpen}
      onLongPress={onMenu}
      style={styles.row}
    >
      <View style={[styles.rowChip, { backgroundColor: navTone(node) }]}>
        <NavIcon name={node.icon} size={20} color={colors.onTile} />
      </View>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
          {t(node.label)}
        </Text>
        <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
          {t(node.description)}
        </Text>
        {web ? (
          <View style={styles.webHint}>
            <NavIcon name="external-link" size={14} color={colors.textMuted} />
            <Text style={styles.webText} maxFontSizeMultiplier={maxFontScale}>
              {t('Opens on the web')}
            </Text>
          </View>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, styles.rowBadge]}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {badgeText(badge)}
          </Text>
        </View>
      ) : (
        <NavIcon name="chevron-right" size={20} color={colors.textMuted} />
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, marginBottom: spacing.lg },
  tile: {
    margin: spacing.xs,
    minHeight: 96,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chip: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.text },
  badge: { position: 'absolute', top: -6, right: -12, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.textOnPrimary, fontSize: fontSize.small, fontWeight: '700' },
  pins: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  pinChip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pinLabel: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.text, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowChip: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBadge: { position: 'relative', top: 0, right: 0 },
  webHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  webText: { fontSize: fontSize.small, color: colors.textMuted },
});
