import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  MANPOWER_CATEGORIES,
  PIPE_NODE_KIND_LABELS,
  PIPE_STAGE_LABELS,
  comparePipeCodes,
  componentLabel,
  crewCheck,
  dprActivityLabel,
  segmentLabel,
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
  /** The component and sub-component picked before the activity (keys from `componentKey` / `subKey`); the activity's own once one is chosen */
  componentPick: string | null;
  subPick: string | null;
  quantity: string;
  location: string;
  /** The pipe segment, or for a valve line the valve, the work was on (item 126) */
  pipeSegmentId: string | null;
  pipeNodeId: string | null;
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
  componentPick: null,
  subPick: null,
  quantity: '',
  location: '',
  pipeSegmentId: null,
  pipeNodeId: null,
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
    pipeSegmentId: l.pipeSegmentId ?? null,
    pipeNodeId: l.pipeNodeId ?? null,
    crew: (l.labour ?? []).map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })),
    materials: (l.materials ?? []).map((m) => ({ key: newKey(), itemId: m.itemId, quantity: qty(m.quantity) })),
    materialsEdited: true,
  });

/** Yesterday's line as a start for today: the same work, place and crew; today's quantity and material to fill. */
export const copiedRow = (l: DprLineDto, id: string): DprLineRow =>
  newLineRow(id, { activityId: l.activityId, location: l.location ?? '', pipeSegmentId: l.pipeSegmentId, crew: l.labour.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })) });

type ActivityOption = DprWorkOptionsDto['activities'][number];
/** An activity outside the breakdown, and one on the component itself rather than a sub-component */
const OUTSIDE = '~';
const WHOLE = '=';
const componentKey = (a: ActivityOption) => a.componentCode ?? OUTSIDE;
const subKey = (a: ActivityOption) => a.subComponentCode ?? WHOLE;
const byCode = (x: string, y: string) => Number(x === OUTSIDE) - Number(y === OUTSIDE) || x.localeCompare(y, undefined, { numeric: true });

/** The components the project's activities sit in, in code order, outside the breakdown last; empty with no breakdown. */
export function componentChoices(options: DprWorkOptionsDto | null) {
  const acts = options?.activities ?? [];
  if (!acts.some((a) => a.componentCode)) return [];
  const seen = new Map<string, { key: string; name: string | null; count: number }>();
  for (const a of acts) {
    const k = componentKey(a);
    const c = seen.get(k) ?? { key: k, name: a.componentName, count: 0 };
    c.count += 1;
    seen.set(k, c);
  }
  return [...seen.values()].sort((x, y) => byCode(x.key, y.key));
}

/** The sub-components of a component, and the component as a whole when activities sit on it directly; empty with none. */
export function subComponentChoices(options: DprWorkOptionsDto | null, component: string | null) {
  const acts = (options?.activities ?? []).filter((a) => component !== null && componentKey(a) === component);
  if (!acts.some((a) => a.subComponentCode)) return [];
  const seen = new Map<string, { key: string; name: string | null; count: number }>();
  for (const a of acts) {
    const k = subKey(a);
    const c = seen.get(k) ?? { key: k, name: a.subComponentName, count: 0 };
    c.count += 1;
    seen.set(k, c);
  }
  return [...seen.values()].sort((x, y) => Number(x.key === WHOLE) - Number(y.key === WHOLE) || x.key.localeCompare(y.key, undefined, { numeric: true }));
}

/** Where a line stands in the breakdown: the activity's own place once chosen, else what was picked. */
export function linePlace(row: DprLineRow, activity: ActivityOption | undefined) {
  return activity ? { component: componentKey(activity), sub: subKey(activity) } : { component: row.componentPick, sub: row.subPick };
}

/** The activities a line may take, narrowed by the component and sub-component picked. */
export function activitiesFor(options: DprWorkOptionsDto | null, component: string | null, sub: string | null): ActivityOption[] {
  return (options?.activities ?? []).filter((a) => (component === null || componentKey(a) === component) && (sub === null || subKey(a) === sub));
}

/** The lines as the API takes them. */
export const linesPayload = (rows: DprLineRow[]): DprLineInput[] =>
  rows
    .filter((r) => r.activityId)
    .map((r) => ({
      id: r.id,
      activityId: r.activityId!,
      quantity: r.quantity.trim(),
      location: r.location.trim() || null,
      pipeSegmentId: r.pipeSegmentId,
      pipeNodeId: r.pipeNodeId,
      labour: r.crew.filter((c) => c.category && /^\d+$/.test(c.count.trim()) && Number(c.count) > 0).map((c) => ({ category: c.category!, count: Number(c.count) })),
      materials: r.materials.filter((m) => m.itemId && Number(m.quantity) > 0).map((m) => ({ itemId: m.itemId!, quantity: m.quantity.trim() })),
    }));

/** Why the lines cannot be sent, in words that say what to do; null when they can. */
/** The segments or valves a line's activity may name: its zone's, when the activity is a stage of pipe work. */
export function pipeChoices(options: DprWorkOptionsDto | null, activityId: string | null) {
  const a = options?.activities.find((x) => x.id === activityId);
  if (!a?.pipeStage || !a.zoneId) return { stage: null, segments: [], valves: [] };
  const segments = a.pipeStage === 'VALVES' ? [] : (options?.segments ?? []).filter((s) => s.zoneId === a.zoneId).sort((x, y) => comparePipeCodes(x.code, y.code));
  const valves = a.pipeStage === 'VALVES' ? (options?.valves ?? []).filter((v) => v.zoneId === a.zoneId).sort((x, y) => comparePipeCodes(x.code, y.code)) : [];
  return { stage: a.pipeStage, segments, valves };
}

