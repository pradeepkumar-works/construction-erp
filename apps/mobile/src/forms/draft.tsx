import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { Button, type LocalPhoto } from '../components';
import { useT } from '../i18n/LanguageContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatDateTime } from '../utils/format';
import { kvGet, kvRemove, kvSet } from '../utils/kv';

/**
 * A new entry's unsent work, kept on this phone as it is typed, so a back swipe, a call, the camera or
 * Android closing the app never loses a DPR. One draft per form and user; it is restored on the form's first frame and
 * cleared when the entry is sent or the user starts over. Edits of entries already on the server keep no draft.
 */
interface Stored<T> {
  savedAt: string;
  value: T;
}

const SAVE_DELAY_MS = 400;

export interface FormDraft {
  /** When the restored draft was saved; null when the form started empty. */
  restoredAt: string | null;
  /** The user changed something since the form opened (or since the last `settle`). */
  dirty: boolean;
  /** Forget the draft (after sending, or Start over); the form's next state is its new starting point. */
  clear: () => void;
  /**
   * The form's next state counts as untouched: call after filling it in by itself (the only project, figures from
   * attendance, an entry loaded for editing), so leaving it does not ask and an empty form is not kept as a draft.
   */
  settle: () => void;
}

/**
 * `key` names the form ("dpr"); null turns drafts off (editing an entry already sent). `value` is everything the form
 * holds, as plain JSON; `restore` puts a saved value back into the form's state.
 */
export function useFormDraft<T>(key: string | null, value: T, restore: (value: T) => void): FormDraft {
  const { user } = useAuth();
  const storageKey = key && user ? `nirmaan.draft.${user.id}.${key}` : null;
  const json = JSON.stringify(value);
  /** How the form looks untouched: not worth keeping. */
  const pristine = useRef<string | null>(null);
  /** What `dirty` compares against. */
  const baseline = useRef<string | null>(null);
  /** The state at the last clear(), never saved again (a save timer may still be running). */
  const clearedAs = useRef<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pending = useRef<'clear' | 'settle' | null>(null);
  const [, setEpoch] = useState(0);
  // Applied on the render after clear() or settle(), once the form's own state updates have landed.
  if (pending.current) {
    if (pending.current === 'clear') clearedAs.current = json;
    // A restored draft keeps the empty form as what is not worth saving, so it stays on the phone.
    else if (!restoredAt) pristine.current = json;
    baseline.current = json;
    pending.current = null;
  }

  // Before the first paint: remember how the form started and put any saved draft back.
  useLayoutEffect(() => {
    pristine.current = json;
    baseline.current = json;
    if (storageKey) {
      const raw = kvGet(storageKey);
      try {
        if (raw) {
          const saved = JSON.parse(raw) as Stored<T>;
          restore(saved.value);
          setRestoredAt(saved.savedAt);
        }
      } catch {
        kvRemove(storageKey);
      }
    }
    setReady(true);
    // Once per form: a later change of key (signing in again) does not restore again.
  }, []);

  useEffect(() => {
    if (!storageKey || !ready || json === clearedAs.current) return;
    const timer = setTimeout(() => {
      if (json === pristine.current) kvRemove(storageKey);
      else kvSet(storageKey, JSON.stringify({ savedAt: new Date().toISOString(), value: JSON.parse(json) } satisfies Stored<T>));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [storageKey, ready, json]);

  const clear = useCallback(() => {
    if (storageKey) kvRemove(storageKey);
    pending.current = 'clear';
    setRestoredAt(null);
    setEpoch((n) => n + 1);
  }, [storageKey]);

  const settle = useCallback(() => {
    pending.current = pending.current ?? 'settle';
    setEpoch((n) => n + 1);
  }, []);

  return { restoredAt, dirty: ready && !pending.current && baseline.current !== null && json !== baseline.current, clear, settle };
}

/** Photos from a saved draft: one that was still uploading when the app closed waits for the outbox or a Retry. */
export function restorePhotos(photos: LocalPhoto[]): LocalPhoto[] {
  return photos.map((p) => (p.uploading ? { ...p, uploading: false, queued: !p.attachmentId } : p));
}

/**
 * Asks before the user leaves a form with unsent work by Back, a swipe or the header. With a draft the
 * work is already safe, so the question is only whether to keep it; editing a sent entry asks whether to discard.
 */
export function useLeaveGuard(draft: FormDraft, opts: { keepsDraft: boolean; busy?: boolean }) {
  const t = useT();
  const navigation = useNavigation();
  usePreventRemove(draft.dirty && !opts.busy, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    if (opts.keepsDraft) {
      Alert.alert(t('Leave this entry?'), t('What you typed stays on this phone as a draft and opens again next time.'), [
        { text: t('Stay'), style: 'cancel' },
        {
          text: t('Delete draft'),
          style: 'destructive',
          onPress: () => {
            draft.clear();
            leave();
          },
        },
        { text: t('Keep draft'), onPress: leave },
      ]);
      return;
    }
    Alert.alert(t('Discard your changes?'), t('The changes you made here have not been sent.'), [
      { text: t('Keep editing'), style: 'cancel' },
      { text: t('Discard'), style: 'destructive', onPress: leave },
    ]);
  });
}

/** "Draft from 13 Oct, 4:10 pm restored" with Start over, at the top of a form that reopened a draft. */
export function DraftNotice({ draft, onStartOver }: { draft: FormDraft; onStartOver: () => void }) {
  const t = useT();
  if (!draft.restoredAt) return null;
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Ionicons name="document-text-outline" size={20} color={colors.primary} />
      <Text style={styles.text}>{t('Your draft from {when} is back. Check it and send it.', { when: formatDateTime(draft.restoredAt) })}</Text>
      <Button
        title={t('Start over')}
        variant="ghost"
        size="sm"
        onPress={() =>
          Alert.alert(t('Start over?'), t('The draft is deleted and the form starts empty.'), [
            { text: t('Cancel'), style: 'cancel' },
            {
              text: t('Start over'),
              style: 'destructive',
              onPress: () => {
                draft.clear();
                onStartOver();
              },
            },
          ])
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingLeft: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.lg },
  text: { ...typography.body, flex: 1 },
});
