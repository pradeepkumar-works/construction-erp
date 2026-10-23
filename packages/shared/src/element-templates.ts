/**
 * Built-in activity templates per kind of component (item 125, ARCHITECTURE "Work breakdown"). Adding a component from
 * the Structure tab lays out its activities and sub-activities with weights that add up to 100, and fills the planned
 * quantity where the component's specs say it (pipe length, number of connections, one lump sum).
 */
import type { WorkElementType } from './enums';

/** What a template asks about a component. */
export interface ElementSpecField {
  key: string;
  label: string;
  unit: string;
  /** Used when the field is left empty */
  default?: number;
}

export type ElementSpecs = Record<string, number | null | undefined>;

/** One activity or sub-activity a template lays out. */
export interface ElementActivityLine {
  /** Key inside the plan, so a sub-activity can name its activity */
  key: string;
  parentKey: string | null;
  name: string;
  unit: string;
  /** Share of its parent activity, or of the component for a top-level line, % */
  weightPct: number;
  /** Planned quantity worked out from the specs; null when the planner fills it in */
  qty: number | null;
}

const LIFT_M = { key: 'liftM', label: 'Lift height', unit: 'm', default: 3 };
const WALL_LIFT_M = { key: 'liftM', label: 'Wall lift height', unit: 'm', default: 1.5 };
const LENGTH = { key: 'lengthM', label: 'Length', unit: 'm' };
const DIAMETER = { key: 'diameterMm', label: 'Pipe diameter', unit: 'mm' };
const WALL_HEIGHT = { key: 'wallHeightM', label: 'Wall height', unit: 'm' };

export const ELEMENT_SPEC_FIELDS: Record<WorkElementType, ElementSpecField[]> = {
  INTAKE_WELL: [{ key: 'diameterM', label: 'Well diameter', unit: 'm' }, { key: 'depthM', label: 'Depth to founding level', unit: 'm' }, LIFT_M],
  PUMP_HOUSE: [],
  APPROACH_BRIDGE: [LENGTH],
  RISING_MAIN: [LENGTH, DIAMETER],
  FEEDER_MAIN: [LENGTH, DIAMETER],
  WTP: [{ key: 'capacityMld', label: 'Capacity', unit: 'MLD' }],
  WTP_UNIT: [WALL_HEIGHT, WALL_LIFT_M],
  SUMP: [{ key: 'capacityKl', label: 'Capacity', unit: 'KL' }, WALL_HEIGHT, WALL_LIFT_M],
  OHT: [{ key: 'capacityKl', label: 'Capacity', unit: 'KL' }, { key: 'stagingM', label: 'Staging height', unit: 'm' }, LIFT_M],
  PIPE_ZONE: [LENGTH, DIAMETER],
  HOUSE_CONNECTIONS: [{ key: 'connections', label: 'Connections', unit: 'Nos' }],
  ROAD_RESTORATION: [{ key: 'areaSqm', label: 'Area', unit: 'Sqm' }],
  HT_FEEDER: [LENGTH],
  EM_PACKAGE: [],
  STP_UNIT: [WALL_HEIGHT, WALL_LIFT_M],
  BLOCK: [{ key: 'floors', label: 'Floors, ground included', unit: 'Nos' }],
  FLOOR: [],
  ROAD_STRETCH: [LENGTH],
  CROSSING: [LENGTH],
  GENERAL: [],
};

/** Every RCC item is built as reinforcement, shuttering and concrete, which the site reports separately. */
export const RCC_PARTS: { suffix: string; name: string; unit: string; weightPct: number }[] = [
  { suffix: 'r', name: 'Reinforcement', unit: 'MT', weightPct: 35 },
  { suffix: 's', name: 'Shuttering', unit: 'Sqm', weightPct: 25 },
  { suffix: 'c', name: 'Concrete', unit: 'Cum', weightPct: 40 },
];

