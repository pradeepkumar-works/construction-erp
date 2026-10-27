/**
 * The standard norms library (finding 16 of the October review): a new project's reconciliation was empty, because a
 * norm had to be typed for every BOQ item before anything could be checked. These are the usual starting figures for
 * the work a civil contractor does; a project adopts the ones its BOQ matches and the quantity surveyor corrects them
 * against the approved mix design. Nothing here is written anywhere until someone adopts it.
 */

/** One material a standard norm uses, per unit of the work. */
export interface StandardNormMaterial {
  /** The store item as the library names it; the item master decides what it really is */
  item: string;
  unit: string;
  /** Item units per unit of the work */
  qtyPerUnit: number;
  /** Usual allowance over the theoretical quantity, % */
  wastagePct: number;
}

/** One kind of work, the words that name it in a BOQ, and what it takes. */
export interface StandardNorm {
  key: string;
  label: string;
  /** The unit the work is measured in; a BOQ item in another unit is not this work */
  unit: string;
  /** Every one of these must appear in the description for it to be this work */
  words: string[];
  /** Any of these rules it out */
  not?: string[];
  /** What the figures stand on, said to the person adopting them */
  note: string;
  materials: StandardNormMaterial[];
}

/** A description as the matcher reads it: lower case, punctuation gone, "M 20" and "M20" alike. */
export const normsKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b([a-z])\s+(\d)/g, '$1$2')
    .trim();

const CEMENT = 'OPC 53 Grade Cement';
const SAND = 'River Sand';
const AGG20 = 'Coarse Aggregate 20 mm';

/** Cement, sand and aggregate for a cubic metre of concrete, with the usual allowances. */
const concrete = (bags: number, sand: number, agg: number): StandardNormMaterial[] => [
  { item: CEMENT, unit: 'Bags', qtyPerUnit: bags, wastagePct: 2 },
  { item: SAND, unit: 'Cum', qtyPerUnit: sand, wastagePct: 5 },
  { item: AGG20, unit: 'Cum', qtyPerUnit: agg, wastagePct: 5 },
];

/**
 * The library itself. Cement is counted in 50 kg bags. Concrete figures are the usual nominal mixes; a design mix
 * says otherwise and wins.
 */
