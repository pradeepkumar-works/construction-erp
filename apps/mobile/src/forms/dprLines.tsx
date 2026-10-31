import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  PICK_OUTSIDE,
  PICK_WHOLE,
  PIPE_NODE_KIND_LABELS,
  PIPE_STAGE_LABELS,
  activitiesFor,
  comparePipeCodes,
  componentChoices,
  componentLabel,
  componentPickOf,
  crewCheck,
  dprActivityLabel,
  dprLineShows,
  formatChainage,
  linePick,
  ownFieldsOf,
  parseChainage,
  segmentLabel,
  subComponentChoices,
  subPickOf,
  suggestMaterials,
  type DprFormDef,
  type DprLineDto,
  type DprLineInput,
  type DprWorkOptionsDto,
  type ManpowerLine,
} from '@erp/shared';
import { Button, IconButton, Input, PhotoPicker, Select, type LocalPhoto } from '../components';
import { attachmentsToPhotos } from './edit';
import { OwnFieldInputs, ownPayload, ownProblems, ownValuesFrom, type OwnValues } from './ownFields';
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
  /** Where by the project's places (item 134): chainage as km+m text, floor, village */
  chainageFrom: string;
  chainageTo: string;
  floor: string | null;
  village: string | null;
  /** The pipe segment, or for a valve line the valve, the work was on (item 126) */
  pipeSegmentId: string | null;
  pipeNodeId: string | null;
  crew: { key: string; category: string | null; count: string }[];
  machines: { key: string; name: string; hours: string }[];
  materials: { key: string; itemId: string | null; quantity: string }[];
  /** Changed by hand, so the norms no longer fill it */
  materialsEdited: boolean;
  workOrderId: string | null;
  remarks: string;
  /** The line's fields of the company's own (item 134 part 2) */
  extra: OwnValues;
  /** The line's photos; they go to the outbox with the line's id */
  photos: LocalPhoto[];
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
  chainageFrom: '',
  chainageTo: '',
  floor: null,
  village: null,
  pipeSegmentId: null,
  pipeNodeId: null,
  crew: [],
  machines: [],
  materials: [],
  materialsEdited: false,
  workOrderId: null,
  remarks: '',
  extra: {},
  photos: [],
  ...over,
});

const chainageText = (m: number | null | undefined) => (m === null || m === undefined ? '' : formatChainage(m));

/** A saved or queued line back into the form. */
export const lineRowFrom = (l: DprLineDto | DprLineInput, id: string): DprLineRow =>
  newLineRow(l.id ?? id, {
    activityId: l.activityId,
    quantity: l.quantity ? qty(l.quantity) : '',
    // A saved line's place was written into its location; the fields hold it now.
    location: 'attachments' in l && l.location && (l.chainageFrom !== null || l.floor || l.village) ? '' : (l.location ?? ''),
    chainageFrom: chainageText(l.chainageFrom),
    chainageTo: l.chainageTo !== l.chainageFrom ? chainageText(l.chainageTo) : '',
    floor: l.floor ?? null,
    village: l.village ?? null,
    pipeSegmentId: l.pipeSegmentId ?? null,
    pipeNodeId: l.pipeNodeId ?? null,
    crew: (l.labour ?? []).map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })),
    machines: (l.machines ?? []).map((m) => ({ key: newKey(), name: m.name, hours: String(m.hours) })),
    materials: (l.materials ?? []).map((m) => ({ key: newKey(), itemId: m.itemId, quantity: qty(m.quantity) })),
    materialsEdited: true,
    workOrderId: l.workOrderId ?? null,
    remarks: l.remarks ?? '',
    extra: ownValuesFrom(l.extra),
    photos: 'attachments' in l ? attachmentsToPhotos(l.attachments) : [],
  });

/** Yesterday's line as a start for today: the same work, place and crew; today's quantity and material to fill. */
export const copiedRow = (l: DprLineDto, id: string): DprLineRow =>
  newLineRow(id, {
    activityId: l.activityId,
    location: l.chainageFrom !== null || l.floor || l.village ? '' : (l.location ?? ''),
    floor: l.floor,
    village: l.village,
    pipeSegmentId: l.pipeSegmentId,
    crew: l.labour.map((m) => ({ key: newKey(), category: m.category, count: String(m.count) })),
    machines: l.machines.map((m) => ({ key: newKey(), name: m.name, hours: String(m.hours) })),
    workOrderId: l.workOrderId,
  });

