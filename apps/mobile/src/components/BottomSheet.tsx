import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touch, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';

export interface SheetAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

/**
 * A panel that slides up from the bottom for actions and confirmations. Tapping the dimmed page, the Close button or
 * the back button closes it (unless `dismissable` is false, e.g. while a request runs).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  dismissable = true,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  dismissable?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const close = () => dismissable && onClose();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Screen readers use the Close button instead. */}
        <Pressable style={styles.backdrop} onPress={close} accessible={false} importantForAccessibility="no" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={styles.flex}>
              {title ? (
                <Text style={typography.h2} accessibilityRole="header">
                  {title}
                </Text>
              ) : null}
              {subtitle ? <Text style={[typography.caption, styles.subtitle]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={close} disabled={!dismissable} accessibilityRole="button" accessibilityLabel={t('Close')} hitSlop={8} style={({ pressed }) => [styles.close, pressed && styles.pressed, !dismissable && styles.disabled]}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Full-width rows for a sheet of actions ("More"). Each closes the sheet before it runs. */
export function SheetActions({ actions, onClose }: { actions: SheetAction[]; onClose: () => void }) {
  return (
    <View>
      {actions.map((a) => {
        const fg = a.tone === 'danger' ? colors.danger : colors.text;
        return (
          <Pressable
            key={a.label}
            onPress={() => {
              onClose();
              a.onPress();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Ionicons name={a.icon} size={22} color={a.tone === 'danger' ? colors.danger : colors.primary} />
            <Text style={[typography.bodyStrong, { color: fg }]}>{a.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // The page behind dims with the darkest palette colour; the sheet itself stays opaque.
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.text, opacity: 0.45 },
  sheet: { marginTop: 'auto', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.border, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  subtitle: { marginTop: 2 },
  close: { width: touch.heightSm, height: touch.heightSm, borderRadius: touch.heightSm / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralSoft, marginLeft: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touch.height, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
