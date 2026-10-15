import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/auth/AuthContext';
import { Button, ErrorBanner, Input, Intro, Screen, useIntroSeen } from '../src/components';
import { errorMessage, request } from '../src/api/client';
import type { AuthOptionsDto } from '@erp/shared';
import { PRODUCT_NAME } from '@erp/shared';
import { API_URL } from '../src/config';
import { colors, fonts, radius, spacing, touch, typography } from '../src/theme';

const DEMO_ACCOUNTS = [
  { email: 'engineer@demo.com', role: 'Site Engineer' },
  { email: 'tl@demo.com', role: 'Team Leader' },
  { email: 'pm@demo.com', role: 'Project Manager' },
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
  const [introSeen, markIntroSeen] = useIntroSeen();
  // The form settles into place once, after the intro check.
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (introSeen) Animated.timing(rise, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [introSeen, rise]);

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

  // First launch on this phone: three slides on what the app does, then the sign-in form.
  if (introSeen === null) return <View style={styles.blank} />;
  if (!introSeen) return <Intro onDone={markIntroSeen} />;

  return (
    <Screen keyboard edges={['top', 'left', 'right', 'bottom']} style={styles.content} background={colors.surface}>
      <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <View style={styles.brand}>
          <Image source={require('../assets/splash-icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text style={styles.wordmark}>{PRODUCT_NAME.toUpperCase()}</Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Sign in
        </Text>
        <Text style={styles.subtitle}>Welcome back. Report progress, DPRs and material requests from site.</Text>

        <ErrorBanner message={error} />
        <Text style={styles.label}>Email</Text>
        <Input
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@company.com"
          returnKeyType="next"
        />
        <View style={styles.labelRow}>
          <Text style={styles.label}>Password</Text>
          <Pressable onPress={forgot} hitSlop={12} accessibilityRole="button">
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        </View>
        <Input
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPw}
          textContentType="password"
          placeholder="Your password"
          returnKeyType="go"
          onSubmitEditing={submit}
          right={
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} accessibilityLabel={showPw ? 'Hide password' : 'Show password'}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
            </Pressable>
          }
        />
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Button title="Sign in" onPress={submit} loading={busy} style={styles.submit} />

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>Try a demo account</Text>
          <View style={styles.rule} />
        </View>
        <View style={styles.chips}>
          {DEMO_ACCOUNTS.map((a) => {
            const on = email.trim().toLowerCase() === a.email;
            return (
              <Pressable
                key={a.email}
                onPress={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityHint={`Fills in ${a.email}`}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{a.role}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.demoNote}>Fills in the form. Every demo account uses the password {DEMO_PASSWORD}.</Text>
        <Text style={styles.api}>{API_URL}</Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  blank: { flex: 1, backgroundColor: colors.surface },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 40 },
  logo: { width: 36, height: 36 },
  wordmark: { ...typography.wordmark, fontSize: 20, letterSpacing: 1.5, color: colors.primaryDark },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.primaryDark, marginBottom: spacing.sm },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: spacing.xxl },
  label: { fontSize: 14, fontWeight: '600', color: colors.primaryDark, marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  notice: { ...typography.body, color: colors.text, marginBottom: spacing.lg },
  submit: { marginTop: spacing.xs },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 40, marginBottom: spacing.lg },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: touch.heightSm, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.brand, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  demoNote: { ...typography.caption, marginTop: spacing.md },
  api: { ...typography.caption, fontSize: 11, marginTop: spacing.xl, textAlign: 'center' },
});
