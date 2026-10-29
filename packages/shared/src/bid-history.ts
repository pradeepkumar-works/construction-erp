/**
 * Bid intelligence (intelligence quick win Q4): on a tender being priced, where L1 landed on the company's past openings
 * of the same client and the same kind of work, against the SOR (or the estimate), and how the quote now on the tender
 * would have stood on them. Pure; `TendersService.pastOpenings` prices the past tenders through the register's own rules
 * and the screen reads the summary through these helpers. Tested in `src/scripts/intelligence-test.ts`.
 */
import { medianOf } from './vendor-score';

/** Openings this far back count. */
export const BID_HISTORY_DAYS = 3 * 365;
/** Fewer openings than this on a basis say too little to read a level from. */
export const BID_MIN_OPENINGS = 2;
/** At most this many past openings are listed. */
export const BID_HISTORY_SHOWN = 8;

/** Kinds of work, read from a tender's title. */
export const WORK_KINDS = ['BRIDGE', 'ROAD', 'WATER', 'SEWER', 'IRRIGATION', 'BUILDING', 'OTHER'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  BRIDGE: 'Bridges and culverts',
  ROAD: 'Roads',
  WATER: 'Water supply',
  SEWER: 'Sewerage and drainage',
  IRRIGATION: 'Irrigation',
  BUILDING: 'Buildings',
  OTHER: 'Other work',
};

/** Words that name a kind, checked in `WORK_KINDS` order so a bridge on a road reads as a bridge. Whole words only. */
const KIND_WORDS: Record<Exclude<WorkKind, 'OTHER'>, string[]> = {
  BRIDGE: ['bridge', 'bridges', 'culvert', 'culverts', 'flyover', 'rob', 'rub', 'causeway'],
  ROAD: ['road', 'roads', 'highway', 'nh', 'sh', 'widening', 'carriageway', 'pavement', 'bituminous', 'pmgsy', 'bypass'],
  WATER: ['water supply', 'piped water', 'drinking water', 'jjm', 'jal jeevan', 'pipeline', 'wtp', 'esr', 'oht', 'intake', 'reservoir'],
  SEWER: ['sewer', 'sewerage', 'sewage', 'stp', 'drain', 'drainage', 'storm water'],
  IRRIGATION: ['irrigation', 'canal', 'canals', 'dam', 'weir', 'barrage', 'check dam', 'distributary'],
  BUILDING: ['building', 'buildings', 'hospital', 'chc', 'phc', 'school', 'college', 'hostel', 'quarters', 'office', 'auditorium', 'housing', 'residential', 'boundary wall', 'block building'],
};

/** The kind of work a tender's title names, OTHER when none of the words is in it. */
export function workKindOf(title: string): WorkKind {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  for (const kind of WORK_KINDS) {
    if (kind === 'OTHER') continue;
    if (KIND_WORDS[kind].some((w) => t.includes(` ${w} `))) return kind;
  }
  return 'OTHER';
}

/** How a past opening matches the tender: same client and kind, same kind only, or same client only (strongest first). */
export const BID_MATCHES = ['CLIENT_AND_KIND', 'KIND', 'CLIENT'] as const;
export type BidMatch = (typeof BID_MATCHES)[number];
export const BID_MATCH_LABELS: Record<BidMatch, string> = {
  CLIENT_AND_KIND: 'Same client and kind of work',
  KIND: 'Same kind of work',
  CLIENT: 'Same client',
};

export interface PastOpeningDto {
  tenderId: string;
  tenderNo: string;
  title: string;
  clientName: string | null;
  openedOn: string;
  kind: WorkKind;
  match: BidMatch;
  /** Bidders at the opening, ourselves included */
  bidders: number;
  l1Name: string;
  /** L1 against the SOR value (or the estimate), in %; null without either */
  l1Pct: string | null;
  /** Ours, when we bid */
  ourPct: string | null;
  ourRank: number | null;
}

/** The level L1 landed at on the openings of one basis, in % against the SOR. */
export interface BidLevelDto {
  basis: BidMatch;
  count: number;
  median: number;
  low: number;
  high: number;
  /** Of these openings, how many the tender's own quote would have been lowest on (null until it has a quote) */
  wouldLead: number | null;
}

export interface PastOpeningsDto {
  tenderId: string;
  kind: WorkKind;
  /** The tender's own quote against the SOR, in %, as its totals have it */
  quotedPct: string | null;
  openings: PastOpeningDto[];
  /** Read from the strongest basis with `BID_MIN_OPENINGS` openings that have a percentage; null when none has */
  level: BidLevelDto | null;
}

/** What a past opening needs to be placed. */
export interface OpeningInput {
  tenderId: string;
  clientKey: string | null;
  kind: WorkKind;
  openedOn: string;
}

/** How a past opening matches the tender, or null when it shares neither the client nor the kind. OTHER never matches on kind. */
export function bidMatch(tender: { clientKey: string | null; kind: WorkKind }, past: { clientKey: string | null; kind: WorkKind }): BidMatch | null {
  const client = !!tender.clientKey && tender.clientKey === past.clientKey;
  const kind = tender.kind !== 'OTHER' && tender.kind === past.kind;
  return client && kind ? 'CLIENT_AND_KIND' : kind ? 'KIND' : client ? 'CLIENT' : null;
}

/** The past openings worth showing: matched, within `BID_HISTORY_DAYS` of `today`, strongest match first, then latest. */
export function pickOpenings<T extends OpeningInput>(tender: { tenderId: string; clientKey: string | null; kind: WorkKind }, past: T[], today: string): (T & { match: BidMatch })[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - BID_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  return past
    .filter((p) => p.tenderId !== tender.tenderId && p.openedOn >= from && p.openedOn <= today)
    .flatMap((p) => {
      const match = bidMatch(tender, p);
      return match ? [{ ...p, match }] : [];
    })
    .sort((a, b) => BID_MATCHES.indexOf(a.match) - BID_MATCHES.indexOf(b.match) || b.openedOn.localeCompare(a.openedOn))
    .slice(0, BID_HISTORY_SHOWN);
}

const two = (v: number) => Math.round(v * 100) / 100;

/**
 * Where L1 landed: over the strongest basis with at least `BID_MIN_OPENINGS` openings that have a percentage, the median,
 * the lowest and the highest; and how many of them a quote at `quotedPct` would have led (at or below their L1).
 */
export function bidLevel(openings: { match: BidMatch; l1Pct: string | null }[], quotedPct: string | null): BidLevelDto | null {
  for (const basis of BID_MATCHES) {
    // A weaker basis takes in the stronger ones' openings too: the same kind of work includes the same client's.
    const upto = BID_MATCHES.slice(0, BID_MATCHES.indexOf(basis) + 1);
    const pcts = openings.filter((o) => upto.includes(o.match) && o.l1Pct !== null).map((o) => Number(o.l1Pct));
    if (pcts.length < BID_MIN_OPENINGS) continue;
    const q = quotedPct === null ? null : Number(quotedPct);
    return {
      basis,
      count: pcts.length,
      median: two(medianOf(pcts)!),
      low: two(Math.min(...pcts)),
      high: two(Math.max(...pcts)),
      wouldLead: q === null ? null : pcts.filter((p) => q <= p + 1e-9).length,
    };
  }
  return null;
}
