import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/auth/AuthContext';
import { Button, ErrorBanner, Input, Screen } from '../src/components';
import { errorMessage, request } from '../src/api/client';
import type { AuthOptionsDto } from '@erp/shared';
import { API_URL } from '../src/config';
import { colors, radius, spacing, typography } from '../src/theme';

const DEMO_ACCOUNTS = [
  { email: 'engineer@demo.com', role: 'Site Engineer' },
  { email: 'tl@demo.com', role: 'Team Leader' },
  { email: 'pm@demo.com', role: 'Project Manager (approver)' },
  { email: 'store@demo.com', role: 'Store Manager' },
];
const DEMO_PASSWORD = 'password123';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Ask for a reset email; the link opens the web app, where the new password is chosen. */
  const forgot = async () => {
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    try {
      const options = await request<AuthOptionsDto>('/auth/options');
      if (!options.resetByEmail) {
        setNotice('Password emails are not set up. Ask your admin to send you a new password link from the Users page.');
        return;
      }
      await request('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setNotice(`If ${email.trim()} has an account, a reset link is on its way. Open it, choose a new password, then sign in here.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // Stack.Protected switches to the tabs once `user` is set.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard edges={['top', 'left', 'right', 'bottom']} style={styles.content}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="construct" size={34} color={colors.textOnPrimary} />
        </View>
        <Text style={typography.h1}>Site App</Text>
        <Text style={typography.caption}>Daily progress, DPRs and material requests from site</Text>
      </View>

      <ErrorBanner message={error} />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@company.com"
        returnKeyType="next"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPw}
        textContentType="password"
        placeholder="••••••••"
        returnKeyType="go"
        onSubmitEditing={submit}
        right={
          <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} accessibilityLabel="Toggle password visibility">
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
          </Pressable>
        }
      />
      <Button title="Sign in" onPress={submit} loading={busy} icon="log-in-outline" />
      <Pressable onPress={forgot} hitSlop={8} style={styles.forgot} accessibilityRole="button">
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Demo accounts (password: {DEMO_PASSWORD})</Text>
        {DEMO_ACCOUNTS.map((a) => (
          <Pressable
            key={a.email}
            onPress={() => {
              setEmail(a.email);
              setPassword(DEMO_PASSWORD);
              setError(null);
            }}
            style={styles.demoRow}
          >
            <Text style={styles.demoEmail}>{a.email}</Text>
            <Text style={typography.caption}>{a.role}</Text>
          </Pressable>
        ))}
        <Text style={styles.api}>API: {API_URL}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.xs },
  logo: { width: 68, height: 68, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  demo: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  demoTitle: { ...typography.label, marginBottom: spacing.sm },
  demoRow: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 44, justifyContent: 'center' },
  demoEmail: { ...typography.bodyStrong, color: colors.primary },
  api: { ...typography.caption, marginTop: spacing.md, fontSize: 12 },
  forgot: { alignSelf: 'center', paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' },
  forgotText: { ...typography.bodyStrong, color: colors.primary },
  notice: { ...typography.body, color: colors.text, textAlign: 'center' },
});
