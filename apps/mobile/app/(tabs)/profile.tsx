import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ROLE_LABELS, canApprove } from '@erp/shared';
import { useAuth } from '../../src/auth/AuthContext';
import { useNotifications } from '../../src/notifications/NotificationsContext';
import { Button, Card, KeyValue, Screen } from '../../src/components';
import { API_URL } from '../../src/config';
import { colors, spacing, typography } from '../../src/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { push } = useNotifications();
  if (!user) return null;
  const initials = user.fullName
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const confirmLogout = () => {
    Alert.alert('Sign out', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={typography.h2}>{user.fullName}</Text>
        <Text style={typography.caption}>{ROLE_LABELS[user.roleKey] ?? user.roleName}</Text>
      </View>
      <Card title="Account">
        <KeyValue label="Email" value={user.email} />
        <KeyValue label="Phone" value={user.phone} />
        <KeyValue label="Role" value={user.roleName} />
        <KeyValue label="Organisation" value={user.organizationName} />
        <KeyValue label="Can approve" value={canApprove(user.roleKey) ? 'Yes' : 'No'} />
      </Card>
      <Card title="Notifications">
        <KeyValue label="Push to this device" value={push ? (push.status === 'ready' ? 'On' : push.status === 'denied' ? 'Permission denied' : 'Not available') : 'Checking…'} />
        {push && push.status !== 'ready' && push.reason ? <Text style={typography.caption}>{push.reason}</Text> : null}
        <Text style={typography.caption}>Approvals, rejections and change requests on your submissions, plus the daily DPR reminder, also appear under Notifications on the Home screen.</Text>
      </Card>
      <Card title="Connection">
        <View style={styles.apiRow}>
          <Ionicons name="server-outline" size={18} color={colors.textMuted} />
          <Text style={styles.api} selectable>
            {API_URL}
          </Text>
        </View>
        <Text style={typography.caption}>Set EXPO_PUBLIC_API_URL before starting Expo to point the app at another server.</Text>
      </Card>
      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={confirmLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.xl, gap: 2 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  apiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  api: { ...typography.bodyStrong, flex: 1 },
});