export function linesProblem(rows: DprLineRow[], t: ReturnType<typeof useT>, options: DprWorkOptionsDto | null = null): string | null {
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (!r.activityId) {
      if (r.quantity.trim() || r.location.trim() || r.crew.length || r.materials.length) return t('Line {n}: choose the activity', { n });
      continue;
    }
    const q = Number(r.quantity);
    if (!r.quantity.trim() || Number.isNaN(q)) return t('Line {n}: enter the quantity done today', { n });
    if (q <= 0) return t('Line {n}: the quantity must be more than 0', { n });
    const pipe = pipeChoices(options, r.activityId);
    if (pipe.segments.length && !r.pipeSegmentId) return t('Line {n}: choose the pipe segment the work was on', { n });
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
  const components = useMemo(() => componentChoices(options), [options]);
  const componentOptions = useMemo(
    () =>
      components.map((c) => ({
        value: c.key,
        label: c.key === OUTSIDE ? t('Outside the breakdown') : `${c.key} ${c.name ?? ''}`.trim(),
        hint: c.count === 1 ? t('1 activity') : t('{n} activities', { n: c.count }),
      })),
    [components, t],
  );
  const activityOptions = (component: string | null, sub: string | null) =>
    activitiesFor(options, component, sub).map((a) => ({
      value: a.id,
      label: dprActivityLabel(a),
      hint: `${a.lookAhead ? `${t('Planned this week')} · ` : ''}${component === null ? `${componentLabel(a) === 'Outside the breakdown' ? t('Outside the breakdown') : componentLabel(a)} · ` : ''}${t('{done} of {planned} {unit} done', { done: qty(a.doneQty), planned: qty(a.plannedQty), unit: a.unit })}`,
    }));
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
        // A new activity lets go of a pipe or valve outside its zone.
        if ('activityId' in patch) {
          const pipe = pipeChoices(options, next.activityId);
          if (next.pipeSegmentId && !pipe.segments.some((s) => s.id === next.pipeSegmentId)) next.pipeSegmentId = null;
          if (next.pipeNodeId && !pipe.valves.some((v) => v.id === next.pipeNodeId)) next.pipeNodeId = null;
        }
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
        const pipe = pipeChoices(options, r.activityId);
        const place = linePlace(r, a);
        const subs = subComponentChoices(options, place.component);
        return (
          <View key={r.key} style={styles.line}>
            <View style={styles.head}>
              <Text style={typography.bodyStrong} maxFontSizeMultiplier={maxFontScale}>
                {t('Line {n}', { n })}
              </Text>
              <IconButton icon="trash-outline" size={20} color={colors.danger} onPress={() => onChange(rows.filter((x) => x.key !== r.key))} accessibilityLabel={t('Remove line {n}', { n })} style={styles.remove} />
            </View>
            {components.length ? (
              <Select
                label={t('Component')}
                value={place.component}
                options={componentOptions}
                searchable
                onChange={(v) => update(r.key, { componentPick: v, subPick: null, ...(a && componentKey(a) !== v ? { activityId: null } : {}) })}
                placeholder={t('Choose the component')}
              />
            ) : null}
            {subs.length ? (
              <Select
                label={t('Sub-component')}
                value={place.sub}
                options={subs.map((c) => ({
                  value: c.key,
                  label: c.key === WHOLE ? t('The component as a whole') : `${c.key} ${c.name ?? ''}`.trim(),
                  hint: c.count === 1 ? t('1 activity') : t('{n} activities', { n: c.count }),
                }))}
                searchable
                onChange={(v) => update(r.key, { componentPick: place.component, subPick: v, ...(a && subKey(a) !== v ? { activityId: null } : {}) })}
                placeholder={t('Choose the sub-component')}
              />
            ) : null}
            <Select
              label={t('Activity')}
              required
              value={r.activityId}
              options={activityOptions(place.component, subs.length ? place.sub : null)}
              onChange={(v) => {
                const picked = byId.get(v);
                update(r.key, { activityId: v, componentPick: picked ? componentKey(picked) : r.componentPick, subPick: picked ? subKey(picked) : r.subPick });
              }}
              placeholder={options ? t('Choose activity') : t('Loading activities…')}
              disabled={!options}
              searchable
              emptyText={place.component === null ? t('No activities in this project') : t('No activities here take progress')}
            />
            {pipe.segments.length ? (
              <Select
                label={t('Pipe segment')}
                required
                value={r.pipeSegmentId}
                searchable
                options={pipe.segments.map((sg) => ({
                  value: sg.id,
                  label: segmentLabel(sg),
                  hint: t('{dia} mm · {held} of {length} m {stage}', { dia: sg.diameterMm, held: qty(sg.held[pipe.stage!] ?? 0), length: qty(sg.lengthM), stage: t(PIPE_STAGE_LABELS[pipe.stage!]).toLowerCase() }),
                }))}
                onChange={(v) => update(r.key, { pipeSegmentId: v, pipeNodeId: null })}
                placeholder={t('Choose the pipe')}
              />
            ) : null}
            {pipe.valves.length ? (
              <Select
                label={t('Valve or chamber')}
                value={r.pipeNodeId}
                searchable
                options={pipe.valves.map((v) => ({ value: v.id, label: v.code, hint: `${t(PIPE_NODE_KIND_LABELS[v.kind])}${v.fixed ? ` · ${t('fixed')}` : ''}` }))}
                onChange={(v) => update(r.key, { pipeNodeId: v })}
                placeholder={t('Choose the valve')}
              />
            ) : null}
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
