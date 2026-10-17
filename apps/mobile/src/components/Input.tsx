import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
  right?: React.ReactNode;
}

/**
 * A text field with its label above. Screen readers hear the label (or, for a field in a table row, the
 * `accessibilityLabel` or placeholder), "required", and the error or hint after it.
 */
export function Input({ label, error, hint, required, containerStyle, right, style, multiline, accessibilityLabel, ...rest }: Props) {
  const t = useT();
  const name = accessibilityLabel ?? label ?? rest.placeholder;
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label} maxFontSizeMultiplier={maxFontScale}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <View style={[styles.inputWrap, !!error && styles.inputError, multiline && styles.multilineWrap]}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          maxFontSizeMultiplier={maxFontScale}
          multiline={multiline}
          style={[styles.input, multiline && styles.multiline, style]}
          accessibilityLabel={name ? `${name}${required ? `, ${t('required')}` : ''}` : undefined}
          accessibilityHint={error ?? hint ?? undefined}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text style={styles.error} maxFontSizeMultiplier={maxFontScale}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint} maxFontSizeMultiplier={maxFontScale}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.xs },
  req: { color: colors.danger },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: touch.height,
    paddingHorizontal: spacing.md,
  },
  multilineWrap: { alignItems: 'flex-start' },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing.md },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  error: { color: colors.danger, marginTop: spacing.xs, fontSize: 13 },
  hint: { ...typography.caption, marginTop: spacing.xs },
});