/**
 * The lines as the API takes them. A line's photos go separately: their ids once uploaded (`linePhotoIds`), or through
 * the outbox, which puts them on the line by its id.
 */
export const linesPayload = (rows: DprLineRow[], def: DprFormDef): DprLineInput[] =>
  rows
    .filter((r) => r.activityId)
    .map((r) => ({
      id: r.id,
      activityId: r.activityId!,
      quantity: r.quantity.trim(),
      location: r.location.trim() || null,
      chainageFrom: parseChainage(r.chainageFrom) ?? null,
      chainageTo: parseChainage(r.chainageTo) ?? null,
      floor: r.floor,
      village: r.village,
      pipeSegmentId: r.pipeSegmentId,
      pipeNodeId: r.pipeNodeId,
      labour: r.crew.filter((c) => c.category && /^\d+$/.test(c.count.trim()) && Number(c.count) > 0).map((c) => ({ category: c.category!, count: Number(c.count) })),
      machines: r.machines.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), hours: Number(m.hours) || 0 })),
      materials: r.materials.filter((m) => m.itemId && Number(m.quantity) > 0).map((m) => ({ itemId: m.itemId!, quantity: m.quantity.trim() })),
      workOrderId: r.workOrderId,
      remarks: r.remarks.trim() || null,
      extra: ownPayload(ownFieldsOf(def, 'LINE'), r.extra),
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

export function linesProblem(rows: DprLineRow[], t: ReturnType<typeof useT>, options: DprWorkOptionsDto | null, def: DprFormDef, language: 'en' | 'hi'): string | null {
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
    if (r.machines.some((m) => m.hours.trim() && Number.isNaN(Number(m.hours)))) return t('Line {n}: enter machine hours as a number', { n });
    if ((r.chainageFrom.trim() && parseChainage(r.chainageFrom) === null) || (r.chainageTo.trim() && parseChainage(r.chainageTo) === null)) return t('Line {n}: give the chainage like 14+200', { n });
    const own = ownProblems(ownFieldsOf(def, 'LINE'), r.extra, t, language, `${t('Line {n}', { n })}: `);
    if (own) return own;
  }
  return null;
}

/**
 * The DPR's work done, line by line (item 127), as the project type's form asks (item 134 part 2): the activity (picked
 * component by component, or from one list), where by the project's places, how much today, and what else the form
 * takes: crew, machines, material used (filled from the norms until changed), work order, remark, photo and the
 * company's own line fields. Activities planned this week come first in the picker.
 */
