import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AI_DRAFT_LABELS, AI_QUESTION_MAX, PRODUCT_NAME, type AiDraftDto, type AiMessageDto } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { Button, Screen, Select, IconButton, Touchable } from '../../src/components';
import { useProjectOptions } from '../../src/forms/common';
import { keepDraft, streamAsk } from '../../src/ai/ask';
import { AnswerText } from '../../src/ai/AnswerText';
import { phoneRoute } from '../../src/ai/links';
import { useOffline } from '../../src/offline';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { errorMessage } from '../../src/api/client';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../../src/theme';
import { today } from '../../src/utils/format';

interface Turn {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  /** What the assistant is doing while the answer streams ("Looking at DPRs…") */
  status?: string | null;
  message?: AiMessageDto;
  error?: string;
}

/** Room for the words around dictated notes, under the server's limit on a question. */
const NOTES_MAX = AI_QUESTION_MAX - 300;

/**
 * Ask Nirmaan on the phone (AI item 72): type or speak (the keyboard's own microphone) in Hindi, English or Hinglish;
 * answers come in the app's language with links that open the phone's own screens. "Dictate today's DPR" turns spoken
 * notes into a filled DPR form to check and send, which goes through the outbox like any DPR if the signal drops.
 */
export default function AskScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useAuth();
  const { language } = useLanguage();
  const { online } = useOffline();
  const projects = useProjectOptions();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [dictating, setDictating] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!projectId && projects.options.length === 1) setProjectId(projects.options[0].value);
  }, [projects.options, projectId]);
  useEffect(() => () => abort.current?.abort(), []);

  const update = (key: string, patch: (turn: Turn) => Partial<Turn>) => setTurns((ts) => ts.map((x) => (x.key === key ? { ...x, ...patch(x) } : x)));

  const send = async (typed: string) => {
    const said = typed.trim();
    if (said.length < 2 || busy || !online) return;
    const project = projects.options.find((o) => o.value === projectId);
    if (dictating && !project) return;
    // The notes go to the drafting tool as said; the words around them only tell it what to make.
    const asked = dictating ? `Draft today's DPR (${today()}) for the project ${project!.hint ? `${project!.hint.split(' · ')[0]} ` : ''}"${project!.label}" from my notes below. Fill in only what the notes say.\n\nNotes: ${said}` : said;
    const now = Date.now();
    const answerKey = `a${now}`;
    setTurns((ts) => [...ts, { key: `q${now}`, role: 'user', text: said }, { key: answerKey, role: 'assistant', text: '', status: t('Thinking…') }]);
    setQuestion('');
    setDictating(false);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await streamAsk(
        { question: asked, threadId, language, client: 'phone', page: projectId ? { projectId } : undefined },
        token,
        (e) => {
          if (e.type === 'thread') setThreadId(e.threadId);
          else if (e.type === 'status') update(answerKey, () => ({ status: t(e.text) }));
          else if (e.type === 'text') update(answerKey, (x) => ({ text: x.text + e.text, status: null }));
          else if (e.type === 'done') update(answerKey, () => ({ message: e.message, text: e.message.text, status: null }));
          else if (e.type === 'error') update(answerKey, () => ({ error: e.message, status: null }));
        },
        ctrl.signal,
      );
    } catch (e) {
      update(answerKey, () => ({ error: errorMessage(e), status: null }));
    } finally {
      update(answerKey, () => ({ status: null }));
      setBusy(false);
      abort.current = null;
    }
  };

  const startOver = () => {
    abort.current?.abort();
    setTurns([]);
    setThreadId(null);
    setDictating(false);
    setQuestion('');
  };

  const dictate = () => {
    setDictating(true);
    setTimeout(() => input.current?.focus(), 50);
  };

  const suggestions = [t('What is waiting for my approval?'), t('How much cement is left at my site?'), t('What work was done on my site yesterday?')];

  return (
    <Screen scroll={false} padded={false} keyboard edges={['left', 'right']}>
      <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {turns.length === 0 ? (
          <View>
            <View style={styles.intro}>
              <Ionicons name="sparkles" size={28} color={colors.primary} />
              <Text style={styles.introTitle} maxFontSizeMultiplier={maxFontScale}>
                {t('Ask {name}', { name: PRODUCT_NAME })}
              </Text>
              <Text style={styles.introText}>{t('Ask about your projects in Hindi, English or Hinglish. Type, or tap the microphone on your keyboard and speak. It only reads; nothing is saved until you send a form yourself.')}</Text>
            </View>
            <Touchable onPress={dictate} disabled={!online} style={[styles.dictateTile, !online && styles.disabled]} accessibilityRole="button" accessibilityLabel={t("Dictate today's DPR")}>
              <Ionicons name="mic" size={26} color={colors.onBrand} />
              <View style={styles.flex}>
                <Text style={styles.dictateTitle} maxFontSizeMultiplier={maxFontScale}>
                  {t("Dictate today's DPR")}
                </Text>
                <Text style={styles.dictateText} maxFontSizeMultiplier={maxFontScale}>
                  {t('Say the work done, manpower, machines and any problems; check the filled form and send it.')}
                </Text>
              </View>
            </Touchable>
            {suggestions.map((s) => (
              <Touchable key={s} onPress={() => send(s)} disabled={!online} style={[styles.suggestion, !online && styles.disabled]} accessibilityRole="button">
                <Text style={styles.suggestionText} maxFontSizeMultiplier={maxFontScale}>
                  {s}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              </Touchable>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.topRow}>
              <Button title={t('New conversation')} variant="ghost" size="sm" icon="add" onPress={startOver} />
            </View>
            {turns.map((x) =>
              x.role === 'user' ? (
                <View key={x.key} style={styles.userBubble}>
                  <Text style={styles.userText}>{x.text}</Text>
                </View>
              ) : (
                <Answer key={x.key} turn={x} onOpenDraft={(d, i) => router.push(`/dpr/new?fromAsk=${encodeURIComponent(keepDraft(`${x.message?.id ?? x.key}:${i}`, d))}` as never)} />
              ),
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.composer}>
        {!online ? (
          <View style={styles.offline} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
            <Text style={styles.offlineText}>{t('Ask needs a connection. Your DPRs and other entries still save on this phone and send later.')}</Text>
          </View>
        ) : null}
        {dictating ? (
          <View style={styles.dictating}>
            <View style={styles.dictatingHead}>
              <Ionicons name="mic" size={18} color={colors.primary} />
              <Text style={styles.dictatingText}>{t("Today's DPR: tap the microphone on your keyboard and say what was done.")}</Text>
              <IconButton icon="close" size={20} color={colors.textMuted} onPress={() => setDictating(false)} accessibilityLabel={t('Cancel')} />
            </View>
            {projects.options.length > 1 ? <Select label={t('Project')} required value={projectId} options={projects.options} onChange={setProjectId} placeholder={t('Choose project')} /> : null}
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            ref={input}
            value={question}
            onChangeText={setQuestion}
            placeholder={dictating ? t('e.g. Slab casting at B2 done, 12 masons 20 helpers, mixer 6 hours, cement short') : t('Ask a question')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={dictating ? NOTES_MAX : AI_QUESTION_MAX}
            editable={online}
            maxFontSizeMultiplier={maxFontScale}
            style={[styles.input, dictating && styles.inputTall]}
            accessibilityLabel={dictating ? t("Notes for today's DPR") : t('Question')}
            accessibilityHint={t('Type, or tap the microphone on your keyboard to speak')}
          />
          <Touchable
            onPress={() => (busy ? abort.current?.abort() : send(question))}
            disabled={!online || (!busy && (question.trim().length < 2 || (dictating && !projectId)))}
            style={[styles.send, (!online || (!busy && (question.trim().length < 2 || (dictating && !projectId)))) && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel={busy ? t('Stop') : dictating ? t('Make the DPR') : t('Send')}
          >
            <Ionicons name={busy ? 'stop' : dictating ? 'document-text' : 'send'} size={22} color={colors.onBrand} />
          </Touchable>
        </View>
      </View>
    </Screen>
  );
}

/** One answer: its text as it streams, what it is doing, the records it used and any form it filled in. */
function Answer({ turn, onOpenDraft }: { turn: Turn; onOpenDraft: (d: AiDraftDto, i: number) => void }) {
  const t = useT();
  const router = useRouter();
  const m = turn.message;
  const links = (m?.citations ?? []).map((c) => ({ ...c, route: phoneRoute(c.href) })).filter((c) => c.route);
  return (
    <View style={styles.answer}>
      {turn.text ? <AnswerText text={turn.text} /> : null}
      {turn.status ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>{turn.status}</Text>
        </View>
      ) : null}
      {turn.error ? <Text style={styles.error}>{turn.error}</Text> : null}
      {m?.unverified.length ? <Text style={styles.caption}>{t('Check these figures before relying on them: {list}', { list: m.unverified.join(', ') })}</Text> : null}
      {links.length ? (
        <View style={styles.chips}>
          {links.map((c) => (
            <Touchable key={c.href} onPress={() => router.push(c.route as never)} style={styles.chip} accessibilityRole="link">
              <Text style={styles.chipText} maxFontSizeMultiplier={maxFontScale}>
                {c.label}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : null}
      {(m?.drafts ?? []).map((d, i) => (
        <View key={i} style={styles.draft} accessibilityRole="summary" accessibilityLabel={t('Filled-in {kind}, not sent', { kind: t(AI_DRAFT_LABELS[d.kind]) })}>
          <Text style={styles.draftKind} maxFontSizeMultiplier={maxFontScale}>
            {t('{kind}, not sent', { kind: t(AI_DRAFT_LABELS[d.kind]) })}
          </Text>
          <Text style={styles.draftTitle}>{d.title}</Text>
          {d.flags.length ? <Text style={styles.caption}>{d.flags.length === 1 ? t('1 thing to check when you open it') : t('{n} things to check when you open it', { n: d.flags.length })}</Text> : null}
          {d.kind === 'dpr' ? (
            <Button title={t('Open DPR form')} icon="document-text-outline" size="sm" onPress={() => onOpenDraft(d, i)} />
          ) : (
            <Text style={styles.caption}>{t('Open this conversation in Ask {name} on the web to finish it there.', { name: PRODUCT_NAME })}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  intro: { alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.lg },
  introTitle: { ...typography.h2 },
  introText: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  dictateTile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, minHeight: touch.height, marginBottom: spacing.md },
  dictateTitle: { fontSize: 17, fontWeight: '700', color: colors.onBrand },
  dictateText: { fontSize: fontSize.secondary, color: colors.onBrand, marginTop: 2 },
  suggestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: touch.height, marginBottom: spacing.sm },
  suggestionText: { ...typography.body, flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.sm },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.primarySoft, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
  userText: { ...typography.body },
  answer: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  statusText: { ...typography.caption },
  error: { ...typography.body, color: colors.danger },
  caption: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: touch.heightSm, justifyContent: 'center' },
  chipText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.secondary },
  draft: { marginTop: spacing.md, borderColor: colors.primary, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  draftKind: { ...typography.label, color: colors.primary },
  draftTitle: { ...typography.bodyStrong, marginBottom: spacing.xs },
  composer: { borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  offline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm },
  offlineText: { ...typography.caption, color: colors.text, flex: 1 },
  dictating: { gap: spacing.sm },
  dictatingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dictatingText: { ...typography.caption, color: colors.text, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { ...typography.body, flex: 1, minHeight: touch.height, maxHeight: 140, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 14, backgroundColor: colors.surface },
  inputTall: { minHeight: 96, maxHeight: 220 },
  send: { width: touch.height, height: touch.height, borderRadius: touch.height / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
