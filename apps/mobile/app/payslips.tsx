import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PAYSLIP_CODES, type PayslipDto, type PayslipLineDto } from '@erp/shared';
import { useFetch } from '../src/api/hooks';
import { Card, Divider, EmptyState, ErrorBanner, KeyValue, Loading, Screen, SectionTitle, Touchable } from '../src/components';
import { colors, maxFontScale, spacing, touch, typography } from '../src/theme';
import { formatMoney, formatMonth } from '../src/utils/format';
import { useT } from '../src/i18n/LanguageContext';

/**
 * The signed-in person's payslips (v6 item 100), once HR's month is approved: net pay first, then the days paid and each
 * earning and deduction. Needs a connection.
 */
export default function PayslipsScreen() {
  const t = useT();
  const list = useFetch<PayslipDto[]>((a) => a.get('/payroll/my-payslips'), []);
  const [open, setOpen] = useState<string | null>(null);
  const first = list.data?.[0]?.id ?? null;
  const shown = open ?? first;
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <ErrorBanner message={list.error} />
      {list.loading && !list.data ? <Loading /> : null}
      {list.data && !list.data.length ? <EmptyState title={t('No payslips yet')} subtitle={t("Each month's payslip shows here once the salary is approved.")} icon="wallet-outline" /> : null}
      {list.data?.map((p) => <Payslip key={p.id} slip={p} expanded={p.id === shown} onToggle={() => setOpen(p.id === shown ? '' : p.id)} />)}
    </Screen>
  );
}

function Payslip({ slip: p, expanded, onToggle }: { slip: PayslipDto; expanded: boolean; onToggle: () => void }) {
  const t = useT();
  // A line HR added by hand keeps the name HR gave it; the rest are named in the app's language.
  const name = (l: PayslipLineDto) => (l.manual || !(l.code in PAYSLIP_CODES) ? l.label : t(PAYSLIP_CODES[l.code as keyof typeof PAYSLIP_CODES].label));
  const lines = (kind: PayslipLineDto['kind']) => p.lines.filter((l) => l.kind === kind);
  return (
    <Card style={styles.card}>
      <Touchable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={t('Payslip for {month}, net pay {amount}', { month: formatMonth(p.month), amount: formatMoney(p.net) })} style={styles.head}>
        <View style={styles.headText}>
          <Text style={typography.h3} maxFontSizeMultiplier={maxFontScale}>
            {formatMonth(p.month)}
          </Text>
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('{paid} of {days} days paid', { paid: p.paidDays, days: p.monthDays })}
          </Text>
        </View>
        <View style={styles.net}>
          <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
            {t('Net pay')}
          </Text>
          <Text style={typography.h2} maxFontSizeMultiplier={maxFontScale}>
            {formatMoney(p.net)}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Touchable>
      {expanded ? (
        <View style={styles.body}>
          {Number(p.lopDays) ? <KeyValue label={t('Loss of pay')} value={t('{n} days', { n: p.lopDays })} /> : null}
          {Number(p.overtimeHours) ? <KeyValue label={t('Overtime')} value={t('{n} hours', { n: p.overtimeHours })} /> : null}
          <SectionTitle title={t('Earnings')} />
          {lines('EARNING').map((l) => (
            <KeyValue key={l.id} label={name(l)} value={formatMoney(l.amount)} />
          ))}
          <KeyValue label={t('Gross')} value={<Text style={typography.bodyStrong}>{formatMoney(p.gross)}</Text>} />
          <Divider />
          <SectionTitle title={t('Deductions')} />
          {lines('DEDUCTION').length ? lines('DEDUCTION').map((l) => <KeyValue key={l.id} label={name(l)} value={formatMoney(l.amount)} />) : <Text style={typography.caption}>{t('None')}</Text>}
          <KeyValue label={t('Total deductions')} value={<Text style={typography.bodyStrong}>{formatMoney(p.deductions)}</Text>} />
          {lines('EMPLOYER').length ? (
            <>
              <Divider />
              <SectionTitle title={t('The company pays besides')} />
              {lines('EMPLOYER').map((l) => (
                <KeyValue key={l.id} label={name(l)} value={formatMoney(l.amount)} />
              ))}
            </>
          ) : null}
          {p.uan ? <KeyValue label="UAN" value={p.uan} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.min },
  headText: { flex: 1, gap: 2 },
  net: { alignItems: 'flex-end' },
  body: { marginTop: spacing.sm, gap: spacing.xs },
});
