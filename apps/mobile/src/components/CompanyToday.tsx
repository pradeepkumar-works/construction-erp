import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SUBMISSION_TYPE_LABELS, canRecordAttendance, mayApprove, type CompanyTodayDto, type RoleKey } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { phoneRoute } from '../ai/links';
import { colors, radius, spacing, touch, typography } from '../theme';
import { fmtQty, formatDate, formatMoneyCompact } from '../utils/format';
import { useT } from '../i18n/LanguageContext';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { SectionTitle } from './Layout';
import { Skeleton } from './Skeleton';
import { Touchable } from './Touchable';

type TileKey = Exclude<keyof CompanyTodayDto, 'date' | 'yesterday'>;
type Tone = 'normal' | 'warning' | 'error';

/** What each role leads with; a tile the API leaves out (the role may not see its module) is skipped. */
const ORDERS: Record<'director' | 'accounts' | 'manager', TileKey[]> = {
  director: ['approvals', 'payments', 'receipts', 'receivables', 'payables', 'purchase', 'attendance', 'fuel', 'waitingWithOthers'],
  accounts: ['payables', 'payments', 'receipts', 'receivables', 'approvals', 'purchase', 'attendance', 'waitingWithOthers'],
  manager: ['approvals', 'attendance', 'fuel', 'purchase', 'payables', 'receivables', 'payments', 'receipts', 'waitingWithOthers'],
};
const orderFor = (role: RoleKey) => (role === 'ACCOUNTS_MANAGER' ? ORDERS.accounts : role === 'PROJECT_MANAGER' ? ORDERS.manager : ORDERS.director);

const ICONS: Record<TileKey, keyof typeof Ionicons.glyphMap> = {
  payments: 'arrow-up-circle-outline',
  receipts: 'arrow-down-circle-outline',
  receivables: 'wallet-outline',
  payables: 'card-outline',
  attendance: 'people-outline',
  fuel: 'water-outline',
  purchase: 'cart-outline',
  approvals: 'checkbox-outline',
  waitingWithOthers: 'hourglass-outline',
};

interface Row {
  key: string;
  label: string;
  note?: string;
  right?: string | null;
  tone?: Tone;
  route: string | null;
}

interface Tile {
  key: TileKey;
  title: string;
  value: string;
  sub: string;
  tone: Tone;
  /** The sheet's figures above its list */
  summary: string[];
  rows: Row[];
  empty: string;
  /** The phone screen with the whole list, where there is one */
  open: { label: string; route: string } | null;
}

const money = (v: string | null | undefined) => formatMoneyCompact(v) ?? '₹0';
const late = (days: number) => (days > 0 ? 'error' : days === 0 ? 'warning' : 'normal');

/**
 * The company's day at the top of Home for owners, directors, accounts and project managers (v5 item 96), from
 * `GET /dashboard/company-today` (kept for offline). A tile opens its list in a sheet; a row opens its record where the
 * phone has a screen for it.
 */
