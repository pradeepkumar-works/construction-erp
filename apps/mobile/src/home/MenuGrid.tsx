import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { navNode, type NavNode } from '@erp/shared';
import { NavIcon } from '../components/NavIcon';
import { Touchable } from '../components/Touchable';
import { useT } from '../i18n/LanguageContext';
import { colors, familyTint, fontSize, spacing } from '../theme';
import { familyOf, type MenuItem } from './menu';

const ICON = 58;
const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * Home's menu as a phone's home screen: four icons a row (six on a tablet), each a soft square in its module's colour
 * with the name under it and a red count where something waits. My work is the one solid icon. A long press on a page or
 * one of the tree's modules opens its menu (Pin to Home, Move, Unpin); `onEdit` is the last icon, Edit menu. `compact`
 * drops the space above, for a grid under a heading (a Home tab's pages).
 */
export function MenuGrid({ items, onOpen, onMenu, onEdit, compact }: { items: MenuItem[]; onOpen: (item: MenuItem) => void; onMenu: (node: NavNode) => void; onEdit?: () => void; compact?: boolean }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 6 : 4;
  const cell = { width: `${100 / columns}%` } as const;
  return (
    <View style={[styles.grid, compact && styles.compact]} accessibilityRole="menu" accessibilityLabel={t('Menu')}>
      {items.map((item) => {
        const label = item.kind === 'node' ? t(item.node.label) : t(item.module.label);
        const icon = item.kind === 'node' ? item.node.icon : item.module.icon;
        const own = item.kind === 'node' && item.node.id === 'my-work';
        const tint = familyTint[item.kind === 'node' ? familyOf(item.node) : item.module.family];
        // A department module is not a page of the tree, so it has nothing to pin.
        const menuNode = item.kind === 'node' ? item.node : navNode(item.module.key);
        return (
          <View key={item.key} style={cell}>
            <Touchable
              accessibilityRole="menuitem"
              accessibilityLabel={item.badge ? t('{name}, {n} waiting', { name: label, n: item.badge }) : label}
              accessibilityHint={menuNode ? t('Long press to pin to Home') : undefined}
              accessibilityActions={menuNode ? [{ name: 'longpress', label: t('Tile options') }] : undefined}
              onAccessibilityAction={(e) => menuNode && e.nativeEvent.actionName === 'longpress' && onMenu(menuNode)}
              onPress={() => onOpen(item)}
              onLongPress={menuNode ? () => onMenu(menuNode) : undefined}
              style={styles.app}
            >
              <View style={[styles.icon, own ? styles.own : { backgroundColor: tint.bg }]}>
                <NavIcon name={icon} size={26} color={own ? colors.onBrand : tint.fg} />
                {item.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                      {badgeText(item.badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                {label}
              </Text>
            </Touchable>
          </View>
        );
      })}
      {onEdit ? (
        <View style={cell}>
          <Touchable accessibilityRole="menuitem" accessibilityLabel={t('Edit menu')} accessibilityHint={t('Pin pages to Home and find any page')} onPress={onEdit} style={styles.app}>
            <View style={[styles.icon, { backgroundColor: colors.neutralSoft }]}>
              <Ionicons name="add" size={28} color={colors.neutral} />
            </View>
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {t('Edit menu')}
            </Text>
          </Touchable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xl, marginHorizontal: -spacing.xs, rowGap: spacing.lg },
  compact: { marginTop: spacing.xs },
  app: { alignItems: 'center', gap: 7, paddingHorizontal: 2, paddingVertical: spacing.xs, minHeight: 104 },
  icon: { width: ICON, height: ICON, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  own: { backgroundColor: colors.brand },
  // Icon labels, like the tab bar's: the small size, two lines at most, so four fit across a phone.
  label: { fontSize: fontSize.small, lineHeight: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: colors.textOnPrimary, fontSize: fontSize.small, fontWeight: '700' },
});
