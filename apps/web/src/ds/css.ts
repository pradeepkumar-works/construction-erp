import { mapRoles, resolve, type Mode } from './engine';
import { PALETTE } from './source/palette';
import { CONTROL, MOTION, RADIUS, SPACE, type Density } from './source/scales';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export const colorVar = (path: readonly string[]) => `--c-${path.map(kebab).join('-')}`;
export const spaceVar = (step: string) => `--s-${step}`;
export const radiusVar = (name: string) => `--r-${kebab(name)}`;
export const controlVar = (size: string) => `--h-${size}`;
export const motionVar = (name: string) => `--m-${kebab(name)}`;

function colorDecls(mode: Mode): string[] {
  const out: string[] = [];
  mapRoles((pair, path) => out.push(`${colorVar(path)}:${PALETTE[pair[mode]]}`));
  return out;
}

const sizeDecls = (density: Density) => {
  const r = resolve('light', density);
  return [
    ...Object.keys(SPACE).map((k) => `${spaceVar(k)}:${r.space[k as keyof typeof SPACE]}px`),
    ...Object.keys(CONTROL).map((k) => `${controlVar(k)}:${r.control[k as keyof typeof CONTROL]}px`),
  ];
};

const fixedDecls = () => [
  ...Object.entries(RADIUS).map(([k, v]) => `${radiusVar(k)}:${v}px`),
  ...Object.entries(MOTION).map(([k, v]) => `${motionVar(k)}:${v}`),
];

/**
 * Every token as a CSS variable, for both themes and densities: light and comfortable on `:root`, then only what differs
 * under `[data-theme='dark']` and `[data-density='compact']` (set on `<html>` by the head script and `AppearanceProvider`).
 * Any element can carry `data-theme='dark'` to make its part of the page dark.
 */
export function tokenCss(): string {
  const light = colorDecls('light');
  const dark = colorDecls('dark').filter((d, i) => d !== light[i]);
  const comfortable = sizeDecls('comfortable');
  const compact = sizeDecls('compact').filter((d, i) => d !== comfortable[i]);
  return [
    `:root{${[...light, ...comfortable, ...fixedDecls()].join(';')}}`,
    `[data-theme='dark']{${dark.join(';')}}`,
    `[data-density='compact']{${compact.join(';')}}`,
  ].join('\n');
}
