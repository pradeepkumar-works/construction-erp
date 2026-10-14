import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { formatPhone, MESSAGE_CHANNEL_LABELS, normalisePhone, type MessageChannel, type MessagingPrefsDto, type OutboundMessageDto } from '@erp/shared';
import { useApi, useFetch } from '../api/hooks';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input } from '../components';
import { colors, spacing, typography } from '../theme';

/** The user's own opt-in for alerts on WhatsApp and by SMS, with a test message. */
export function MessagingCard() {
  const api = useApi();
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
      Alert.alert('Saved', whatsapp || sms ? `Your alerts will also come on ${[whatsapp && 'WhatsApp', sms && 'SMS'].filter(Boolean).join(' and ')}.` : 'WhatsApp and SMS alerts are off.');
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
      Alert.alert(m.status === 'SENT' ? 'Test sent' : 'Not sent', m.status === 'SENT' ? `Sent on ${MESSAGE_CHANNEL_LABELS[channel]} to ${formatPhone(m.to)}.` : (m.error ?? 'The message did not go.'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const notReady = prefs.data && !prefs.data.whatsappReady && !prefs.data.smsReady;

  return (
    <Card title="WhatsApp and SMS">
      <Text style={[typography.caption, styles.gap]}>Approval requests, send-backs, the morning digest and the DPR, test and payment reminders on your phone. WhatsApp first; SMS when WhatsApp does not get through.</Text>
      <ErrorBanner message={error ?? prefs.error} />
      <Input
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
        placeholder="98765 43210"
        error={phone.trim() && !sendTo ? 'Not a mobile number' : null}
        hint={sendTo ? `Messages go to ${formatPhone(sendTo)}` : undefined}
      />
      <View style={styles.row}>
        <Text style={typography.body}>Alerts on WhatsApp</Text>
        <Switch value={whatsapp} onValueChange={setWhatsapp} trackColor={{ true: colors.success }} accessibilityLabel="Alerts on WhatsApp" />
      </View>
      <View style={styles.row}>
        <Text style={typography.body}>Alerts by SMS</Text>
        <Switch value={sms} onValueChange={setSms} trackColor={{ true: colors.success }} accessibilityLabel="Alerts by SMS" />
      </View>
      {notReady ? <Text style={[typography.caption, styles.gap]}>WhatsApp and SMS are not set up on the server yet. Alerts start once your company's account is connected.</Text> : null}
      <Button title="Save" onPress={() => void save()} loading={busy === 'save'} disabled={!dirty || ((whatsapp || sms) && !sendTo)} />
      <View style={styles.tests}>
        <Button title="Test WhatsApp" variant="secondary" onPress={() => void test('WHATSAPP')} loading={busy === 'WHATSAPP'} disabled={!sendTo} />
        <Button title="Test SMS" variant="secondary" onPress={() => void test('SMS')} loading={busy === 'SMS'} disabled={!sendTo} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  tests: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
});