/** At most this many lifts are laid out for one wall, staging or steining. */
export const MAX_LIFTS = 20;

type Step =
  | { kind: 'plain'; name: string; unit: string; weightPct: number; qtyFrom?: string; lumpSum?: boolean }
  | { kind: 'rcc'; name: string; weightPct: number }
  /** RCC in lifts: `over` (a spec) ÷ the lift height, each lift its own RCC activity sharing the weight */
  | { kind: 'lifts'; name: string; weightPct: number; over: string };

const plain = (name: string, unit: string, weightPct: number, extra: { qtyFrom?: string; lumpSum?: boolean } = {}): Step => ({ kind: 'plain', name, unit, weightPct, ...extra });
const rcc = (name: string, weightPct: number): Step => ({ kind: 'rcc', name, weightPct });
const lifts = (name: string, weightPct: number, over: string): Step => ({ kind: 'lifts', name, weightPct, over });
const ls = (name: string, weightPct: number) => plain(name, 'LS', weightPct, { lumpSum: true });

const tankUnit = (roof: boolean): Step[] => [
  plain('Excavation', 'Cum', roof ? 10 : 8),
  plain('PCC', 'Cum', roof ? 5 : 4),
  rcc('Raft', roof ? 20 : 15),
  lifts('Walls', 30, 'wallHeightM'),
  ...(roof ? [rcc('Roof slab', 15)] : [rcc('Launders and channels', 8), ls('Mechanism and equipment', 15)]),
  ls('Pipes and valves', 10),
  ls('Water-tightness test', 5),
  plain('Plaster, paint and finishing', 'Sqm', 5),
];

const pipeline = (restore: boolean): Step[] => [
  plain('Trench excavation', 'Rmt', 18, { qtyFrom: 'lengthM' }),
  plain('Bedding', 'Rmt', 5, { qtyFrom: 'lengthM' }),
  plain('Pipe lowering, laying and jointing', 'Rmt', 35, { qtyFrom: 'lengthM' }),
  plain('Valves, specials and chambers', 'Nos', 8),
  plain('Backfilling and compaction', 'Rmt', 9, { qtyFrom: 'lengthM' }),
  plain('Hydraulic testing', 'Rmt', 7, { qtyFrom: 'lengthM' }),
  ...(restore ? [plain('Road and surface restoration', 'Sqm', 10)] : [plain('Thrust blocks and anchors', 'Cum', 10)]),
  plain('Flushing, disinfection and commissioning', 'Rmt', 8, { qtyFrom: 'lengthM' }),
];

