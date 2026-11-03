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
  /** A deep red-brown: the warm dark the taste guide gives in place of violet or rust. */
  OXBLOOD: { light: solid('#3A1A1E'), dark: solid('#1F1012') },
  /** A bone rail (a low-chroma stone, not cream) with near-black words; a neutral near-black on the night. */
  SAND: { light: solid('#EBEAE6'), dark: solid('#151412') },
  SKY: { light: solid('#E9F0FA'), dark: solid('#0C1420') },
  // The gradients stay in one hue and a few steps of lightness, so the rail reads as one colour with depth, never one
  // colour fading into another (taste guide: "nothing fades into anything", no violet).
  /** Pradeep's deep-sea teal across the bar, through three stops; its light end taken down until the menu's captions
   *  read at 4.5:1 (his #016582 and #008FAC give 2.3:1). */
  LAGOON: {
    light: { kind: 'GRADIENT', from: '#012833', via: { color: '#013544', at: 55 }, to: '#004A59', angle: 90 },
    dark: { kind: 'GRADIENT', from: '#011A21', via: { color: '#01232D', at: 55 }, to: '#00313B', angle: 90 },
  },
  DUSK: { light: down('#0B1F3A', '#1B2A3F'), dark: down('#08162B', '#121B28') },
  OCEAN: { light: down('#0B3340', '#0E4544'), dark: down('#07212A', '#08292A') },
  WALNUT: { light: down('#2B1D14', '#3B2A1C'), dark: down('#1A120C', '#22180F') },
  MIDNIGHT: { light: down('#18181B', '#1A2234'), dark: down('#0E0E10', '#121826') },
  DAWN: { light: down('#F4F4F5', '#E8EEF6'), dark: down('#0E0E10', '#10161F') },
};

/** A company's first colour of its own, before it picks: a dark blue, and the same a step lighter as a gradient. */
export const CHROME_START_FILL = {
  SOLID: { kind: 'SOLID', color: '#1D3557' },
  GRADIENT: { kind: 'GRADIENT', from: '#1D3557', to: '#24476B', angle: 180 },
} as const satisfies Record<NavFill['kind'], NavFill>;
