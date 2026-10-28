import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth/AuthContext';
import { BillingBanner, IconButton, NotificationBell, OfflineBanner, Screen, Touchable } from '../../src/components';
import { BottomSheet } from '../../src/components/BottomSheet';
import { CompanyChoices } from '../../src/components/CompanySwitch';
import { DayCard } from '../../src/home/DayCard';
import { MenuGrid } from '../../src/home/MenuGrid';
import { useHomeMenu, type MenuItem } from '../../src/home/menu';
import { useOpenNode } from '../../src/launcher/open';
import { useTileMenu } from '../../src/launcher/TileMenu';
import { useLauncher } from '../../src/launcher/useLauncher';
import { colors, fonts, fontSize, maxFontScale, spacing } from '../../src/theme';
import { useT } from '../../src/i18n/LanguageContext';

/**
 * The Home tab (ARCHITECTURE "The launcher on the phone"): the person's day first (the time, check in and out, the HR
 * row), then the menu as a phone's home screen: My work, the pins and the company's modules under its own names. What
 * waits, today's DPR and the recent entries are one level down, in My work; Search and Recent are behind the search
 * icon. The company's name at the top switches company in a group.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const launcher = useLauncher();
  const { open, sheet } = useOpenNode(launcher.webUrl);
  const { openMenu, menu } = useTileMenu(launcher);
  const items = useHomeMenu(user, launcher);
  const [refreshKey, setRefreshKey] = useState(0);
  const [switching, setSwitching] = useState(false);
  const group = (user?.companies?.length ?? 0) > 1;

  const openItem = (item: MenuItem) => {
    if (item.kind === 'node') open(item.node);
    else router.push({ pathname: '/module/[key]', params: { key: item.module.key } });
  };
  const refresh = async () => {
    setRefreshKey((k) => k + 1);
    await launcher.refresh();
  };

  return (
    <Screen refreshing={launcher.refreshing} onRefresh={() => void refresh()} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.top}>
        <View style={styles.mark} accessible={false}>
          <Text style={styles.markText} maxFontSizeMultiplier={1}>
            N
          </Text>
        </View>
        <Touchable
          onPress={group ? () => setSwitching(true) : undefined}
          disabled={!group}
          accessibilityRole={group ? 'button' : 'header'}
          accessibilityLabel={group ? t('{company}, switch company', { company: user?.organizationName ?? '' }) : user?.organizationName}
          style={styles.company}
        >
          <Text style={styles.companyText} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
            {user?.organizationName}
          </Text>
          {group ? <Ionicons name="chevron-down" size={18} color={colors.textMuted} /> : null}
        </Touchable>
        <IconButton icon="search-outline" color={colors.text} size={24} accessibilityLabel={t('Search')} onPress={() => router.push('/find')} />
        <NotificationBell />
      </View>
      <BillingBanner />
      <OfflineBanner />

      <DayCard refreshKey={refreshKey} />
      <MenuGrid items={items} onOpen={openItem} onMenu={openMenu} onEdit={() => router.push({ pathname: '/find', params: { edit: '1' } })} />

      {sheet}
      {menu}
      {switching ? (
        <BottomSheet visible onClose={() => setSwitching(false)} title={t('Switch company')}>
          <CompanyChoices onSwitched={() => setSwitching(false)} />
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: -spacing.sm, marginBottom: spacing.sm },
  mark: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.onBrand },
  company: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs },
  companyText: { flexShrink: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.text },
});