const TEMPLATES: Record<WorkElementType, Step[]> = {
  OHT: [
    plain('Excavation', 'Cum', 5),
    rcc('PCC and raft', 10),
    lifts('Staging', 25, 'stagingM'),
    rcc('Bottom ring beam', 5),
    rcc('Conical wall and lower dome', 10),
    rcc('Container wall', 15),
    rcc('Top ring beam and top dome', 10),
    rcc('Staircase and gallery', 5),
    ls('Pipes and valves', 5),
    plain('Plaster, paint and waterproofing', 'Sqm', 5),
    ls('Water-tightness test', 5),
  ],
  INTAKE_WELL: [
    ls('Cofferdam and sinking island', 5),
    rcc('Well curb', 8),
    lifts('Steining', 22, 'depthM'),
    plain('Sinking to founding level', 'Rmt', 8, { qtyFrom: 'depthM' }),
    plain('Bottom plug', 'Cum', 7),
    rcc('Top slab', 6),
    rcc('Pump house on the well', 18),
    rcc('Approach bridge', 16),
    plain('Inlet pipes and screens', 'Nos', 5),
    plain('Painting and finishing', 'Sqm', 5),
  ],
  WTP_UNIT: tankUnit(false),
  STP_UNIT: tankUnit(false),
  SUMP: tankUnit(true),
  // A treatment plant is laid out by its units, each a sub-component with its own template.
  WTP: [],
  PUMP_HOUSE: [
    plain('Excavation', 'Cum', 8),
    plain('PCC', 'Cum', 4),
    rcc('Foundation and plinth', 15),
    rcc('Columns and beams', 18),
    rcc('Roof slab', 12),
    plain('Brick masonry', 'Cum', 10),
    plain('Plaster and paint', 'Sqm', 8),
    ls('Doors, windows and flooring', 5),
    plain('Pumps and motors erected', 'Nos', 15),
    ls('Trial run', 5),
  ],
  APPROACH_BRIDGE: [rcc('Piers and foundations', 35), rcc('Deck slab', 40), plain('Railings and finishing', 'Rmt', 10, { qtyFrom: 'lengthM' }), plain('Pipe supports', 'Nos', 15)],
  RISING_MAIN: pipeline(false),
  FEEDER_MAIN: pipeline(false),
  PIPE_ZONE: pipeline(true),
  HOUSE_CONNECTIONS: [
    plain('Survey and consumer list', 'Nos', 5, { qtyFrom: 'connections' }),
    plain('Tapping and saddle', 'Nos', 25, { qtyFrom: 'connections' }),
    plain('Service pipe laid', 'Nos', 30, { qtyFrom: 'connections' }),
    plain('Meter and chamber', 'Nos', 30, { qtyFrom: 'connections' }),
    plain('Tested and handed over', 'Nos', 10, { qtyFrom: 'connections' }),
  ],
  ROAD_RESTORATION: [plain('Bituminous road', 'Sqm', 50), plain('Cement concrete road', 'Sqm', 35), plain('Paver and earthen surface', 'Sqm', 15)],
  HT_FEEDER: [
    ls('Survey and approval', 5),
    plain('Poles erected', 'Nos', 30),
    plain('Conductor strung', 'Rmt', 30, { qtyFrom: 'lengthM' }),
    plain('Transformer and substation', 'Nos', 25),
    ls('Testing and charging', 10),
  ],
  EM_PACKAGE: [
    ls('Design and quality plan approved', 5),
    ls('Manufacture and inspection', 30),
    ls('Supplied to site', 25),
    ls('Erection', 20),
    ls('Testing and commissioning', 15),
    ls('Trial run', 5),
  ],
  BLOCK: [
    rcc('Foundation', 12),
    lifts('Frame', 40, 'floors'),
    plain('Brick masonry', 'Cum', 12),
    plain('Plaster', 'Sqm', 8),
    plain('Flooring', 'Sqm', 8),
    ls('Plumbing and electrical', 12),
    ls('Doors and windows', 4),
    plain('Painting and finishing', 'Sqm', 4),
  ],
  FLOOR: [rcc('Frame and slab', 45), plain('Brick masonry', 'Cum', 15), plain('Plaster', 'Sqm', 10), plain('Flooring', 'Sqm', 10), ls('Plumbing and electrical', 12), plain('Finishing', 'Sqm', 8)],
  ROAD_STRETCH: [plain('Earthwork', 'Cum', 20), plain('Subgrade', 'Cum', 10), plain('GSB', 'Cum', 15), plain('WMM', 'Cum', 15), plain('Bituminous courses', 'Sqm', 30), ls('Road furniture and markings', 10)],
  CROSSING: [
    ls('Launch and receiving pits', 15),
    plain('Pilot bore and reaming', 'Rmt', 35, { qtyFrom: 'lengthM' }),
    plain('Pipe pulled back', 'Rmt', 35, { qtyFrom: 'lengthM' }),
    ls('Testing', 10),
    ls('Reinstatement', 5),
  ],
  GENERAL: [],
};

const FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor', 'Fifth floor'];