export function DprLinesEditor({
  rows,
  onChange,
  options,
  def,
  headCount,
  newId,
  error,
}: {
  rows: DprLineRow[];
  /** The form's state setter: a line's photos change as they upload, after the render that started them */
  onChange: React.Dispatch<React.SetStateAction<DprLineRow[]>>;
  options: DprWorkOptionsDto | null;
  def: DprFormDef;
  headCount: ManpowerLine[];
  newId: () => string;
  error?: string | null;
}) {
  const t = useT();
  const activities = useMemo(() => options?.activities ?? [], [options]);
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const components = useMemo(() => (def.lines.picker === 'CASCADE' ? componentChoices(activities) : []), [activities, def.lines.picker]);
  const componentOptions = useMemo(
    () =>
      components.map((c) => ({
        value: c.key,
        label: c.key === PICK_OUTSIDE ? t('Outside the breakdown') : `${c.key} ${c.name ?? ''}`.trim(),
        hint: c.count === 1 ? t('1 activity') : t('{n} activities', { n: c.count }),
      })),
    [components, t],
  );
  const activityOptions = (component: string | null, sub: string | null) =>
    activitiesFor(activities, component, sub)
      .slice()
      .sort((x, y) => Number(y.lookAhead) - Number(x.lookAhead))
      .map((a) => ({
        value: a.id,
        label: dprActivityLabel(a),
        hint: `${a.lookAhead ? `${t('Planned this week')} · ` : ''}${component === null ? `${componentLabel(a) === 'Outside the breakdown' ? t('Outside the breakdown') : componentLabel(a)} · ` : ''}${t('{done} of {planned} {unit} done', { done: qty(a.doneQty), planned: qty(a.plannedQty), unit: a.unit })}`,
      }));
  const itemOptions = useMemo(() => (options?.items ?? []).map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` })), [options]);
  const categoryOptions = useMemo(() => def.lines.crewCategories.map((c) => ({ value: c, label: t(c) })), [def.lines.crewCategories, t]);
  const machineOptions = useMemo(() => def.lines.machineNames.map((m) => ({ value: m, label: m })), [def.lines.machineNames]);
  const workOrderOptions = useMemo(() => (options?.workOrders ?? []).map((w) => ({ value: w.id, label: w.woNo, hint: w.vendorName })), [options]);
  const shows = (p: Parameters<typeof dprLineShows>[1]) => dprLineShows(def, p);
  const own = ownFieldsOf(def, 'LINE');
  const sector = options?.sector;
  const places = sector?.locations ?? [];
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
  const pickList = (list: string[]) => list.map((x) => ({ value: x, label: x }));

  return (
    <View>
      {rows.map((r, i) => {
        const a = byId.get(r.activityId ?? '');
        const n = i + 1;
        const pipe = pipeChoices(options, r.activityId);
        const place = linePick({ component: r.componentPick, sub: r.subPick }, a);
        const subs = components.length ? subComponentChoices(activities, place.component) : [];
        const byPlace = !pipe.segments.length && !pipe.valves.length && places.length > 0;
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
                onChange={(v) => update(r.key, { componentPick: v, subPick: null, ...(a && componentPickOf(a) !== v ? { activityId: null } : {}) })}
                placeholder={t('Choose the component')}
              />
            ) : null}
            {subs.length ? (
              <Select
                label={t('Sub-component')}
                value={place.sub}
                options={subs.map((c) => ({
                  value: c.key,
                  label: c.key === PICK_WHOLE ? t('The component as a whole') : `${c.key} ${c.name ?? ''}`.trim(),
                  hint: c.count === 1 ? t('1 activity') : t('{n} activities', { n: c.count }),
                }))}
                searchable
                onChange={(v) => update(r.key, { componentPick: place.component, subPick: v, ...(a && subPickOf(a) !== v ? { activityId: null } : {}) })}
                placeholder={t('Choose the sub-component')}
              />
            ) : null}
            <Select
              label={t('Activity')}
              required
              value={r.activityId}
              options={activityOptions(components.length ? place.component : null, subs.length ? place.sub : null)}
              onChange={(v) => {
                const picked = byId.get(v);
                update(r.key, { activityId: v, componentPick: picked ? componentPickOf(picked) : r.componentPick, subPick: picked ? subPickOf(picked) : r.subPick });
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
            {a?.holdPoint ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.hold}>{t('Hold point: approved after a passed inspection here')}</Text> : null}
            {byPlace && places.includes('CHAINAGE') ? (
              <View style={styles.row}>
                <Input label={t('Chainage from')} value={r.chainageFrom} onChangeText={(v) => update(r.key, { chainageFrom: v })} placeholder={sector?.chainageStart !== null && sector?.chainageStart !== undefined ? formatChainage(sector.chainageStart) : '14+200'} keyboardType="numbers-and-punctuation" containerStyle={styles.grow} />
                <Input label={t('Chainage to')} value={r.chainageTo} onChangeText={(v) => update(r.key, { chainageTo: v })} placeholder="14+600" keyboardType="numbers-and-punctuation" containerStyle={styles.grow} />
              </View>
            ) : null}
            {byPlace && places.includes('FLOOR') ? (
              sector?.floors.length ? (
                <Select label={t('Floor')} value={r.floor} options={pickList(sector.floors)} onChange={(v) => update(r.key, { floor: v })} placeholder={t('Which floor')} />
              ) : (
                <Input label={t('Floor')} value={r.floor ?? ''} onChangeText={(v) => update(r.key, { floor: v || null })} />
              )
            ) : null}
            {byPlace && places.includes('VILLAGE') ? (
              sector?.villages.length ? (
                <Select label={t('Village')} value={r.village} options={pickList(sector.villages)} searchable onChange={(v) => update(r.key, { village: v })} placeholder={t('Which village')} />
              ) : (
                <Input label={t('Village')} value={r.village ?? ''} onChangeText={(v) => update(r.key, { village: v || null })} />
              )
            ) : null}
            <View style={styles.row}>
              <Input
                label={a ? t('Today ({unit})', { unit: a.unit }) : t('Today')}
                required
                value={r.quantity}
                onChangeText={(v) => update(r.key, { quantity: v })}
                keyboardType="decimal-pad"
                containerStyle={styles.qty}
              />
              <Input label={byPlace ? t('Note') : t('Where')} value={r.location} onChangeText={(v) => update(r.key, { location: v })} placeholder={byPlace ? t('Optional') : t('e.g. Lift 4, J-12 to J-13')} containerStyle={styles.grow} />
            </View>

            {shows('crew') ? (
              <>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.label}>{t('Crew')}</Text>
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
              </>
            ) : null}

            {shows('machines') ? (
              <>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.label}>{t('Machines')}</Text>
                {r.machines.map((m) => (
                  <View key={m.key} style={styles.row}>
                    <View style={styles.grow}>
                      {machineOptions.length ? (
                        <Select value={m.name || null} options={m.name && !machineOptions.some((o) => o.value === m.name) ? [...machineOptions, { value: m.name, label: m.name }] : machineOptions} onChange={(v) => update(r.key, { machines: r.machines.map((x) => (x.key === m.key ? { ...x, name: v } : x)) })} placeholder={t('Machine')} />
                      ) : (
                        <Input value={m.name} onChangeText={(v) => update(r.key, { machines: r.machines.map((x) => (x.key === m.key ? { ...x, name: v } : x)) })} placeholder={t('e.g. Excavator')} accessibilityLabel={t('Machine')} />
                      )}
                    </View>
                    <Input
                      value={m.hours}
                      onChangeText={(v) => update(r.key, { machines: r.machines.map((x) => (x.key === m.key ? { ...x, hours: v } : x)) })}
                      keyboardType="decimal-pad"
                      placeholder={t('Hrs')}
                      accessibilityLabel={m.name.trim() ? t('Hours worked by {machine}', { machine: m.name.trim() }) : t('Hours worked')}
                      containerStyle={styles.small}
                    />
                    <IconButton icon="close" size={20} color={colors.textMuted} onPress={() => update(r.key, { machines: r.machines.filter((x) => x.key !== m.key) })} accessibilityLabel={t('Remove row')} style={styles.remove} />
                  </View>
                ))}
                <Button title={t('Add machine')} variant="ghost" size="sm" icon="add" onPress={() => update(r.key, { machines: [...r.machines, { key: newKey(), name: '', hours: '8' }] })} />
              </>
            ) : null}

            {shows('material') ? (
              <>
                <Text maxFontSizeMultiplier={maxFontScale} style={typography.label}>{t('Material used')}</Text>
                {a && !a.norms.length && !r.materials.length ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.note}>{t('No norms for this activity; add what was used.')}</Text> : null}
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
              </>
            ) : null}

            {shows('workOrder') && workOrderOptions.length ? (
              <Select label={t('Work order')} value={r.workOrderId} options={workOrderOptions} onChange={(v) => update(r.key, { workOrderId: v })} placeholder={t('Done by our own crew')} />
            ) : null}
            {shows('remarks') ? <Input label={t('Remark')} value={r.remarks} onChangeText={(v) => update(r.key, { remarks: v })} multiline maxLength={500} /> : null}
            <OwnFieldInputs fields={own} values={r.extra} onChange={(extra) => update(r.key, { extra })} />
            {shows('photo') ? (
              <PhotoPicker
                label={t('Photo of this work')}
                photos={r.photos}
                max={4}
                onChange={(next) => onChange((prev) => prev.map((x) => (x.key === r.key ? { ...x, photos: typeof next === 'function' ? next(x.photos) : next } : x)))}
              />
            ) : null}
          </View>
        );
      })}
      {error ? <Text maxFontSizeMultiplier={maxFontScale} style={styles.err}>{error}</Text> : null}
      <Button title={t('Add work line')} variant="ghost" icon="add" onPress={() => onChange([...rows, newLineRow(newId())])} />
      {shows('crew') && rows.some((r) => r.activityId) && check.headCount !== null ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.note}>
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
