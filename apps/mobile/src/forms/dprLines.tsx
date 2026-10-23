import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  MANPOWER_CATEGORIES,
  componentLabel,
  crewCheck,
  dprActivityLabel,
  suggestMaterials,
  type DprLineDto,
  type DprLineInput,
  type DprWorkOptionsDto,
  type ManpowerLine,
} from '@erp/shared';
import { Button, IconButton, Input, Select } from '../components';
import { useT } from '../i18n/LanguageContext';
import { colors, fontSize, maxFontScale, radius, spacing, touch, typography } from '../theme';

/** A DPR work line (item 127) as the phone's form holds it. */
export interface DprLineRow {
  key: string;
  /** The line's progress entry: kept on an edit, a new uuid for a new line */
  id: string;
  activityId: string | null;
  quantity: string;
  location: string;
  crew: { key: string; category: string | null; count: string }[];
  materials: { key: string; itemId: string | null; quantity: string }[];
  /** Changed by hand, so the norms no longer fill it */
  materialsEdited: boolean;
}

const newKey = () => Math.random().toString(36).slice(2, 9);
const qty = (n: string | number) => String(Number(Number(n).toFixed(3)));

export const newLineRow = (id: string, over: Partial<DprLineRow> = {}): DprLineRow => ({
  key: newKey(),
  id,
  activityId: null,
  quantity: '',
  location: '',
  crew: [],
  materials: [],
  materialsEdited: false,
  ...over,
});

/** A saved or queued line back into the form. */
export const lineRowFrom = (l: DprLineDto | DprLineInput, id: string): DprLineRow =>
  newLineRow(l.id ?? id, {
    activityId: l.activityId,
    quantity: l.quantity ? qty(l.quantity) : '',
    location: l.location ?? '',
    crew: (l.labour ?? []).map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })),
    materials: (l.materials ?? []).map((m) => ({ key: newKey(), itemId: m.itemId, quantity: qty(m.quantity) })),
    materialsEdited: true,
  });

/** Yesterday's line as a start for today: the same work, place and crew; today's quantity and material to fill. */
export const copiedRow = (l: DprLineDto, id: string): DprLineRow =>
  newLineRow(id, { activityId: l.activityId, location: l.location ?? '', crew: l.labour.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })) });

/** The lines as the API takes them. */
export const linesPayload = (rows: DprLineRow[]): DprLineInput[] =>
  rows
    .filter((r) => r.activityId)
    .map((r) => ({
      id: r.id,
      activityId: r.activityId!,
      quantity: r.quantity.trim(),
      location: r.location.trim() || null,
      labour: r.crew.filter((c) => c.category && /^\d+$/.test(c.count.trim()) && Number(c.count) > 0).map((c) => ({ category: c.category!, count: Number(c.count) })),
      materials: r.materials.filter((m) => m.itemId && Number(m.quantity) > 0).map((m) => ({ itemId: m.itemId!, quantity: m.quantity.trim() })),
    }));

/** Why the lines cannot be sent, in words that say what to do; null when they can. */
export function linesProblem(rows: DprLineRow[], t: ReturnType<typeof useT>): string | null {
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (!r.activityId) {
      if (r.quantity.trim() || r.location.trim() || r.crew.length || r.materials.length) return t('Line {n}: choose the activity', { n });
      continue;
    }
    const q = Number(r.quantity);
    if (!r.quantity.trim() || Number.isNaN(q)) return t('Line {n}: enter the quantity done today', { n });
    if (q <= 0) return t('Line {n}: the quantity must be more than 0', { n });
    if (r.crew.some((c) => c.count.trim() && !/^\d+$/.test(c.count.trim()))) return t('Line {n}: enter the crew as whole numbers', { n });
    if (r.materials.some((m) => m.quantity.trim() && Number.isNaN(Number(m.quantity)))) return t('Line {n}: enter material used as a number', { n });
  }
  return null;
}

/**
 * The DPR's work done, line by line (item 127): the activity or sub-activity, where, how much today, the crew and the
 * material used (filled from the norms until changed). Activities planned this week come first in the picker.
 */
