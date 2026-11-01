import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SUBMISSION_TYPE_LABELS, mayApprove, type MyWorkCard, type MyWorkDto, type RoleKey } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSize, radius, spacing, touch, typography } from '../theme';
import { formatMoneyCompact } from '../utils/format';
import { useT } from '../i18n/LanguageContext';
import { Card } from './Card';
import { SectionTitle } from './Layout';
import { Skeleton } from './Skeleton';
import { Touchable } from './Touchable';
import { useOpenNode } from '../launcher/open';

// `approvalsWaitingDays` is a figure on the approvals card, not a card of its own.
type MyWorkKey = Exclude<keyof MyWorkDto, 'approvalsWaitingDays'>;
type CardKey = Exclude<MyWorkKey, 'approvals'>;
type Tone = 'warning' | 'error' | 'info';

/**
 * What each kind of user leads with, the same order as the web home (apps/web/src/components/home/layout.ts). Order
 * only: the API leaves out a card the role may not see.
 */
const ORDERS: Record<'director' | 'manager' | 'accounts' | 'purchase' | 'stores' | 'hr' | 'qs' | 'site' | 'documents', MyWorkKey[]> = {
  director: ['approvals', 'watchList', 'receivables', 'payablesDue', 'certifiedToReceive', 'expiring', 'lateDeliveries', 'toOrder', 'staffToDecide', 'dprsMissing', 'lowStock', 'toMatch', 'toDebit', 'grnsToCheck', 'findingsToClose', 'dueThisWeek', 'transfersToReceive', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
  manager: ['approvals', 'watchList', 'meetingActions', 'letters', 'dprsMissing', 'staffToDecide', 'lateDeliveries', 'toOrder', 'grnsToCheck', 'findingsToClose', 'dueThisWeek', 'transfersToReceive', 'expiring', 'lowStock', 'payablesDue', 'receivables', 'sentBack', 'waitingWithOthers'],
  accounts: ['payablesDue', 'certifiedToReceive', 'toMatch', 'toDebit', 'watchList', 'receivables', 'approvals', 'expiring', 'lateDeliveries', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
  purchase: ['toOrder', 'lateDeliveries', 'dueThisWeek', 'toMatch', 'toDebit', 'approvals', 'watchList', 'lowStock', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
  stores: ['dueThisWeek', 'transfersToReceive', 'lateDeliveries', 'lowStock', 'watchList', 'approvals', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers', 'dprsMissing'],
  hr: ['staffToDecide', 'approvals', 'watchList', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
  qs: ['sentBack', 'waitingWithOthers', 'approvals', 'meetingActions', 'letters', 'receivables', 'dprsMissing'],
  documents: ['letters', 'approvals', 'watchList', 'meetingActions', 'sentBack', 'waitingWithOthers'],
  site: ['grnsToCheck', 'findingsToClose', 'sentBack', 'meetingActions', 'letters', 'waitingWithOthers', 'dprsMissing', 'approvals', 'dueThisWeek', 'transfersToReceive', 'lateDeliveries', 'lowStock', 'staffToDecide'],
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
    case 'PROCUREMENT_MANAGER':
      return ORDERS.purchase;
    case 'STORE_MANAGER':
      return ORDERS.stores;
    case 'HR_MANAGER':
      return ORDERS.hr;
    case 'QUANTITY_SURVEYOR':
      return ORDERS.qs;
    case 'DOCUMENT_CONTROLLER':
      return ORDERS.documents;
    default:
      return ORDERS.site;
  }
}

/**
 * Title, icon and tone as on the web; `route` is the phone screen the card opens, `web` the web page it opens where the
 * phone has no such screen (the web's own card link).
 */
const CARDS: Record<CardKey, { title: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone; route: string | null; web: string | null }> = {
  dprsMissing: { title: 'DPRs not filed today', icon: 'document-text-outline', tone: 'warning', route: '/dpr/new', web: '/dpr' },
  sentBack: { title: 'Sent back to you', icon: 'arrow-undo-outline', tone: 'warning', route: '/submissions', web: null },
  waitingWithOthers: { title: 'Waiting with others', icon: 'hourglass-outline', tone: 'info', route: '/submissions', web: null },
  receivables: { title: 'Bills awaiting payment', icon: 'wallet-outline', tone: 'info', route: null, web: '/receivables' },
  payablesDue: { title: 'Payments due this week', icon: 'card-outline', tone: 'error', route: null, web: '/payables' },
  expiring: { title: 'Guarantees and policies expiring', icon: 'shield-checkmark-outline', tone: 'warning', route: null, web: '/compliance' },
  lateDeliveries: { title: 'Late deliveries', icon: 'bus-outline', tone: 'error', route: null, web: '/purchase-orders' },
  lowStock: { title: 'Below minimum stock', icon: 'file-tray-stacked-outline', tone: 'warning', route: '/stock', web: '/stock' },
  watchList: { title: 'Watch list', icon: 'eye-outline', tone: 'warning', route: null, web: '/watch-list' },
  meetingActions: { title: 'Your actions from meetings', icon: 'checkbox-outline', tone: 'warning', route: null, web: '/meetings?view=actions&mine=1' },
  letters: { title: 'Letters for you', icon: 'mail-outline', tone: 'warning', route: '/letters', web: '/correspondence?mine=1' },
  toOrder: { title: 'Requests to order', icon: 'cart-outline', tone: 'error', route: null, web: '/requests-to-order' },
  dueThisWeek: { title: 'Deliveries due this week', icon: 'calendar-outline', tone: 'info', route: null, web: '/purchase-orders?tab=status' },
  staffToDecide: { title: 'Leave and overtime to decide', icon: 'people-outline', tone: 'warning', route: '/staff', web: '/staff?tab=leave' },
  certifiedToReceive: { title: 'Certified, payment to come', icon: 'document-attach-outline', tone: 'error', route: null, web: '/receivables' },
  toMatch: { title: 'Goods received, no bill yet', icon: 'git-compare-outline', tone: 'warning', route: null, web: '/vendor-bills?tab=to-bill' },
  grnsToCheck: { title: 'Material to check', icon: 'clipboard-outline', tone: 'warning', route: null, web: '/inspections?tab=grns' },
  findingsToClose: { title: 'Audit findings to close', icon: 'search-outline', tone: 'warning', route: null, web: '/qa-audits?open=1' },
  toDebit: { title: 'Debit notes to raise', icon: 'return-down-back-outline', tone: 'warning', route: null, web: '/payables?tab=debit-notes&sub=to-raise' },
  transfersToReceive: { title: 'Material on the way', icon: 'swap-horizontal-outline', tone: 'info', route: '/stock', web: '/stock' },
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
  [/^\/staff(\?.*)?$/, () => '/staff'],
  [/^\/correspondence\/([^/?]+)$/, (id) => `/letter/${id}`],
];

function phoneRoute(href: string): string | null {
  for (const [re, to] of PHONE_ROUTES) {
    const m = href.match(re);
    if (m) return to(m[1] ?? '');
  }
  return null;
}

const rupeesCompact = (value: string | null) => formatMoneyCompact(value);

interface Row {
  key: string;
  label: string;
  note?: string;
  right?: string | null;
  route: string | null;
  /** The web page it opens where the phone has no screen for it */
  web?: string | null;
}

/**
 * The home tab's "My work": one card per kind of work that has something in it, in the order
 * the user's role leads with, each with its count and up to three items. `GET /dashboard/my-work` only returns what
 * the role may see.
 */
/** `title` false where the screen itself is My work (its header says it). */
export function MyWorkPanel({ data, loading, title = true, webUrl = null }: { data: MyWorkDto | null; loading: boolean; title?: boolean; webUrl?: string | null }) {
  const { user } = useAuth();
  const t = useT();
  const { openWeb } = useOpenNode(webUrl);
  if (loading && !data) {
    return (
      <>
        {title ? <SectionTitle title={t('My work')} /> : null}
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
      {title ? <SectionTitle title={t('My work')} /> : null}
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
            return <WorkCard key={k} title={t('Waiting for your approval')} icon="checkbox-outline" tone="warning" count={count(k)} amount={null} rows={rows} route={route} web={null} openWeb={openWeb} />;
          }
          const meta = CARDS[k];
          const card = data[k] as MyWorkCard;
          const rows: Row[] = card.items.slice(0, 3).map((i, n) => ({
            key: `${i.href}-${n}`,
            label: i.label,
            // The API's notes are English; the fixed ones have Hindi, the rest show as they come.
            note: [t(i.note), i.projectName].filter(Boolean).join(' · '),
            right: rupeesCompact(i.amount),
            route: phoneRoute(i.href) ?? (k === 'sentBack' || k === 'waitingWithOthers' ? meta.route : null),
            web: i.href,
          }));
          return <WorkCard key={k} title={t(meta.title)} icon={meta.icon} tone={meta.tone} count={card.count} amount={card.amount} rows={rows} route={meta.route} web={card.href ?? meta.web} openWeb={openWeb} />;
        })
      )}
    </>
  );
}

