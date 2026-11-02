import type { Attention, FigureId, FigureKind, KindOf } from './measures';

/** Rupees or a quantity: a Decimal string as the API sends it, or a number a screen added up. */
type Decimal = string | number;
export type ValueOf<K extends FigureKind> = K extends 'money' | 'qty' ? Decimal : number;

/** No value, and why: "No delivery date to judge by". A headline never shows a bare dash. */
export interface NoValue {
  readonly none: string;
}

/** A month (YYYY-MM); `sameDays` while the month it stands against is still under way: "the same days of Sep". */
export interface MonthWhen {
  readonly month: string;
  readonly sameDays?: boolean;
}

/** The period a figure covers; it joins the label: "Work done in Oct", "Clients owe today", "Billed to date". */
export type FigureWhen = 'today' | 'toDate' | MonthWhen;

/**
 * What the figure stands against, at most one. A comparison with the same measure takes a value; one with another
 * figure takes that figure, so its name, unit and flag come from the registry too.
 */
export type Versus<K extends FigureKind> =
  /** Last period, the same measure: "up ₹1.20 Cr on Sep"; "₹4.07 Cr in Oct" while this period is still zero */
  | { readonly was: ValueOf<K>; readonly when: MonthWhen }
  /** The plan by today: "40% planned by now, 9 points behind" */
  | { readonly plan: ValueOf<K> }
  /** The whole it is part of: "of 14 projects", "of ₹171.10 Cr contract value" */
  | { readonly of: ValueOf<K> | Figure }
  /** A part of it that matters: "₹2.10 Cr over 90 days". The part's flag lifts this figure's attention. */
  | { readonly part: Figure }
  /** Months of the same measure, oldest first: "up 12% on Sep" */
  | { readonly trend: readonly ValueOf<K>[]; readonly months: readonly string[] };

/** A domain rule's verdict with its reason in words, for a figure whose comparison does not already say why. */
export interface Because {
  readonly level: Attention;
  readonly because: string;
}

/** The facts about one figure. No label, format, unit, tone, size or place: those are the presenter's. */
export interface FigureFacts<Id extends FigureId> {
  readonly id: Id;
  readonly value: ValueOf<KindOf<Id>> | NoValue;
  readonly when?: FigureWhen;
  /** How many things are behind it: "4 open bills" (the measure's items name them) */
  readonly count?: number;
  readonly versus?: Versus<KindOf<Id>>;
  /** A verdict from a domain rule; the measure's own flag or limit needs none */
  readonly attention?: Attention | Because;
  /** A known fault in the records behind it, in words: "BOQ 47% below the contract value". The figure is drawn, marked. */
  readonly caveat?: string;
}

/** Any registered figure, each with its own value type. The API sends these as they are. */
export type Figure = { [Id in FigureId]: FigureFacts<Id> }[FigureId];

/** A slot in a list of figures: `cond && figure(…)` leaves it out. */
export type FigureInput = Figure | false | null | undefined;

/** A bare verdict only beside a comparison, which says why; without one the verdict brings its own words (WCAG 1.4.1). */
type FigureOptions<K extends FigureKind> = { readonly when?: FigureWhen; readonly count?: number; readonly caveat?: string } & (
  | { readonly versus: Versus<K>; readonly attention?: Attention }
  | { readonly versus?: undefined; readonly attention?: Because }
);

/** The one way to state a figure: `figure('clientsOwe', t.outstanding, { versus: { part: figure('clientsOweOver90', t.over90) } })`. */
export function figure<Id extends FigureId>(id: Id, value: ValueOf<KindOf<Id>> | NoValue, opts?: FigureOptions<KindOf<Id>>): FigureFacts<Id> {
  return { id, value, ...opts } as FigureFacts<Id>;
}
