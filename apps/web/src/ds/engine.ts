import { PALETTE } from './source/palette';
import { ROLES, type Pair, type Roles } from './source/roles';
import { CONTROL, RADIUS, SPACE, TYPE, lineHeightPx, type Density, type RadiusName, type SpaceStep, type TypeName, type TypeStyle } from './source/scales';

export type Mode = 'light' | 'dark';

export type RoleTree<T, R = Roles> = { readonly [K in keyof R]: R[K] extends Pair ? T : RoleTree<T, R[K]> };

export interface Resolved {
  readonly mode: Mode;
  readonly density: Density;
  readonly color: RoleTree<string>;
  readonly space: Readonly<Record<SpaceStep, number>>;
  readonly radius: Readonly<Record<RadiusName, number>>;
  readonly type: Readonly<Record<TypeName, TypeStyle>>;
  readonly control: Readonly<Record<keyof typeof CONTROL, number>>;
}

const isPair = (v: object): v is Pair => 'light' in v && 'dark' in v && typeof (v as Pair).light === 'string';

export function mapRoles<T>(leaf: (pair: Pair, path: readonly string[]) => T): RoleTree<T> {
  const walk = (node: object, path: readonly string[]): unknown =>
    isPair(node) ? leaf(node, path) : Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v as object, [...path, k])]));
  return walk(ROLES, []) as RoleTree<T>;
}

const byDensity = <K extends PropertyKey>(table: Record<K, readonly [number, number]>, density: Density) =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [k, (v as readonly [number, number])[density === 'compact' ? 1 : 0]])) as Record<K, number>;

const cache = new Map<string, Resolved>();

export function resolve(mode: Mode, density: Density = 'comfortable'): Resolved {
  const key = `${mode}-${density}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r: Resolved = {
    mode,
    density,
    color: mapRoles((pair) => PALETTE[pair[mode]]),
    space: byDensity(SPACE, density),
    radius: RADIUS,
    type: TYPE,
    control: byDensity(CONTROL, density),
  };
  cache.set(key, r);
  return r;
}

export const resolveStatic = () => resolve('light', 'comfortable');

export const lineHeightOf = (size: number) => lineHeightPx(size) / size;
