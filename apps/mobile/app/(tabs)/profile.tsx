import React, { useState } from 'react';
import { Alert, Appearance, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import { ROLE_LABELS, SUBMISSION_TYPE_LABELS, approvalRightsOf } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useNotifications } from '../../src/notifications/NotificationsContext';
import { MessagingCard } from '../../src/notifications/MessagingCard';
import { Button, Card, KeyValue, Screen, Touchable } from '../../src/components';
import { CompanyChoices } from '../../src/components/CompanySwitch';
import { API_URL } from '../../src/config';
import { LANGUAGES, useLanguage, useT } from '../../src/i18n/LanguageContext';
import { formatNumber } from '../../src/utils/format';
import { APPEARANCE_CHOICES, appearance, colors, maxFontScale, saveAppearance, spacing, touch, typography, type AppearanceChoice } from '../../src/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { push, askForPush } = useNotifications();
  const t = useT();
  if (!user) return null;
  const initials = user.fullName
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const confirmLogout = () => {
    Alert.alert(t('Sign out'), t('You will need to sign in again.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Sign out'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.avatarText}>{initials}</Text>
        </View>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2}>{user.fullName}</Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t(ROLE_LABELS[user.roleKey] ?? user.roleName)}</Text>
      </View>
      <Card title={t('Account')}>
        <KeyValue label={t('Email')} value={user.email} />
        <KeyValue label={t('Phone')} value={user.phone} />
        <KeyValue label={t('Role')} value={t(ROLE_LABELS[user.roleKey] ?? user.roleName)} />
        <KeyValue label={t('Organisation')} value={user.organizationName} />
        <KeyValue label={t('Can approve')} value={approvalRightsLine(user, t)} />
      </Card>
      <CompanyCard />
      <Card title={t('Notifications')}>
        <KeyValue label={t('Push to this device')} value={t(push ? (push.status === 'ready' ? 'On' : push.status === 'off' ? 'Off' : push.status === 'denied' ? 'Permission denied' : 'Not available') : 'Checking…')} />
        {push && push.status !== 'ready' && push.reason ? <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t(push.reason)}</Text> : null}
        {push?.status === 'off' ? <Button title={t('Turn on notifications')} icon="notifications-outline" variant="secondary" onPress={askForPush} style={styles.pushBtn} /> : null}
        {push?.status === 'denied' && Platform.OS !== 'web' ? (
          <Button title={t('Open phone settings')} icon="settings-outline" variant="secondary" onPress={() => void Linking.openSettings()} style={styles.pushBtn} />
        ) : null}
        <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Approvals, rejections and change requests on your submissions, plus the daily DPR reminder, also appear under Notifications on the Home screen.')}</Text>
      </Card>
      <MessagingCard />
      <LanguageCard />
      <AppearanceCard />
      {__DEV__ ? (
        <Card title={t('Connection')}>
          <View style={styles.apiRow}>
            <Ionicons name="server-outline" size={18} color={colors.textMuted} />
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.api} selectable>
              {API_URL}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Set EXPO_PUBLIC_API_URL before starting Expo to point the app at another server.')}</Text>
        </Card>
      ) : null}
      <Button title={t('Sign out')} variant="danger" icon="log-out-outline" onPress={confirmLogout} />
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.version]}>{t('App version {version}', { version: Constants.expoConfig?.version ?? '-' })}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pushBtn: { marginVertical: spacing.sm },
  hero: { alignItems: 'center', marginBottom: spacing.xl, gap: 2 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  avatarText: { color: colors.textOnPrimary, fontSize: 28, fontWeight: '800' },
  apiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  api: { ...typography.bodyStrong, flex: 1 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch.heightSm, gap: spacing.sm },
  choiceOff: { opacity: 0.55 },
  note: { marginTop: spacing.xs },
  version: { textAlign: 'center', marginTop: spacing.md },
});

/** Group companies: the companies the person works in, when there is more than one (`CompanyChoices`). */
function CompanyCard() {
  const { user } = useAuth();
  const t = useT();
  if (!user?.companies || user.companies.length < 2) return null;
  return (
    <Card title={t('Company')}>
      <CompanyChoices />
      <Text style={[typography.caption, styles.note]} maxFontSizeMultiplier={maxFontScale}>
        {t('One sign-in for every company of your group. Each company has its own projects, entries and outbox.')}
      </Text>
    </Card>
  );
}

/** The phone's language until the user picks another here; the choice stays on this phone. */
function LanguageCard() {
  const { language, setLanguage } = useLanguage();
  const t = useT();
  return (
    <Card title={t('Language')}>
      {LANGUAGES.map((l) => {
        const active = l.code === language;
        return (
          <Touchable
            key={l.code}
            disabled={!l.available}
            onPress={() => setLanguage(l.code)}
            style={[styles.choiceRow, !l.available && styles.choiceOff]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: !l.available }}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={active ? typography.bodyStrong : typography.body}>{l.label}</Text>
            {active ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            ) : !l.available ? (
              <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>{t('Coming soon')}</Text>
            ) : (
              <Ionicons name="ellipse-outline" size={22} color={colors.borderStrong} />
            )}
          </Touchable>
        );
      })}
    </Card>
  );
}

/** The palette is picked when the JS starts, so a new choice reloads the app (UX item 80); drafts and the outbox are kept. */
async function applyAppearance(choice: AppearanceChoice) {
  saveAppearance(choice);
  // Clear the explicit scheme this session set, so "Same as phone" reads the phone again after the reload.
  if (choice === 'system') Appearance.setColorScheme('unspecified');
  if (Platform.OS === 'web') return globalThis.location?.reload();
  try {
    await reloadAppAsync('Appearance changed');
  } catch {
    // Expo Go without reload support: the choice applies the next time the app opens.
  }
}

/** Light, dark or the phone's own setting; the app redraws in the new colours at once. */
function AppearanceCard() {
  const t = useT();
  const [choice, setChoice] = useState<AppearanceChoice>(appearance);
  const pick = (value: AppearanceChoice) => {
    if (value === choice) return;
    setChoice(value);
    void applyAppearance(value);
  };
  return (
    <Card title={t('Appearance')}>
      {APPEARANCE_CHOICES.map((o) => {
        const active = o.value === choice;
        return (
          <Touchable key={o.value} onPress={() => pick(o.value)} style={styles.choiceRow} accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <Text maxFontSizeMultiplier={maxFontScale} style={active ? typography.bodyStrong : typography.body}>{t(o.label)}</Text>
            <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={active ? colors.primary : colors.borderStrong} />
          </Touchable>
        );
      })}
      <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.note]}>{t('The app restarts in the new colours. Anything you were typing is kept as a draft.')}</Text>
    </Card>
  );
}

function approvalRightsLine(user: Parameters<typeof approvalRightsOf>[0], t: (en: string, vars?: Record<string, string>) => string): string {
  const rights = approvalRightsOf(user);
  if (!rights.length) return t('No');
  if (rights.length === Object.keys(SUBMISSION_TYPE_LABELS).length && rights.every((r) => r.maxAmount === null)) return t('Everything');
  return rights.map((r) => (r.maxAmount === null ? t(SUBMISSION_TYPE_LABELS[r.type]) : t('{type} up to ₹{amount}', { type: t(SUBMISSION_TYPE_LABELS[r.type]), amount: formatNumber(r.maxAmount, 0) }))).join(', ');
}
