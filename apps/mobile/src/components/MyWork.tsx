import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SUBMISSION_TYPE_LABELS, mayApprove, type MyWorkCard, type MyWorkDto, type RoleKey } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { Card } from './Card';
import { SectionTitle } from './Layout';
import { Skeleton } from './Skeleton';

type MyWorkKey = keyof MyWorkDto;
type CardKey = Exclude<MyWorkKey, 'approvals'>;
type Tone = 'warning' | 'error' | 'info';

/**
 * What each kind of user leads with, the same order as the web home (apps/web/src/components/home/layout.ts). Order
 * only: the API leaves out a card the role may not see.
 */
const ORDERS: Record<'director' | 'manager' | 'accounts' | 'stores' | 'qs' | 'site', MyWorkKey[]> = {
  director: ['approvals', 'receivables', 'payablesDue', 'expiring', 'lateDeliveries', 'dprsMissing', 'lowStock', 'sentBack'],
  manager: ['approvals', 'dprsMissing', 'lateDeliveries', 'expiring', 'lowStock', 'payablesDue', 'receivables', 'sentBack'],
  accounts: ['payablesDue', 'receivables', 'approvals', 'expiring', 'lateDeliveries', 'sentBack'],
  stores: ['lateDeliveries', 'lowStock', 'approvals', 'sentBack', 'dprsMissing'],
  qs: ['sentBack', 'approvals', 'receivables', 'dprsMissing'],
  site: ['sentBack', 'dprsMissing', 'approvals', 'lateDeliveries', 'lowStock'],
};

function myWorkOrder(role: RoleKey): MyWorkKey[] {
  switch (role) {
    case 'ADMIN':
    case 'MANAGEMENT':
      return ORDERS.director;
    case 'PROJECT_MANAGER':
    case 'TEAM_LEADER':
      return ORDERS.manager;
    case 'ACCOUNTS_MANAGER':
      return ORDERS.accounts;
    case 'STORE_MANAGER':
    case 'PROCUREMENT_MANAGER':
      return ORDERS.stores;
    case 'QUANTITY_SURVEYOR':
      return ORDERS.qs;
    default:
      return ORDERS.site;
  }
}

/** Title, icon and tone as on the web; `route` is the phone screen the card opens (none where the phone has no such screen). */
const CARDS: Record<CardKey, { title: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone; route: string | null }> = {
  dprsMissing: { title: 'DPRs not filed today', icon: 'document-text-outline', tone: 'warning', route: '/dpr/new' },
  sentBack: { title: 'Sent back to you', icon: 'arrow-undo-outline', tone: 'warning', route: '/submissions' },
  receivables: { title: 'Bills awaiting payment', icon: 'wallet-outline', tone: 'info', route: null },
  payablesDue: { title: 'Payments due this week', icon: 'card-outline', tone: 'error', route: null },
  expiring: { title: 'Guarantees and policies expiring', icon: 'shield-checkmark-outline', tone: 'warning', route: null },
  lateDeliveries: { title: 'Late deliveries', icon: 'bus-outline', tone: 'error', route: null },
  lowStock: { title: 'Below minimum stock', icon: 'file-tray-stacked-outline', tone: 'warning', route: '/stock' },
};

const TONES: Record<Tone, { fg: string; bg: string }> = {
  warning: { fg: colors.warning, bg: colors.warningSoft },
  error: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.primary, bg: colors.primarySoft },
};

/** The API's item links are web pages; these are the ones the phone has a screen for. */
const PHONE_ROUTES: [RegExp, (id: string) => string][] = [
  [/^\/projects\/([^/?]+)\?tab=dpr$/, (id) => `/dpr/new?projectId=${id}`],
  [/^\/progress\/([^/?]+)$/, (id) => `/progress/${id}`],
  [/^\/dpr\/([^/?]+)$/, (id) => `/dpr/${id}`],
  [/^\/material-requests\/([^/?]+)$/, (id) => `/material-request/${id}`],
  [/^\/purchase-orders\/([^/?]+)$/, (id) => `/purchase-order/${id}`],
  [/^\/bills\/([^/?]+)$/, (id) => `/bill/${id}`],
  [/^\/stock$/, () => '/stock'],
];

function phoneRoute(href: string): string | null {
  for (const [re, to] of PHONE_ROUTES) {
    const m = href.match(re);
    if (m) return to(m[1] ?? '');
  }
  return null;
}

/** ₹ in lakh / crore, as the web's formatINRCompact. */
function rupeesCompact(value: string | null): string | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

