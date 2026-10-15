import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { formatPhone, MESSAGE_CHANNEL_LABELS, normalisePhone, type MessageChannel, type MessagingPrefsDto, type OutboundMessageDto } from '@erp/shared';
import { useApi, useFetch } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input } from '../components';
import { colors, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';

/** The user's own opt-in for alerts on WhatsApp and by SMS, with a test message. */
export function MessagingCard() {
  const api = useApi();
  const t = useT();
  const { refreshUser } = useAuth();
  const prefs = useFetch<MessagingPrefsDto>((a) => a.get('/messaging/me'), [], { refetchOnFocus: false });
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  const [sms, setSms] = useState(false);
  const [busy, setBusy] = useState<'save' | MessageChannel | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fill the fields once: saving the number before a test must not undo unsaved switches.
  const filled = useRef(false);
  useEffect(() => {
    if (!prefs.data || filled.current) return;
    filled.current = true;
    setPhone(prefs.data.phone ?? '');
    setWhatsapp(prefs.data.whatsapp);
    setSms(prefs.data.sms);
  }, [prefs.data]);

  const sendTo = normalisePhone(phone);
  const dirty = !!prefs.data && ((prefs.data.phone ?? '') !== phone.trim() || prefs.data.whatsapp !== whatsapp || prefs.data.sms !== sms);

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      prefs.setData(await api.put<MessagingPrefsDto>('/messaging/me', { phone: phone.trim() || null, whatsapp, sms }));
      await refreshUser();
      Alert.alert(t('Saved'), whatsapp && sms ? t('Your alerts will also come on WhatsApp and SMS.') : whatsapp ? t('Your alerts will also come on WhatsApp.') : sms ? t('Your alerts will also come on SMS.') : t('WhatsApp and SMS alerts are off.'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async (channel: MessageChannel) => {
    setBusy(channel);
    setError(null);
    try {
      if ((prefs.data?.phone ?? '') !== phone.trim()) prefs.setData(await api.put<MessagingPrefsDto>('/messaging/me', { phone: phone.trim() || null }));
      const m = await api.post<OutboundMessageDto>('/messaging/me/test', { channel });
      Alert.alert(m.status === 'SENT' ? t('Test sent') : t('Not sent'), m.status === 'SENT' ? t('Sent on {channel} to {phone}.', { channel: t(MESSAGE_CHANNEL_LABELS[channel]), phone: formatPhone(m.to) }) : (m.error ?? t('The message did not go.')));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const notReady = prefs.data && !prefs.data.whatsappReady && !prefs.data.smsReady;

  return (
    <Card title={t('WhatsApp and SMS')}>
      <Text style={[typography.caption, styles.gap]}>{t('Approval requests, send-backs, the morning digest and the DPR, test and payment reminders on your phone. WhatsApp first; SMS when WhatsApp does not get through.')}</Text>
      <ErrorBanner message={error ?? prefs.error} />
      <Input
        label={t('Mobile number')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
        placeholder="98765 43210"
        error={phone.trim() && !sendTo ? t('Not a mobile number') : null}
        hint={sendTo ? t('Messages go to {phone}', { phone: formatPhone(sendTo) }) : undefined}
      />
      <View style={styles.row}>
        <Text style={typography.body}>{t('Alerts on WhatsApp')}</Text>
        <Switch value={whatsapp} onValueChange={setWhatsapp} trackColor={{ true: colors.success }} accessibilityLabel={t('Alerts on WhatsApp')} />
      </View>
      <View style={styles.row}>
        <Text style={typography.body}>{t('Alerts by SMS')}</Text>
        <Switch value={sms} onValueChange={setSms} trackColor={{ true: colors.success }} accessibilityLabel={t('Alerts by SMS')} />
      </View>
      {notReady ? <Text style={[typography.caption, styles.gap]}>{t("WhatsApp and SMS are not set up on the server yet. Alerts start once your company's account is connected.")}</Text> : null}
      <Button title={t('Save')} onPress={() => void save()} loading={busy === 'save'} disabled={!dirty || ((whatsapp || sms) && !sendTo)} />
      <View style={styles.tests}>
        <Button title={t('Test WhatsApp')} variant="secondary" onPress={() => void test('WHATSAPP')} loading={busy === 'WHATSAPP'} disabled={!sendTo} />
        <Button title={t('Test SMS')} variant="secondary" onPress={() => void test('SMS')} loading={busy === 'SMS'} disabled={!sendTo} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  tests: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
});