function WorkCard({ title, icon, tone, count, amount, rows, route, web, openWeb }: { title: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone; count: number; amount: string | null; rows: Row[]; route: string | null; web: string | null; openWeb: (href: string) => void }) {
  const router = useRouter();
  const t = useT();
  const c = TONES[tone];
  // The phone's screen when it has one, else the page on the web (requests to order, material to check, debit notes…).
  const go = (to: string | null, href?: string | null) => (to ? () => router.push(to as Href) : href ? () => openWeb(href) : undefined);
  const total = rupeesCompact(amount);
  const rest = count - rows.length;
  return (
    <Card style={styles.card}>
      <Touchable onPress={go(route, web)} disabled={!route && !web} accessibilityRole={route || web ? 'link' : 'summary'} accessibilityHint={!route && web ? t('Opens on the web') : undefined} accessibilityLabel={t('{title}: {n}', { title, n: count })} style={styles.head}>
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
      </Touchable>
      {rows.map((r) => (
        <Touchable key={r.key} onPress={go(r.route, r.web)} disabled={!r.route && !r.web} accessibilityRole={r.route || r.web ? 'link' : 'text'} accessibilityHint={!r.route && r.web ? t('Opens on the web') : undefined} style={styles.item}>
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
          {r.route ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : r.web ? <Ionicons name="open-outline" size={16} color={colors.textMuted} /> : null}
        </Touchable>
      ))}
      {rest > 0 && rows.length > 0 && (route || web) ? (
        <Touchable onPress={go(route, web)} accessibilityRole="link" style={styles.moreBtn}>
          <Text style={styles.more}>{t('{n} more', { n: rest })}</Text>
        </Touchable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { paddingVertical: spacing.md },
  clear: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touch.min },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, minHeight: touch.min },
  right: { ...typography.caption, color: colors.text, fontWeight: '600' },
  moreBtn: { minHeight: touch.min, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: spacing.lg },
  more: { ...typography.caption, fontSize: fontSize.secondary, color: colors.primary, fontWeight: '600' },
});
