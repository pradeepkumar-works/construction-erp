import React from 'react';
import { Platform, Pressable, StyleSheet, type Insets, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, touch, type IconName } from '../theme';

type Role = NonNullable<PressableProps['accessibilityRole']>;

export interface TouchableProps extends Omit<PressableProps, 'style' | 'accessibilityRole'> {
  /** Required: what TalkBack and VoiceOver call it (button, link, tab, radio, checkbox…). */
  accessibilityRole: Role;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  /** Ripple spreads around the target (an icon on its own) instead of staying inside its shape. */
  borderless?: boolean;
  /** How the target looks while pressed, in place of the default fade. */
  pressedStyle?: StyleProp<ViewStyle>;
}

/**
 * Every tappable thing in the app (UX item 88): the Android ripple and a fade while pressed, so a gloved tap is seen to
 * land; a required `accessibilityRole`; and `disabled` reported to screen readers. Size it to at least `touch.min`
 * (48 dp), or give `hitSlop` when what shows must stay small.
 */
export function Touchable({ style, borderless, pressedStyle, disabled, accessibilityState, android_ripple, ...rest }: TouchableProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      android_ripple={android_ripple ?? { color: colors.ripple, borderless: !!borderless, foreground: !borderless }}
      style={(state) => [typeof style === 'function' ? style(state) : style, state.pressed && (pressedStyle ?? styles.pressed)]}
    />
  );
}

/** Extra touch area around a target `width` × `height` dp so it reaches `touch.min` on each axis. */
export function slopFor(width: number, height = width): Insets {
  const x = Math.max(0, Math.ceil((touch.min - width) / 2));
  const y = Math.max(0, Math.ceil((touch.min - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

/**
 * A 48 dp icon-only button. `accessibilityLabel` is required because there is no text to read. `filled` (a colour)
 * puts the icon on a round background.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color = colors.primary,
  size = 22,
  disabled,
  filled,
  style,
  accessibilityHint,
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  filled?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      borderless={!filled}
      style={[styles.icon, filled ? { backgroundColor: filled } : null, disabled && styles.disabled, style]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // The ripple shows the press on Android; the fade is what iOS and the web show (and a second cue in sunlight).
  pressed: { opacity: Platform.OS === 'android' ? 0.85 : 0.6 },
  icon: { minWidth: touch.min, minHeight: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