export function DprLinesEditor({
  rows,
  onChange,
  options,
  headCount,
  newId,
  error,
}: {
  rows: DprLineRow[];
  onChange: (rows: DprLineRow[]) => void;
  options: DprWorkOptionsDto | null;
  headCount: ManpowerLine[];
  newId: () => string;
  error?: string | null;
}) {
  const t = useT();
  const byId = useMemo(() => new Map((options?.activities ?? []).map((a) => [a.id, a])), [options]);
  const activityOptions = useMemo(
    () =>
      (options?.activities ?? []).map((a) => ({
        value: a.id,
        label: dprActivityLabel(a),
        hint: `${a.lookAhead ? `${t('Planned this week')} · ` : ''}${componentLabel(a) === 'Outside the breakdown' ? t('Outside the breakdown') : componentLabel(a)} · ${t('{done} of {planned} {unit} done', { done: qty(a.doneQty), planned: qty(a.plannedQty), unit: a.unit })}`,
      })),
    [options, t],
  );
  const itemOptions = useMemo(() => (options?.items ?? []).map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` })), [options]);
  const categoryOptions = useMemo(() => MANPOWER_CATEGORIES.map((c) => ({ value: c, label: t(c) })), [t]);
  const check = crewCheck(
    rows.map((r) => ({ labour: r.crew.filter((c) => c.category && Number(c.count) > 0).map((c) => ({ category: c.category!, count: Number(c.count) })) })),
    headCount,
  );

  const update = (key: string, patch: Partial<DprLineRow>) =>
    onChange(
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Material follows the norms for the activity and quantity until it is changed by hand.
        if (('activityId' in patch || 'quantity' in patch) && !next.materialsEdited) {
          const norms = byId.get(next.activityId ?? '')?.norms ?? [];
          next.materials = suggestMaterials(next.quantity, norms).map((m) => ({ key: newKey(), itemId: m.itemId, quantity: m.quantity }));
        }
        return next;
      }),
    );

  return (
    <View>
      {rows.map((r, i) => {
        const a = byId.get(r.activityId ?? '');
        const n = i + 1;
        return (
          <View key={r.key} style={styles.line}>
            <View style={styles.head}>
              <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
                {t('Line {n}', { n })}
              </Text>
              <IconButton icon="trash-outline" size={20} color={colors.danger} onPress={() => onChange(rows.filter((x) => x.key !== r.key))} accessibilityLabel={t('Remove line {n}', { n })} style={styles.remove} />
            </View>
            <Select
              label={t('Activity')}
              required
              value={r.activityId}
              options={activityOptions}
              onChange={(v) => update(r.key, { activityId: v })}
              placeholder={options ? t('Choose activity') : t('Loading activities…')}
              disabled={!options}
              searchable
              emptyText={t('No activities in this project')}
            />
            {a?.holdPoint ? <Text style={styles.hold}>{t('Hold point: approved after a passed inspection here')}</Text> : null}
            <View style={styles.row}>
              <Input
                label={a ? t('Today ({unit})', { unit: a.unit }) : t('Today')}
                required
                value={r.quantity}
                onChangeText={(v) => update(r.key, { quantity: v })}
                keyboardType="decimal-pad"
                containerStyle={styles.qty}
              />
              <Input label={t('Where')} value={r.location} onChangeText={(v) => update(r.key, { location: v })} placeholder={t('e.g. Lift 4, J-12 to J-13')} containerStyle={styles.grow} />
            </View>

            <Text style={typography.label}>{t('Crew')}</Text>
            {r.crew.map((c) => (
              <View key={c.key} style={styles.row}>
                <View style={styles.grow}>
                  <Select value={c.category} options={categoryOptions} onChange={(v) => update(r.key, { crew: r.crew.map((x) => (x.key === c.key ? { ...x, category: v } : x)) })} placeholder={t('Category')} />
                </View>
                <Input
                  value={c.count}
                  onChangeText={(v) => update(r.key, { crew: r.crew.map((x) => (x.key === c.key ? { ...x, count: v } : x)) })}
                  keyboardType="number-pad"
                  placeholder="Nos"
                  accessibilityLabel={c.category ? t('Number of {category}', { category: t(c.category) }) : t('Number of workers')}
                  containerStyle={styles.small}
                />
                <IconButton icon="close" size={20} color={colors.textMuted} onPress={() => update(r.key, { crew: r.crew.filter((x) => x.key !== c.key) })} accessibilityLabel={t('Remove row')} style={styles.remove} />
              </View>
            ))}
            <Button title={t('Add trade')} variant="ghost" size="sm" icon="add" onPress={() => update(r.key, { crew: [...r.crew, { key: newKey(), category: null, count: '' }] })} />

            <Text style={typography.label}>{t('Material used')}</Text>
            {a && !a.norms.length && !r.materials.length ? <Text style={styles.note}>{t('No norms for this activity; add what was used.')}</Text> : null}
            {r.materials.map((m) => {
              const unit = options?.items.find((x) => x.id === m.itemId)?.unit;
              return (
                <View key={m.key} style={styles.row}>
                  <View style={styles.grow}>
                    <Select value={m.itemId} options={itemOptions} searchable onChange={(v) => update(r.key, { materialsEdited: true, materials: r.materials.map((x) => (x.key === m.key ? { ...x, itemId: v } : x)) })} placeholder={t('Item')} />
                  </View>
                  <Input
                    value={m.quantity}
                    onChangeText={(v) => update(r.key, { materialsEdited: true, materials: r.materials.map((x) => (x.key === m.key ? { ...x, quantity: v } : x)) })}
                    keyboardType="decimal-pad"
                    placeholder={unit ?? t('Qty')}
                    accessibilityLabel={t('Quantity used')}
                    containerStyle={styles.small}
                  />
                  <IconButton
                    icon="close"
                    size={20}
                    color={colors.textMuted}
                    onPress={() => update(r.key, { materialsEdited: true, materials: r.materials.filter((x) => x.key !== m.key) })}
                    accessibilityLabel={t('Remove row')}
                    style={styles.remove}
                  />
                </View>
              );
            })}
            <Button title={t('Add material')} variant="ghost" size="sm" icon="add" onPress={() => update(r.key, { materialsEdited: true, materials: [...r.materials, { key: newKey(), itemId: null, quantity: '' }] })} />
          </View>
        );
      })}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Button title={t('Add work line')} variant="ghost" icon="add" onPress={() => onChange([...rows, newLineRow(newId())])} />
      {rows.some((r) => r.activityId) && check.headCount !== null ? (
        <Text style={styles.note}>
          {check.difference === 0
            ? t('All {n} on site are on a work line', { n: check.headCount })
            : check.difference! > 0
              ? t('{on} of the {n} on site are on a work line; {off} on none', { on: check.onLines, n: check.headCount, off: check.difference! })
              : t('The work lines name {on} people, {more} more than the {n} on site', { on: check.onLines, more: -check.difference!, n: check.headCount })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch.height },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, marginBottom: spacing.sm },
  qty: { width: 128, marginBottom: spacing.sm },
  small: { width: 84, marginBottom: spacing.sm },
  remove: { height: touch.height },
  hold: { ...typography.caption, color: colors.warning, marginBottom: spacing.sm },
  note: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  err: { color: colors.danger, marginBottom: spacing.sm, fontSize: fontSize.secondary },
});
