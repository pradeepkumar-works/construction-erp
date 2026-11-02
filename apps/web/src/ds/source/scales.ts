export type Density = 'comfortable' | 'compact';

export const TYPE_SCALE = [12, 14, 16, 20, 24, 30] as const;
export type FontSize = (typeof TYPE_SCALE)[number];

export const LINE_GAP = 8;
export const lineHeightPx = (size: number) => size + LINE_GAP;

export const SPACE = {
  half: [2, 2],
  1: [4, 4],
  2: [8, 4],
  3: [12, 8],
  4: [16, 8],
  5: [20, 16],
  6: [24, 16],
  8: [32, 32],
  12: [48, 48],
} as const satisfies Record<string, readonly [number, number]>;
export type SpaceStep = keyof typeof SPACE;

export const RADIUS = { xs: 2, sm: 4, md: 6, lg: 10, pill: 999 } as const;
export type RadiusName = keyof typeof RADIUS;

export const CONTROL = { sm: [24, 24], md: [32, 28], lg: [40, 35] } as const;

export type FaceName = 'body' | 'display' | 'mono';
export const FACES: Record<FaceName, string> = {
  body: "var(--font-body), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  display: "var(--font-display), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export interface TypeStyle {
  readonly size: FontSize;
  readonly weight: 400 | 500 | 600 | 700 | 800;
  readonly face: FaceName;
  readonly stretchPercent?: number;
  readonly track?: string;
  readonly tabular?: boolean;
}

export const TYPE = {
  caption: { size: 12, weight: 400, face: 'body' },
  label: { size: 12, weight: 500, face: 'body' },
  body: { size: 14, weight: 400, face: 'body' },
  strong: { size: 14, weight: 500, face: 'body' },
  lead: { size: 16, weight: 400, face: 'body' },
  title: { size: 16, weight: 600, face: 'display', track: '-0.01em' },
  /** A card's figure or a panel's lead line: the 20 on the scale between a title and a page heading. */
  subhead: { size: 20, weight: 600, face: 'display', track: '-0.01em' },
  heading: { size: 24, weight: 600, face: 'display', track: '-0.02em' },
  display: { size: 30, weight: 600, face: 'display', track: '-0.02em' },
  figure: { size: 24, weight: 600, face: 'display', track: '-0.02em', tabular: true },
} as const satisfies Record<string, TypeStyle>;
export type TypeName = keyof typeof TYPE;

export const MOTION = {
  fast: '0.1s',
  mid: '0.2s',
  slow: '0.3s',
  easeInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  easeOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
} as const;