/** How many lifts a height needs: height ÷ lift, rounded up, 1 to MAX_LIFTS. A count of floors is used as it is. */
export const liftCount = (height: number | null | undefined, liftM: number | null | undefined, isCount = false): number => {
  if (!height || height <= 0) return 1;
  if (isCount) return Math.min(MAX_LIFTS, Math.max(1, Math.round(height)));
  const lift = liftM && liftM > 0 ? liftM : 3;
  return Math.min(MAX_LIFTS, Math.max(1, Math.ceil(height / lift - 1e-9)));
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Fills each spec's default where it was left empty. */
export const specsWithDefaults = (type: WorkElementType, specs: ElementSpecs | null | undefined): ElementSpecs => {
  const out: ElementSpecs = { ...(specs ?? {}) };
  for (const f of ELEMENT_SPEC_FIELDS[type]) if ((out[f.key] === null || out[f.key] === undefined) && f.default !== undefined) out[f.key] = f.default;
  return out;
};

/**
 * The activities and sub-activities a component of this kind starts with. Top-level weights add up to 100, and so do
 * each RCC activity's three parts. A run of lifts shares its weight equally (a remainder goes to the last lift so the
 * sum stays exact).
 */
export function elementPlan(type: WorkElementType, rawSpecs?: ElementSpecs | null): ElementActivityLine[] {
  const specs = specsWithDefaults(type, rawSpecs);
  const lines: ElementActivityLine[] = [];
  const addRcc = (key: string, name: string, weightPct: number) => {
    lines.push({ key, parentKey: null, name, unit: 'Cum', weightPct, qty: null });
    for (const p of RCC_PARTS) lines.push({ key: `${key}.${p.suffix}`, parentKey: key, name: `${name}: ${p.name.toLowerCase()}`, unit: p.unit, weightPct: p.weightPct, qty: null });
  };
  TEMPLATES[type].forEach((step, i) => {
    const key = String(i + 1);
    if (step.kind === 'plain') {
      const fromSpec = step.qtyFrom ? specs[step.qtyFrom] : null;
      lines.push({ key, parentKey: null, name: step.name, unit: step.unit, weightPct: step.weightPct, qty: step.lumpSum ? 1 : fromSpec && fromSpec > 0 ? round3(fromSpec) : null });
    } else if (step.kind === 'rcc') {
      addRcc(key, step.name, step.weightPct);
    } else {
      const isFloors = step.over === 'floors';
      const n = liftCount(specs[step.over], specs.liftM, isFloors);
      const each = Math.floor((step.weightPct / n) * 1000) / 1000;
      for (let k = 1; k <= n; k++) {
        const weight = k === n ? round3(step.weightPct - each * (n - 1)) : each;
        const name = isFloors ? `${step.name}: ${FLOOR_NAMES[k - 1] ?? `Floor ${k - 1}`}` : n === 1 ? step.name : `${step.name} lift ${k}`;
        addRcc(`${key}-${k}`, name, weight);
      }
    }
  });
  return lines;
}

/** Element kinds a project type usually has, offered first when adding a component. */
export const ELEMENT_TYPES_FOR: Record<string, WorkElementType[]> = {
  WATER_SUPPLY: ['INTAKE_WELL', 'PUMP_HOUSE', 'RISING_MAIN', 'WTP', 'WTP_UNIT', 'SUMP', 'FEEDER_MAIN', 'OHT', 'PIPE_ZONE', 'HOUSE_CONNECTIONS', 'ROAD_RESTORATION', 'HT_FEEDER', 'EM_PACKAGE', 'CROSSING'],
  SEWERAGE: ['PIPE_ZONE', 'PUMP_HOUSE', 'RISING_MAIN', 'STP_UNIT', 'SUMP', 'HOUSE_CONNECTIONS', 'ROAD_RESTORATION', 'EM_PACKAGE', 'CROSSING'],
  BUILDING: ['BLOCK', 'FLOOR', 'EM_PACKAGE', 'ROAD_STRETCH'],
  ROAD: ['ROAD_STRETCH', 'CROSSING'],
};
