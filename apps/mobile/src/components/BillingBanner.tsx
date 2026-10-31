import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRODUCT_NAME } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSize, maxFontScale, radius, spacing } from '../theme';
import { useT } from '../i18n/LanguageContext';

/** The company's trial or subscription has ended: entries wait on the phone until an admin renews on the web. */
export function BillingBanner() {
  const { user } = useAuth();
  const t = useT();
  if (user?.billing?.status !== 'READ_ONLY') return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="lock-closed-outline" size={20} color={colors.danger} />
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.text}>
        {t('{org} is read-only on {product} until the subscription is renewed. New entries wait on this phone and send once it is.', { org: user.organizationName, product: PRODUCT_NAME })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft, marginBottom: spacing.md },
  text: { flex: 1, fontWeight: '600', fontSize: fontSize.secondary, color: colors.danger },
});