export function CompanyTodayPanel({ data, loading }: { data: CompanyTodayDto | null; loading: boolean }) {
  const { user } = useAuth();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<TileKey | null>(null);
  if (loading && !data) {
    return (
      <>
        <SectionTitle title={t('Company today')} />
        <Skeleton variant="card" rows={3} label={t('Loading…')} />
      </>
    );
  }
  if (!data || !user) return null;
  const days = (n: number) => t(n === 1 ? '{n} day' : '{n} days', { n });

  const build = (k: TileKey): Tile | null => {
    switch (k) {
      case 'payments':
      case 'receipts': {
        const c = data[k];
        if (!c) return null;
        return {
          key: k,
          title: t(k === 'payments' ? 'Paid today' : 'Received today'),
          value: money(c.today),
          sub: t('Yesterday {amount}', { amount: money(c.yesterday) }),
          tone: 'normal',
          summary: [t(k === 'payments' ? (c.countToday === 1 ? '{n} payment today' : '{n} payments today') : c.countToday === 1 ? '{n} receipt today' : '{n} receipts today', { n: c.countToday }), t('Yesterday {amount}', { amount: money(c.yesterday) })],
          rows: c.rows.map((r, i) => ({ key: `${k}-${i}`, label: r.party, note: [r.reference, r.projectName].filter(Boolean).join(' · '), right: money(r.amount), route: r.href ? phoneRoute(r.href) : null })),
          empty: t(k === 'payments' ? 'No payments made today.' : 'No money received today.'),
          open: null,
        };
      }
      case 'receivables':
      case 'payables': {
        const d = data[k];
        if (!d) return null;
        const overdue = Number(d.overdue) > 0;
        return {
          key: k,
          title: t(k === 'receivables' ? 'To collect' : 'To pay'),
          value: money(d.outstanding),
          sub: overdue ? t('{amount} overdue', { amount: money(d.overdue) }) : t('Nothing overdue'),
          tone: overdue ? 'error' : 'normal',
          summary: [t('Outstanding {amount}', { amount: money(d.outstanding) }), overdue ? t(d.overdueCount === 1 ? '{n} bill overdue, {amount}' : '{n} bills overdue, {amount}', { n: d.overdueCount, amount: money(d.overdue) }) : t('Nothing overdue')],
          rows: d.rows.map((r, i) => ({
            key: `${k}-${i}`,
            label: r.label,
            note: [r.daysOverdue > 0 ? t('{days} overdue', { days: days(r.daysOverdue) }) : r.daysOverdue === 0 ? t('Due today') : t('Due in {days}', { days: days(-r.daysOverdue) }), r.projectName].join(' · '),
            right: money(r.outstanding),
            tone: late(r.daysOverdue),
            route: r.href ? phoneRoute(r.href) : null,
          })),
          empty: t(k === 'receivables' ? 'No bills waiting for the client to pay.' : 'No bills waiting to be paid.'),
          open: null,
        };
      }
      case 'attendance': {
        const a = data.attendance;
        if (!a) return null;
        return {
          key: k,
          title: t('Attendance today'),
          value: t('{n} of {total} staff', { n: a.staffPresent, total: a.staffTotal }),
          sub: t('{n} labour · {r} of {s} sites', { n: a.labour, r: a.sitesReported, s: a.sites }),
          tone: a.sitesReported < a.sites ? 'warning' : 'normal',
          summary: [t('{n} of {total} staff present, {a} absent', { n: a.staffPresent, total: a.staffTotal, a: a.staffAbsent }), t('{n} labour on site', { n: a.labour })],
          rows: a.rows.map((r) => ({
            key: r.projectId,
            label: r.projectName,
            note: r.reported ? t('{s} staff · {n} labour', { s: r.staffPresent, n: r.labour }) : t('No attendance yet'),
            tone: r.reported ? 'normal' : 'warning',
            route: `/project/${r.projectId}`,
          })),
          empty: t('No active sites.'),
          open: canRecordAttendance(user.roleKey) ? { label: t('Record attendance'), route: '/attendance' } : null,
        };
      }
      case 'fuel': {
        const f = data.fuel;
        if (!f) return null;
        const first = f.items[0];
        const low = f.items.reduce((n, i) => n + i.sitesBelowMin, 0);
        return {
          key: k,
          title: first ? t('{item} today', { item: first.itemName }) : t('Fuel today'),
          value: first ? `${fmtQty(first.issued)} ${first.unit}` : '—',
          sub: first ? t('Closing {qty}', { qty: `${fmtQty(first.closing)} ${first.unit}` }) : t('No fuel items'),
          tone: low > 0 ? 'warning' : 'normal',
          summary: [
            ...f.items.map((i) => t('{item}: {issued} issued, {closing} closing', { item: i.itemName, issued: `${fmtQty(i.issued)} ${i.unit}`, closing: `${fmtQty(i.closing)} ${i.unit}` })),
            ...(low > 0 ? [t(low === 1 ? '{n} site below its minimum' : '{n} sites below their minimum', { n: low })] : []),
          ],
          rows: f.rows.map((r) => ({
            key: `${r.projectId}-${r.itemName}`,
            label: r.projectName,
            note: t('{item}: {issued} issued', { item: r.itemName, issued: `${fmtQty(r.issued)} ${r.unit}` }),
            right: `${fmtQty(r.closing)} ${r.unit}`,
            tone: r.belowMin ? 'error' : 'normal',
            route: null,
          })),
          empty: t('No fuel in stock at your sites.'),
          open: { label: t('Fuel issue'), route: '/stock/fuel' },
        };
      }
      case 'purchase': {
        const p = data.purchase;
        if (!p) return null;
        return {
          key: k,
          title: t('Orders to come'),
          value: String(p.ordersOpen),
          sub: [money(p.ordersOpenValue), p.ordersLate ? t('{n} late', { n: p.ordersLate }) : null, p.requestsToOrder ? t('{n} to order', { n: p.requestsToOrder }) : null].filter(Boolean).join(' · '),
          tone: p.ordersLate > 0 ? 'error' : 'normal',
          summary: [
            t(p.ordersOpen === 1 ? '{n} order to come, {amount}' : '{n} orders to come, {amount}', { n: p.ordersOpen, amount: money(p.ordersOpenValue) }),
            t(p.requestsToOrder === 1 ? '{n} request still to order' : '{n} requests still to order', { n: p.requestsToOrder }),
            t('{n} GRNs today · {c} awaiting QA/QC', { n: p.grnsToday, c: p.grnsAwaitingCheck }),
          ],
          rows: p.rows.map((r, i) => ({
            key: `${r.kind}-${i}`,
            label: r.label,
            note: [r.kind === 'ORDER' ? t('{days} late', { days: days(r.daysLate) }) : r.daysLate > 0 ? t('Needed {days} ago', { days: days(r.daysLate) }) : t('To order'), r.projectName].join(' · '),
            right: r.amount ? money(r.amount) : null,
            tone: r.daysLate > 0 ? 'error' : 'normal',
            route: phoneRoute(r.href),
          })),
          empty: t('Nothing late and nothing waiting to be ordered.'),
          open: null,
        };
      }
      case 'approvals': {
        const a = data.approvals;
        if (!a) return null;
        return {
          key: k,
          title: t('Waiting for approval'),
          value: String(a.total),
          sub: a.total ? [a.amount ? money(a.amount) : null, a.oldestDays ? t('oldest {days}', { days: days(a.oldestDays) }) : null].filter(Boolean).join(' · ') || t('Since today') : t('Nothing waiting'),
          tone: (a.oldestDays ?? 0) > 2 ? 'warning' : 'normal',
          summary: [t(a.total === 1 ? '{n} entry waiting in your projects' : '{n} entries waiting in your projects', { n: a.total })],
          rows: a.modules.map((m) => ({
            key: m.type,
            label: t(SUBMISSION_TYPE_LABELS[m.type]),
            note: m.oldestDays ? t('oldest {days}', { days: days(m.oldestDays) }) : t('Since today'),
            right: [String(m.count), m.amount ? money(m.amount) : null].filter(Boolean).join(' · '),
            tone: m.oldestDays > 2 ? 'warning' : 'normal',
            route: null,
          })),
          empty: t('Nothing waits for approval.'),
          open: mayApprove(user) ? { label: t('Open approvals'), route: '/approvals' } : null,
        };
      }
      case 'waitingWithOthers': {
        const w = data.waitingWithOthers;
        if (!w) return null;
        return {
          key: k,
          title: t('Waiting with others'),
          value: String(w.count),
          sub: w.count ? [w.amount ? money(w.amount) : null, w.oldestDays ? t('oldest {days}', { days: days(w.oldestDays) }) : null].filter(Boolean).join(' · ') || t('Since today') : t('Nothing waiting'),
          tone: (w.oldestDays ?? 0) > 2 ? 'warning' : 'normal',
          summary: [t('Your entries waiting for someone else to approve.')],
          rows: [],
          empty: '',
          open: { label: t('My entries'), route: '/submissions' },
        };
      }
    }
  };

  const tiles = orderFor(user.roleKey)
    .map(build)
    .filter((x): x is Tile => x !== null);
  if (!tiles.length) return null;
  const picked = tiles.find((x) => x.key === open) ?? null;
  const go = (route: string) => {
    setOpen(null);
    router.push(route as Href);
  };

  return (
    <>
      <SectionTitle title={t('Company today')} right={<Text style={typography.caption}>{formatDate(data.date)}</Text>} />
      <View style={styles.grid}>
        {tiles.map((x) => (
          <Touchable
            key={x.key}
            onPress={() => setOpen(x.key)}
            accessibilityRole="button"
            accessibilityLabel={`${x.title}: ${x.value}, ${x.sub}`}
            style={styles.tile}
          >
            <View style={styles.tileHead}>
              <Ionicons name={ICONS[x.key]} size={18} color={TONE[x.tone]} />
              <Text style={styles.tileTitle} numberOfLines={2}>
                {x.title}
              </Text>
            </View>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {x.value}
            </Text>
            <Text style={[styles.sub, x.tone !== 'normal' && { color: TONE[x.tone] }]} numberOfLines={2}>
              {x.sub}
            </Text>
          </Touchable>
        ))}
      </View>

      <BottomSheet visible={!!picked} onClose={() => setOpen(null)} title={picked?.title} subtitle={picked ? formatDate(data.date) : undefined}>
        {picked ? (
          <>
            {picked.summary.map((s) => (
              <Text key={s} style={[typography.body, styles.summary]}>
                {s}
              </Text>
            ))}
            {picked.rows.length ? (
              <ScrollView style={styles.list}>
                {picked.rows.map((r) => (
                  <Touchable key={r.key} onPress={r.route ? () => go(r.route!) : undefined} disabled={!r.route} accessibilityRole={r.route ? 'link' : 'text'} style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={typography.body} numberOfLines={2}>
                        {r.label}
                      </Text>
                      {r.note ? (
                        <Text style={[typography.caption, r.tone && r.tone !== 'normal' ? { color: TONE[r.tone] } : null]} numberOfLines={2}>
                          {r.note}
                        </Text>
                      ) : null}
                    </View>
                    {r.right ? <Text style={styles.right}>{r.right}</Text> : null}
                    {r.route ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
                  </Touchable>
                ))}
              </ScrollView>
            ) : picked.empty ? (
              <Text style={[typography.caption, styles.summary]}>{picked.empty}</Text>
            ) : null}
            {picked.open ? <Button title={picked.open.label} variant="secondary" onPress={() => go(picked.open!.route)} style={styles.openBtn} /> : null}
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const TONE: Record<Tone, string> = { normal: colors.primary, warning: colors.warning, error: colors.danger };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 112,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 20 },
  tileTitle: { ...typography.caption, flex: 1, fontWeight: '600' },
  value: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  sub: { ...typography.caption, marginTop: 2 },
  summary: { marginBottom: spacing.xs },
  list: { maxHeight: 360, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, minHeight: touch.min },
  right: { ...typography.caption, color: colors.text, fontWeight: '600' },
  openBtn: { marginTop: spacing.md },
});
