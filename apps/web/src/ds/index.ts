import type { CSSProperties } from 'react';
import { mapRoles, type RoleTree } from './engine';
import { HAIRLINE_VAR, colorVar, controlVar, leadingVar, motionVar, radiusVar, spaceVar } from './css';
import { CONTROL, FACES, LEADING, MOTION, RADIUS, SPACE, TYPE, lineHeightPx, type RadiusName, type SpaceStep, type TypeName } from './source/scales';
import type { Roles } from './source/roles';

export type { Tone } from './source/roles';
export { TONES } from './source/roles';
export type { RadiusName, SpaceStep, TypeName, Density } from './source/scales';
export type { Mode, Resolved } from './engine';
export { resolve, resolveStatic } from './engine';

export type CssVar = string & { readonly __cssVar: true };
const v = (name: string) => `var(${name})` as CssVar;

const colors = mapRoles((_, path) => v(colorVar(path)));
const { shadow, ...color } = colors;

const mapKeys = <K extends PropertyKey, T>(keys: readonly K[], f: (k: K) => T) => Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<K, T>;

const typeStyle = (name: TypeName): CSSProperties => {
  const s = TYPE[name] as (typeof TYPE)[TypeName] & { stretchPercent?: number; track?: string; tabular?: boolean };
  return {
    fontFamily: FACES[s.face],
    fontSize: s.size,
    lineHeight: `${lineHeightPx(s.size)}px`,
    fontWeight: s.weight,
    ...(s.stretchPercent ? { fontStretch: `${s.stretchPercent}%` } : {}),
    ...(s.track ? { letterSpacing: s.track } : {}),
    ...(s.tabular ? { fontVariantNumeric: 'tabular-nums' } : {}),
  };
};

/**
 * Every value a screen can use, as CSS variables that follow the theme and density with no hook:
 * `style={{ padding: tk.space[3], color: tk.color.text.muted, borderRadius: tk.radius.md, ...tk.type.label }}`.
 * A canvas chart, which cannot read CSS variables, takes `useResolved()` from `@/ds/react`; print takes `resolveStatic()`.
 */
export const tk = {
  color: color as Omit<RoleTree<CssVar, Roles>, 'shadow'>,
  shadow: shadow as RoleTree<CssVar, Roles['shadow']>,
  space: mapKeys(Object.keys(SPACE) as SpaceStep[], (k) => v(spaceVar(String(k)))),
  radius: mapKeys(Object.keys(RADIUS) as RadiusName[], (k) => v(radiusVar(k))),
  control: mapKeys(Object.keys(CONTROL) as (keyof typeof CONTROL)[], (k) => v(controlVar(k))),
  motion: mapKeys(Object.keys(MOTION) as (keyof typeof MOTION)[], (k) => v(motionVar(k))),
  type: mapKeys(Object.keys(TYPE) as TypeName[], typeStyle),
  face: FACES,
  leading: mapKeys(Object.keys(LEADING) as (keyof typeof LEADING)[], (k) => v(leadingVar(k))),
  /** A hairline's width: `tk.line` draws one; this is for an edge that tucks under one (`calc(-1 * ${tk.hairline})`). */
  hairline: v(HAIRLINE_VAR),
  line: (role: keyof Roles['line']) => `${v(HAIRLINE_VAR)} solid ${v(colorVar(['line', role]))}`,
  neg: (step: SpaceStep) => `calc(-1 * ${v(spaceVar(String(step)))})`,
} as const;

export { chromeCss, chromeFillOf, chromeStyle, type ChromeChoice } from './chrome';
export { CHROME_START_FILL } from './source/chrome';
