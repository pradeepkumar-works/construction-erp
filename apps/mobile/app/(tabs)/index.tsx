import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LAUNCHER_RECENT_SHOWN, canKeepStock, canRecordAttendance, navNode, navTilesFor, type NavNode, type NavVisitDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { BillingBanner, NotificationBell, OfflineBanner, Screen, SectionTitle, Touchable } from '../../src/components';
import { NavIcon } from '../../src/components/NavIcon';
import { NavTileGrid, PinnedRow } from '../../src/components/NavTile';
import { Skeleton } from '../../src/components/Skeleton';
import { useOpenNode } from '../../src/launcher/open';
import { visitNode } from '../../src/launcher/routes';
import { useTileMenu } from '../../src/launcher/TileMenu';
import { useLauncher } from '../../src/launcher/useLauncher';
import { colors, fontSize, maxFontScale, radius, spacing, typography } from '../../src/theme';
import { formatDate, timeAgo, today } from '../../src/utils/format';
import { useT } from '../../src/i18n/LanguageContext';

/**
 * The Home tab is the launcher (launcher phase 4), as Home on the web: New entry for the forms a site fills in every day,
 * then Pinned (the same pins as the web, cached for offline), every module the role opens as a tile from the navigation
 * tree, and the places opened last on any device. What the old Home showed is the My work tile.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const launcher = useLauncher();
  const { open, openVisit, sheet } = useOpenNode(launcher.webUrl);
  const { openMenu, menu } = useTileMenu(launcher);
  const tiles = user ? navTilesFor(user, null) : [];
  // The latest few, as on the web; Recent keeps more for Discover and Search.
  const recent = launcher.recent.slice(0, LAUNCHER_RECENT_SHOWN);
  const pinned = launcher.pins.flatMap((p) => (p.kind === 'NODE' ? (navNode(p.target) ?? []) : []));

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <Screen refreshing={launcher.refreshing} onRefresh={launcher.refresh} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topRow}>
        <View style={styles.flex}>
          <Text style={typography.h1}>
            {t('{greeting}, {name}', { greeting, name: firstName })}
          </Text>
          <Text style={[typography.caption, styles.sub]}>{user ? t(user.roleName) : ''} · {formatDate(today())}</Text>
        </View>
        <NotificationBell />
      </View>
      <BillingBanner />
      <OfflineBanner />

      <SectionTitle title={t('New entry')} />
      <View style={styles.quick}>
        <QuickAction icon="trending-up" label={t('Progress')} onPress={() => router.push('/progress/new')} tone={colors.brand} iconColor={colors.onBrand} />
        <QuickAction icon="document-text" label="DPR" onPress={() => router.push('/dpr/new')} tone={colors.accent} />
        <QuickAction icon="cube" label={t('Material')} onPress={() => router.push('/material-request/new')} tone={colors.success} />
        {user && canRecordAttendance(user.roleKey) ? <QuickAction icon="people" label={t('Attendance')} onPress={() => router.push('/attendance')} tone={colors.primaryDark} /> : null}
        {/* Four tiles fit a phone row: the store manager gets Stock where site supervisors get Attendance. */}
        {user && canKeepStock(user.roleKey) && !canRecordAttendance(user.roleKey) ? <QuickAction icon="file-tray-stacked" label={t('Stock')} onPress={() => router.push('/stock')} tone={colors.info} /> : null}
      </View>

      {launcher.loading ? (
        <Skeleton variant="card" label={t('Loading…')} />
      ) : (
        <>
          <SectionTitle title={t('Pinned')} />
          {pinned.length ? (
            <PinnedRow nodes={pinned} onOpen={open} onMenu={openMenu} />
          ) : (
            <Text style={[typography.caption, styles.hint]} maxFontSizeMultiplier={maxFontScale}>
              {t('Long press a module or a page to pin it here. Pins follow you to the web.')}
            </Text>
          )}
        </>
      )}

      <SectionTitle title={t('Modules')} />
      <NavTileGrid nodes={tiles} badges={launcher.badges} onOpen={open} onMenu={openMenu} />

      {recent.length ? (
        <>
          <SectionTitle title={t('Recent')} />
          <View style={styles.recent}>
            {recent.map((v) => (
              <RecentRow key={`${v.kind}-${v.target}`} visit={v} onPress={() => openVisit(v)} />
            ))}
          </View>
        </>
      ) : null}
      {sheet}
      {menu}
    </Screen>
  );
}

/** A place opened lately, on this phone or the web: its icon, name and what it is. */
function RecentRow({ visit, onPress }: { visit: NavVisitDto; onPress: () => void }) {
  const t = useT();
  const node: NavNode | undefined = visitNode(visit);
  const icon = node?.icon ?? (visit.kind === 'PROJECT' ? 'folder-kanban' : 'file-text');
  const kind = node && node.parent === null && !node.route ? t('Module') : visit.kind === 'PROJECT' ? t('Project') : visit.kind === 'RECORD' ? t('Entry') : t('Page');
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={`${node ? t(node.label) : visit.label}, ${kind}`} onPress={onPress} style={styles.recentRow}>
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

function QuickAction({ icon, label, onPress, tone, iconColor = colors.onBrand }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone: string; iconColor?: string }) {
  const t = useT();
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('New {label}', { label })} style={styles.quickBtn}>
      <View style={[styles.quickIcon, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sub: { marginTop: 2, marginBottom: spacing.sm },
  quick: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  quickBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 96, justifyContent: 'center' },
  quickIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  quickLabel: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { marginBottom: spacing.lg },
  recent: { marginBottom: spacing.lg },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
