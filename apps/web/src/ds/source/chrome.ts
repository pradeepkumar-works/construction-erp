import type { NavFill, NavPalette } from '@erp/shared';

/**
 * The menu's curated colours (Menu and names, ARCHITECTURE "Menu colours"): each palette's fill for the light theme and the
 * night, a plain colour or a gradient down the rail. Every one keeps the menu's captions at 4.5:1 (`tokens-check`), and the
 * words, hovers and edges are mixed from its ink, so a palette is only its fill. Quiet is the chrome roles themselves.
 */
export interface ChromePalette {
  readonly light: NavFill;
  readonly dark: NavFill;
}

const solid = (color: string): NavFill => ({ kind: 'SOLID', color });
const down = (from: string, to: string): NavFill => ({ kind: 'GRADIENT', from, to, angle: 180 });

export const CHROME_PALETTES: Record<Exclude<NavPalette, 'QUIET' | 'CUSTOM'>, ChromePalette> = {
  /** Blueprint navy, the rail Nirmaan had before the Quiet look. */
  NAVY: { light: solid('#0B1F3A'), dark: solid('#0A1730') },
  GRAPHITE: { light: solid('#27272A'), dark: solid('#18181B') },
  FOREST: { light: solid('#123A2E'), dark: solid('#0C241D') },
  PLUM: { light: solid('#2E1C45'), dark: solid('#1C1229') },
  /** A warm paper rail with near-black words; a warm near-black on the night. */
  SAND: { light: solid('#F3EEE4'), dark: solid('#16130F') },
  SKY: { light: solid('#E9F0FA'), dark: solid('#0C1420') },
  DUSK: { light: down('#0B1F3A', '#3B2566'), dark: down('#08162B', '#24173F') },
  OCEAN: { light: down('#0B3346', '#0B4A44'), dark: down('#07212E', '#07302C') },
  EMBER: { light: down('#3A1410', '#6A2A12'), dark: down('#22100C', '#3A1A0C') },
  MIDNIGHT: { light: down('#18181B', '#1E2A44'), dark: down('#0E0E10', '#141B2B') },
  DAWN: { light: down('#F4F4F5', '#E5ECF8'), dark: down('#0E0E10', '#101826') },
};

/** A company's first colour of its own, before it picks: a dark blue, and the same into violet as a gradient. */
export const CHROME_START_FILL = {
  SOLID: { kind: 'SOLID', color: '#1D3557' },
  GRADIENT: { kind: 'GRADIENT', from: '#1D3557', to: '#3B2566', angle: 180 },
} as const satisfies Record<NavFill['kind'], NavFill>;
