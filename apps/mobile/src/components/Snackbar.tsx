import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fontSize, maxFontScale, radius, shadow, spacing, touch } from '../theme';
import { Touchable } from './Touchable';

/**
 * Confirmation after something worked or failed (UX item 80): a short bar above the tab bar, the same words read by
 * TalkBack or VoiceOver, and a tap of the phone's vibration motor, so a site engineer with gloves on, in sun, knows the
 * approval or the entry went through without reading the screen.
 */
export type SnackTone = 'success' | 'info' | 'error';

interface Snack {
  id: number;
  text: string;
  tone: SnackTone;
  action?: { label: string; onPress: () => void };
}

interface SnackbarState {
  show: (text: string, opts?: { tone?: SnackTone; action?: Snack['action'] }) => void;
}

const SnackbarContext = createContext<SnackbarState>({ show: () => undefined });

const SHOW_MS = 4000;

/** Vibration and a spoken line for a result, without a bar (screens that already show it, such as Submitted). */
export function confirmResult(text: string, tone: SnackTone = 'success') {
  if (Platform.OS !== 'web') {
    const type = tone === 'error' ? Haptics.NotificationFeedbackType.Error : tone === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
    Haptics.notificationAsync(type).catch(() => undefined);
  }
  AccessibilityInfo.announceForAccessibility(text);
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSnack(null);
  }, []);

  const show = useCallback<SnackbarState['show']>(
    (text, opts) => {
      const tone = opts?.tone ?? 'success';
      confirmResult(text, tone);
      if (timer.current) clearTimeout(timer.current);
      setSnack({ id: Date.now(), text, tone, action: opts?.action });
      timer.current = setTimeout(hide, opts?.action ? SHOW_MS * 2 : SHOW_MS);
    },
    [hide],
  );
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const value = useMemo(() => ({ show }), [show]);
  const icon = snack?.tone === 'error' ? 'alert-circle' : snack?.tone === 'info' ? 'information-circle' : 'checkmark-circle';
  const iconColor = snack?.tone === 'error' ? colors.danger : snack?.tone === 'info' ? colors.primary : colors.success;

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {snack ? (
        <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 72 }]}>
          <View key={snack.id} style={styles.bar} accessibilityLiveRegion="polite">
            <Ionicons name={icon} size={20} color={iconColor} />
            <Text style={styles.text} maxFontSizeMultiplier={maxFontScale}>
              {snack.text}
            </Text>
            {snack.action ? (
              <Touchable
                onPress={() => {
                  snack.action?.onPress();
                  hide();
                }}
                style={styles.action}
                accessibilityRole="button"
              >
                <Text style={styles.actionText} maxFontSizeMultiplier={maxFontScale}>
                  {snack.action.label}
                </Text>
              </Touchable>
            ) : null}
          </View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackbarContext);

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    minHeight: touch.heightSm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow.card,
    elevation: 6,
  },
  text: { flex: 1, fontSize: fontSize.body, color: colors.text },
  action: { minHeight: touch.min, minWidth: touch.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.body },
});