export const STANDARD_NORMS: StandardNorm[] = [
  {
    key: 'rcc-m25',
    label: 'RCC M25',
    unit: 'Cum',
    words: ['m25'],
    note: 'Design mix at about 440 kg of cement per cum. Correct it against the approved mix design.',
    materials: concrete(8.8, 0.4, 0.8),
  },
  {
    key: 'rcc-m20',
    label: 'RCC M20',
    unit: 'Cum',
    words: ['m20'],
    note: 'Nominal 1:1.5:3, about 400 kg of cement per cum. Correct it against the approved mix design.',
    materials: concrete(8, 0.42, 0.84),
  },
  {
    key: 'rcc-m15',
    label: 'Concrete M15',
    unit: 'Cum',
    words: ['m15'],
    note: 'Nominal 1:2:4, about 320 kg of cement per cum.',
    materials: concrete(6.4, 0.46, 0.92),
  },
  {
    key: 'pcc-m10',
    label: 'PCC M10 (1:3:6)',
    unit: 'Cum',
    words: ['m10'],
    note: 'Nominal 1:3:6, about 220 kg of cement per cum.',
    materials: concrete(4.4, 0.47, 0.94),
  },
  {
    key: 'pcc-m75',
    label: 'PCC M7.5 (1:4:8)',
    unit: 'Cum',
    words: ['1 4 8'],
    note: 'Nominal 1:4:8, about 170 kg of cement per cum. Usual under footings and as levelling course.',
    materials: concrete(3.4, 0.47, 0.95),
  },
  {
    key: 'reinforcement',
    label: 'Reinforcement steel',
    unit: 'MT',
    words: ['reinforcement'],
    note: 'One tonne of steel per tonne measured, with binding wire at about 9.5 kg a tonne.',
    materials: [
      { item: 'TMT Steel Fe 500D', unit: 'MT', qtyPerUnit: 1, wastagePct: 3 },
      { item: 'Binding Wire', unit: 'Kg', qtyPerUnit: 9.5, wastagePct: 0 },
    ],
  },
  {
    key: 'brickwork',
    label: 'Brickwork in cement mortar 1:6',
    unit: 'Cum',
    words: ['brick'],
    not: ['half brick', '115 mm', '115mm'],
    note: 'Modular bricks in 1:6 mortar: about 500 bricks a cum. Count the bricks your site uses.',
    materials: [
      { item: 'Burnt Clay Bricks', unit: 'Nos', qtyPerUnit: 500, wastagePct: 3 },
      { item: CEMENT, unit: 'Bags', qtyPerUnit: 1.26, wastagePct: 2 },
      { item: SAND, unit: 'Cum', qtyPerUnit: 0.26, wastagePct: 5 },
    ],
  },
  {
    key: 'plaster-12',
    label: 'Plaster 12 mm in cement mortar 1:6',
    unit: 'Sqm',
    words: ['plaster'],
    note: '12 mm thick in 1:6 mortar. A thicker or richer plaster takes more.',
    materials: [
      { item: CEMENT, unit: 'Bags', qtyPerUnit: 0.063, wastagePct: 2 },
      { item: SAND, unit: 'Cum', qtyPerUnit: 0.013, wastagePct: 5 },
    ],
  },
  {
    key: 'gsb',
    label: 'Granular sub-base',
    unit: 'Cum',
    words: ['sub base'],
    note: 'About 1.25 cum of loose material for a cum compacted. Check it against your own density results.',
    materials: [{ item: 'Granular Sub-base Material', unit: 'Cum', qtyPerUnit: 1.25, wastagePct: 0 }],
  },
  {
    key: 'wmm',
    label: 'Wet mix macadam',
    unit: 'Cum',
    words: ['wet mix'],
    note: 'About 1.25 cum of loose aggregate for a cum compacted.',
    materials: [{ item: 'WMM Aggregate', unit: 'Cum', qtyPerUnit: 1.25, wastagePct: 0 }],
  },
  {
    key: 'dbm',
    label: 'Dense bituminous macadam',
    unit: 'MT',
    words: ['bituminous macadam'],
    note: 'Bitumen at about 4.5% by weight. The job mix formula decides it.',
    materials: [{ item: 'Bitumen VG-30', unit: 'MT', qtyPerUnit: 0.045, wastagePct: 0 }],
  },
  {
    key: 'bc',
    label: 'Bituminous concrete',
    unit: 'MT',
    words: ['bituminous concrete'],
    note: 'Bitumen at about 5.5% by weight. The job mix formula decides it.',
    materials: [{ item: 'Bitumen VG-30', unit: 'MT', qtyPerUnit: 0.055, wastagePct: 0 }],
  },
];

/** A BOQ item as the matcher reads it. */
export interface NormCandidate {
  id: string;
  description: string;
  unit: string;
}

/** The work a BOQ item is, as the library knows it: the most particular norm whose words are all in the description. */
export function standardNormFor(item: NormCandidate, library: StandardNorm[] = STANDARD_NORMS): StandardNorm | null {
  const key = normsKey(item.description);
  const unit = normsKey(item.unit);
  const hits = library.filter(
    (n) => normsKey(n.unit) === unit && n.words.every((w) => key.includes(normsKey(w))) && !(n.not ?? []).some((w) => key.includes(normsKey(w))),
  );
  if (!hits.length) return null;
  // The norm that says most about the work wins ("M20" over a bare "concrete"); the library's order settles a tie.
  return hits.reduce((a, b) => (b.words.join(' ').length > a.words.join(' ').length ? b : a));
}

/** Each BOQ item the library recognises, with the norm it would get. */
export function suggestStandardNorms<T extends NormCandidate>(items: T[], library: StandardNorm[] = STANDARD_NORMS): { item: T; norm: StandardNorm }[] {
  return items.flatMap((item) => {
    const norm = standardNormFor(item, library);
    return norm ? [{ item, norm }] : [];
  });
}
