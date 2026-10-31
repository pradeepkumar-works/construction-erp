import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canKeepStock, canRecordAttendance } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { Touchable } from '../components/Touchable';
import { useT } from '../i18n/LanguageContext';
import { colors, fontSize, maxFontScale, radius, spacing } from '../theme';

/**
 * New entry in My work: the forms a site fills in every day, four across. Site supervisors get Attendance, the store
 * manager Stock; everything else is on the Submit tab.
 */
export function NewEntries() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  return (
    <View style={styles.row}>
      <Entry icon="trending-up" label={t('Progress')} onPress={() => router.push('/progress/new')} />
      <Entry icon="document-text-outline" label="DPR" onPress={() => router.push('/dpr/new')} />
      <Entry icon="cube-outline" label={t('Material')} onPress={() => router.push('/material-request/new')} />
      {user && canRecordAttendance(user.roleKey) ? <Entry icon="people-outline" label={t('Attendance')} onPress={() => router.push('/attendance')} /> : null}
      {user && canKeepStock(user.roleKey) && !canRecordAttendance(user.roleKey) ? <Entry icon="file-tray-stacked-outline" label={t('Stock')} onPress={() => router.push('/stock')} /> : null}
    </View>
  );
}

function Entry({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const t = useT();
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('New {label}', { label })} style={styles.entry}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  entry: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
