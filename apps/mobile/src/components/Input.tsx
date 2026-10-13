import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing, touch, typography } from '../theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
  right?: React.ReactNode;
}

export function Input({ label, error, hint, required, containerStyle, right, style, multiline, ...rest }: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <View style={[styles.inputWrap, !!error && styles.inputError, multiline && styles.multilineWrap]}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          style={[styles.input, multiline && styles.multiline, style]}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
    borderColor: colors.border,
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
