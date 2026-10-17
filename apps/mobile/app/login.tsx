import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/auth/AuthContext';
import { Button, ErrorBanner, Input, Intro, Screen, useIntroSeen } from '../src/components';
import { errorMessage, request } from '../src/api/client';
import type { AuthOptionsDto } from '@erp/shared';
import { PRODUCT_NAME } from '@erp/shared';
import { useT } from '../src/i18n/LanguageContext';
import { LanguageSwitch } from '../src/i18n/LanguageSwitch';
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
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [introSeen, markIntroSeen] = useIntroSeen();
  // The demo accounts show only where the server offers them (DEMO_LOGIN), never on a company's own server.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    request<AuthOptionsDto>('/auth/options')
      .then((o) => setDemo(o.demoLogin))
      .catch(() => setDemo(false));
  }, []);
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
      setError(t('Enter your email above, then tap Forgot password.'));
      return;
    }
    try {
      const options = await request<AuthOptionsDto>('/auth/options');
      if (!options.resetByEmail) {
        setNotice(t('Password emails are not set up. Ask your admin to send you a new password link from the Users page.'));
        return;
      }
      await request('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setNotice(t('If {email} has an account, a reset link is on its way. Open it, choose a new password, then sign in here.', { email: email.trim() }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t('Enter your email and password.'));
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
          <View style={styles.flex} />
          <LanguageSwitch />
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {t('Sign in')}
        </Text>
        <Text style={styles.subtitle}>{t('Welcome back. Report progress, DPRs and material requests from site.')}</Text>

        <ErrorBanner message={error} />
        <Text style={styles.label}>{t('Email')}</Text>
        <Input
          accessibilityLabel={t('Email')}
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
          <Text style={styles.label}>{t('Password')}</Text>
          <Pressable onPress={forgot} hitSlop={12} accessibilityRole="button">
            <Text style={styles.link}>{t('Forgot password?')}</Text>
          </Pressable>
        </View>
        <Input
          accessibilityLabel={t('Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPw}
          textContentType="password"
          placeholder={t('Your password')}
          returnKeyType="go"
          onSubmitEditing={submit}
          right={
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} accessibilityRole="button" accessibilityLabel={showPw ? t('Hide password') : t('Show password')}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
            </Pressable>
          }
        />
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Button title={t('Sign in')} onPress={submit} loading={busy} style={styles.submit} />

        {demo ? (
          <>
            <View style={styles.divider}>
              <View style={styles.rule} />
              <Text style={styles.dividerText}>{t('Try a demo account')}</Text>
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
                    accessibilityHint={t('Fills in {email}', { email: a.email })}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(a.role)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.demoNote}>{t('Fills in the form. Every demo account uses the password {password}.', { password: DEMO_PASSWORD })}</Text>
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  blank: { flex: 1, backgroundColor: colors.surface },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 40 },
  flex: { flex: 1 },
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
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.primary, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  demoNote: { ...typography.caption, marginTop: spacing.md },
});
