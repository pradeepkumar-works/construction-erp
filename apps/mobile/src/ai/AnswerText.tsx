import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '../theme';
import { phoneRoute } from './links';

/**
 * An answer's text, as the web panel shows its Markdown but kept to what answers use (AI item 72): paragraphs, "-" and
 * "1." lists, **bold**, and links. A link to a record the phone has a screen for opens it; any other is plain text.
 */
export function AnswerText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <View>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          return (
            <View key={i} style={styles.block}>
              {lines.map((l, j) => {
                const m = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/)!;
                return (
                  <View key={j} style={styles.item}>
                    <Text style={styles.bullet}>{/\d/.test(m[1]) ? m[1] : '•'}</Text>
                    <Text style={styles.text}>
                      <Inline text={m[2]} />
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }
        const heading = lines.length === 1 && /^#{1,4}\s+/.test(lines[0]);
        return (
          <Text key={i} style={[styles.text, styles.block, heading && styles.heading]}>
            <Inline text={heading ? lines[0].replace(/^#{1,4}\s+/, '') : lines.join('\n')} />
          </Text>
        );
      })}
    </View>
  );
}

/** **bold** and [label](/path) inside a line. */
function Inline({ text }: { text: string }) {
  const router = useRouter();
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<Text key={m.index} style={styles.bold}>{m[1]}</Text>);
    else {
      const route = phoneRoute(m[3]);
      parts.push(
        route ? (
          <Text key={m.index} style={styles.link} accessibilityRole="link" onPress={() => router.push(route as never)}>
            {m[2]}
          </Text>
        ) : (
          m[2]
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  bullet: { ...typography.body, color: colors.textMuted, minWidth: 14 },
  text: { ...typography.body, flex: 1, lineHeight: 22 },
  heading: { fontWeight: '700' },
  bold: { fontWeight: '700' },
  link: { color: colors.primary, textDecorationLine: 'underline', fontWeight: '600' },
});
