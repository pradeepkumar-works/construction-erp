import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COMPANY_KIND_LABELS, type CompanyChoiceDto } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { useOffline } from '../offline/OfflineContext';
import { useT } from '../i18n/LanguageContext';
import { colors, maxFontScale, spacing, touch, typography } from '../theme';
import { useSnackbar } from './Snackbar';
import { Touchable } from './Touchable';

/**
 * Group companies: the companies the person works in, as radio rows, for Profile's Company card and Home's switcher (the
 * company name at the top). Each company keeps its own outbox, so entries saved here wait for this company and send when
 * the person comes back to it; switching with entries waiting asks first. `onSwitched` runs once the new company is in.
 */
export function CompanyChoices({ onSwitched }: { onSwitched?: () => void }) {
  const { user, switchCompany } = useAuth();
  const { pendingCount, failedCount } = useOffline();
  const snackbar = useSnackbar();
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  if (!user?.companies || user.companies.length < 2) return null;
  const waiting = pendingCount + failedCount;
  const go = async (c: CompanyChoiceDto) => {
    setBusy(c.id);
    try {
      await switchCompany(c.id);
      onSwitched?.();
      router.replace('/');
      snackbar.show(t('You are now working in {company}', { company: c.name }), { tone: 'success' });
    } catch (e) {
      Alert.alert(t('Could not switch company'), e instanceof Error ? e.message : t('Try again'));
    } finally {
      setBusy(null);
    }
  };
  const pick = (c: CompanyChoiceDto) => {
    if (c.current || busy) return;
    if (!waiting) return void go(c);
    Alert.alert(
      t('Entries waiting to send'),
      t('{count} entries saved in {here} are still waiting to send. They stay on this phone and send when you come back to {here}.', { count: String(waiting), here: user.organizationName }),
      [
        { text: t('Stay here'), style: 'cancel' },
        { text: t('Switch anyway'), onPress: () => void go(c) },
      ],
    );
  };
  return (
    <View accessibilityRole="radiogroup">
      {user.companies.map((c) => (
        <Touchable
          key={c.id}
          onPress={() => pick(c)}
          disabled={!!busy}
          style={styles.row}
          accessibilityRole="radio"
          accessibilityState={{ selected: c.current, busy: busy === c.id }}
          accessibilityLabel={`${c.name}, ${t(COMPANY_KIND_LABELS[c.kind])}, ${t(c.roleName)}`}
        >
          <View style={styles.text}>
            <Text style={c.current ? typography.bodyStrong : typography.body} maxFontSizeMultiplier={maxFontScale}>
              {c.name}
            </Text>
            <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
              {t(COMPANY_KIND_LABELS[c.kind])} · {t(c.roleName)}
            </Text>
          </View>
          <Ionicons name={c.current ? 'checkmark-circle' : busy === c.id ? 'sync-outline' : 'ellipse-outline'} size={22} color={c.current ? colors.primary : colors.borderStrong} />
        </Touchable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch.heightSm, gap: spacing.sm, paddingVertical: spacing.xs },
  text: { flex: 1, minWidth: 0 },
});