interface Row {
  key: string;
  label: string;
  note?: string;
  right?: string | null;
  route: string | null;
}

/**
 * The home tab's "My work" (UI roadmap item 66): one card per kind of work that has something in it, in the order
 * the user's role leads with, each with its count and up to three items. `GET /dashboard/my-work` only returns what
 * the role may see.
 */
export function MyWorkPanel({ data, loading }: { data: MyWorkDto | null; loading: boolean }) {
  const { user } = useAuth();
  const t = useT();
  if (loading && !data) {
    return (
      <>
        <SectionTitle title={t('My work')} />
        <Skeleton variant="card" rows={2} label={t('Loading…')} />
      </>
    );
  }
  if (!data || !user) return null;
  const present = myWorkOrder(user.roleKey).filter((k) => data[k] !== undefined);
  if (!present.length) return null;
  const count = (k: MyWorkKey) => (k === 'approvals' ? (data.approvals ?? []).reduce((n, a) => n + a.count, 0) : (data[k] as MyWorkCard).count);
  const busy = present.filter((k) => count(k) > 0);

  return (
    <>
      <SectionTitle title={t('My work')} />
      {busy.length === 0 ? (
        <Card>
          <View style={styles.clear}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <View style={styles.flex}>
              <Text style={typography.bodyStrong}>{t('All caught up')}</Text>
              <Text style={typography.caption}>{t('Nothing waits for you right now.')}</Text>
            </View>
          </View>
        </Card>
      ) : (
        busy.map((k) => {
          if (k === 'approvals') {
            const route = mayApprove(user) ? '/approvals' : null;
            const rows: Row[] = [...(data.approvals ?? [])]
              .filter((a) => a.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, 3)
              .map((a) => ({ key: a.type, label: t(SUBMISSION_TYPE_LABELS[a.type]), right: String(a.count), route }));
            return <WorkCard key={k} title={t('Waiting for your approval')} icon="checkbox-outline" tone="warning" count={count(k)} amount={null} rows={rows} route={route} />;
          }
          const meta = CARDS[k];
          const card = data[k] as MyWorkCard;
          const rows: Row[] = card.items.slice(0, 3).map((i, n) => ({
            key: `${i.href}-${n}`,
            label: i.label,
            // The API's notes are English; the fixed ones have Hindi, the rest show as they come.
            note: [t(i.note), i.projectName].filter(Boolean).join(' · '),
            right: rupeesCompact(i.amount),
            route: phoneRoute(i.href) ?? (k === 'sentBack' ? meta.route : null),
          }));
          return <WorkCard key={k} title={t(meta.title)} icon={meta.icon} tone={meta.tone} count={card.count} amount={card.amount} rows={rows} route={meta.route} />;
        })
      )}
    </>
  );
}

function WorkCard({ title, icon, tone, count, amount, rows, route }: { title: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone; count: number; amount: string | null; rows: Row[]; route: string | null }) {
  const router = useRouter();
  const t = useT();
  const c = TONES[tone];
  const go = (to: string | null) => (to ? () => router.push(to as Href) : undefined);
  const total = rupeesCompact(amount);
  const rest = count - rows.length;
  return (
    <Card style={styles.card}>
      <Pressable onPress={go(route)} disabled={!route} accessibilityRole={route ? 'button' : 'summary'} accessibilityLabel={t('{title}: {n}', { title, n: count })} style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <View style={[styles.icon, { backgroundColor: c.bg }]}>
          <Ionicons name={icon} size={20} color={c.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong} numberOfLines={2}>
            {title}
          </Text>
          {total ? <Text style={typography.caption}>{total}</Text> : null}
        </View>
        <Text style={[styles.count, { color: c.fg }]}>{count}</Text>
      </Pressable>
      {rows.map((r) => (
        <Pressable key={r.key} onPress={go(r.route)} disabled={!r.route} accessibilityRole={r.route ? 'button' : undefined} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text style={typography.body} numberOfLines={1}>
              {r.label}
            </Text>
            {r.note ? (
              <Text style={typography.caption} numberOfLines={1}>
                {r.note}
              </Text>
            ) : null}
          </View>
          {r.right ? <Text style={styles.right}>{r.right}</Text> : null}
          {r.route ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
        </Pressable>
      ))}
      {rest > 0 && rows.length > 0 && route ? (
        <Pressable onPress={go(route)} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.more}>{t('{n} more', { n: rest })}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { paddingVertical: spacing.md },
  clear: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, minHeight: 48 },
  right: { ...typography.caption, color: colors.text, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  more: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
});
