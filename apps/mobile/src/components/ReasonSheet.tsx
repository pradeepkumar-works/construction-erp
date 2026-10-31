import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, maxFontScale, radius, spacing, touch } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { MIN_REASON_LENGTH } from '../api/review';
import { errorMessage } from '../api/client';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Input } from './Input';
import { ErrorBanner } from './States';
import { Touchable } from './Touchable';

/**
 * A decision that carries a note: the reason is typed (or picked from the quick reasons) by the person deciding, never
 * filled in for them. `required` holds the note to MIN_REASON_LENGTH; `title`, `field`, `confirm` and `quick` are
 * English, shown through t().
 */
export function ReasonSheet({
  visible,
  onClose,
  title,
  subtitle,
  field,
  quick = [],
  required,
  missing,
  confirm,
  variant,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  field: string;
  quick?: string[];
  required: boolean;
  /** What to say when a required note is missing or too short (English). */
  missing?: string;
  confirm: string;
  variant: 'success' | 'accent' | 'danger' | 'primary';
  /** Sends the decision; the sheet closes when it resolves and shows the error when it throws. */
  onConfirm: (note: string) => Promise<unknown>;
}) {
  const t = useT();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setNote('');
    setNoteError(null);
    setError(null);
  }, [visible]);

  const send = async () => {
    if (required && note.trim().length < MIN_REASON_LENGTH) return setNoteError(t(missing ?? 'Say why'));
    setBusy(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={!busy} title={t(title)} subtitle={subtitle}>
      {quick.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
          {quick.map((q) => (
            <Touchable
              key={q}
              accessibilityRole="button"
              accessibilityHint={t('Puts this reason in the note')}
              onPress={() => {
                setNote((n) => (n.trim() ? `${n.trim()}. ${t(q)}` : t(q)));
                setNoteError(null);
              }}
              style={styles.quickChip}
            >
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.quickText}>{t(q)}</Text>
            </Touchable>
          ))}
        </ScrollView>
      ) : null}
      <Input
        label={t(field)}
        required={required}
        value={note}
        onChangeText={(v) => {
          setNote(v);
          if (noteError) setNoteError(null);
        }}
        error={noteError}
        multiline
        autoFocus
      />
      <ErrorBanner message={error} />
      <View style={styles.buttons}>
        <Button title={t('Cancel')} variant="ghost" onPress={onClose} disabled={busy} style={styles.flex} />
        <Button title={t(confirm)} variant={variant} onPress={() => void send()} loading={busy} style={styles.flex2} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 1.6, marginLeft: spacing.sm },
  buttons: { flexDirection: 'row' },
  quick: { gap: spacing.sm, paddingBottom: spacing.md },
  quickChip: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  quickText: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.text },
});
