import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NavNode } from '@erp/shared';
import { familyOf } from '../home/menu';
import { colors, familyTint, fontSize, maxFontScale, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { NavIcon } from './NavIcon';
import { Touchable } from './Touchable';

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/** What a screen reader hears for a tile: its name, and what waits there. */
function useTileLabel() {
  const t = useT();
  return (node: NavNode, badge?: number) => (badge ? t('{name}, {n} waiting', { name: t(node.label), n: badge }) : t(node.label));
}

/** A page on a module screen: icon, name, its line, what waits there, and where it opens when that is the web. */
export function NavRow({ node, badge, web, onOpen, onMenu }: { node: NavNode; badge?: number; web: boolean; onOpen: () => void; onMenu: () => void }) {
  const t = useT();
  const label = useTileLabel();
  const tint = familyTint[familyOf(node)];
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
      <View style={[styles.rowChip, { backgroundColor: tint.bg }]}>
        <NavIcon name={node.icon} size={20} color={tint.fg} />
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
  badge: { position: 'absolute', top: -6, right: -12, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.textOnPrimary, fontSize: fontSize.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowChip: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBadge: { position: 'relative', top: 0, right: 0 },
  webHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  webText: { fontSize: fontSize.small, color: colors.textMuted },
});
