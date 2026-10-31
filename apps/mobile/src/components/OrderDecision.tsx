import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComparativeStatementDto, ProjectBudgetDto, PurchaseOrderDto, QuotationDto } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { useT } from '../i18n/LanguageContext';
import { colors, fontSize, maxFontScale, spacing, typography } from '../theme';
import { formatMoney } from '../utils/format';
import { Card } from './Card';
import { Pill } from './StatusBadge';
import { ProgressBar } from './ProgressBar';

/**
 * What an approver needs to decide a purchase order on the phone, the same two sections as the web record
 * (OrderDecision.tsx there): the request's quotations side by side and where
 * the order takes the material budget. Both read what the request and the project already hold.
 */

/** The complete quotation with the lowest total: the one the order is judged against. */
function lowestComplete(cs: ComparativeStatementDto): QuotationDto | null {
  const complete = cs.quotations.filter((q) => q.missingLines === 0);
  return complete.length ? complete.reduce((a, b) => (Number(b.total) < Number(a.total) ? b : a)) : null;
}

export function OrderQuotes({ order }: { order: PurchaseOrderDto }) {
  const t = useT();
  const { data, loading, error } = useFetch<ComparativeStatementDto>((api) => api.get(`/material-requests/${order.materialRequestId}/comparative`), [order.materialRequestId], {
    enabled: !!order.materialRequestId,
  });
  if (!order.materialRequestId || error) return null;
  const quotes = data?.quotations ?? [];
  const lowest = data ? lowestComplete(data) : null;

  return (
    <Card title={t('Quotations on the request')}>
      {loading && !data ? <Text style={typography.caption}>{t('Reading the quotations…')}</Text> : null}
      {data && !quotes.length ? <Text style={typography.caption}>{t('No quotation was recorded on this request.')}</Text> : null}
      {quotes.map((q) => {
        const notes = [
          q.deliveryDays !== null ? t('Delivers in {n} days', { n: q.deliveryDays }) : t('Delivery not said'),
          q.missingLines ? t('{n} items not quoted', { n: q.missingLines }) : null,
          Number(q.freight) > 0 ? t('freight {amount}', { amount: formatMoney(q.freight) }) : null,
        ].filter(Boolean);
        return (
          <View key={q.id} style={styles.row}>
            <View style={styles.grow}>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.vendor}>
                {q.vendorName}
              </Text>
              {q.id === lowest?.id || q.id === order.quotationId ? (
                <View style={styles.pills}>
                  {q.id === lowest?.id ? <Pill text={t('Lowest')} fg={colors.success} bg={colors.successSoft} /> : null}
                  {q.id === order.quotationId ? <Pill text={t('This order')} fg={colors.primary} bg={colors.primarySoft} /> : null}
                </View>
              ) : null}
              <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
                {notes.join(' · ')}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.amount}>
              {formatMoney(q.total)}
            </Text>
          </View>
        );
      })}
      {lowest && order.quotationId && order.quotationId !== lowest.id ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={[typography.caption, styles.note]}>
          {t('The lowest complete quotation is {vendor} at {amount}. Why this order goes elsewhere is above, under Why this vendor.', {
            vendor: lowest.vendorName,
            amount: formatMoney(lowest.total),
          })}
        </Text>
      ) : null}
    </Card>
  );
}

/** The project's material budget, what it has cost so far, and where this order takes it. Shown to cost viewers only. */
export function OrderBudget({ order }: { order: PurchaseOrderDto }) {
  const t = useT();
  const { data, loading, error } = useFetch<ProjectBudgetDto>((api) => api.get(`/cost/projects/${order.projectId}/budget`), [order.projectId]);
  if (error) return null;
  const material = data?.heads.find((h) => h.head === 'material');

  let body: React.ReactNode;
  if (loading && !data) body = <Text style={typography.caption}>{t('Reading the budget…')}</Text>;
  else if (!material || material.budget === null)
    body = <Text style={typography.caption}>{t('No material budget is set for this project, so there is nothing to hold this order against.')}</Text>;
  else {
    const budget = Number(material.budget);
    const spent = Number(material.actual);
    const after = spent + Number(order.total);
    const pct = budget > 0 ? Math.round((after / budget) * 100) : 0;
    const over = after > budget;
    body = (
      <>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.text}>
          {t('Material budget {budget}, of which {spent} has been spent. This order of {order} takes it to {after}, {pct}% of the budget.', {
            budget: formatMoney(budget, { paise: false }),
            spent: formatMoney(spent, { paise: false }),
            order: formatMoney(order.total),
            after: formatMoney(after, { paise: false }),
            pct,
          })}
        </Text>
        <View style={styles.bar} accessible accessibilityLabel={t('Material budget used after this order, {pct}%', { pct })}>
          <ProgressBar value={pct} color={over ? colors.danger : colors.primary} />
        </View>
        {over ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={[styles.text, styles.over]}>
            {t('It would go {amount} past the material budget. Check it against the budget before approving.', { amount: formatMoney(after - budget, { paise: false }) })}
          </Text>
        ) : null}
      </>
    );
  }
  return <Card title={t('Against the budget')}>{body}</Card>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  grow: { flex: 1 },
  vendor: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xs },
  amount: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, marginLeft: spacing.md, fontVariant: ['tabular-nums'] },
  note: { marginTop: spacing.sm },
  text: { fontSize: fontSize.body, color: colors.text },
  bar: { marginVertical: spacing.sm },
  over: { color: colors.danger, fontWeight: '600' },
});
