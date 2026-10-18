import type { PhotoCheckKind, PhotoFlag } from '@erp/shared';

/**
 * The test model's reading of a site photo (AI_PROVIDER=fake), from words in the photo's file name, so the checks, the
 * confidence bar and the pages can be tested without a model. A real model reads the picture.
 */
const WORDS: { word: string; key: PhotoFlag; confidence: number; detail: string; caption?: string }[] = [
  { word: 'nohelmet', key: 'NO_HELMET', confidence: 0.92, detail: 'Two workers on the slab without helmets', caption: 'Workers placing reinforcement on the slab' },
  { word: 'helmetmaybe', key: 'NO_HELMET', confidence: 0.55, detail: 'A worker at the back may be without a helmet' },
  { word: 'noharness', key: 'NO_HARNESS', confidence: 0.88, detail: 'Worker on the slab edge with no harness tied off', caption: 'Shuttering work at the slab edge' },
  { word: 'nobarricade', key: 'NO_BARRICADE', confidence: 0.85, detail: 'Open trench beside the road with no barricade', caption: 'Pipeline trench along the village road' },
  { word: 'badscaffold', key: 'UNSAFE_SCAFFOLD', confidence: 0.8, detail: 'Scaffold with missing planks on the second lift', caption: 'Scaffold on the east face' },
  { word: 'plaster', key: 'OTHER_WORK', confidence: 0.86, detail: 'Photo shows internal plastering; the entry is brickwork', caption: 'Internal plastering in a room' },
  { word: 'dark', key: 'UNCLEAR', confidence: 0.9, detail: 'Taken at night, nothing can be made out', caption: 'A dark site photo' },
  { word: 'screenshot', key: 'NOT_SITE', confidence: 0.95, detail: 'A phone screenshot, not a site photo', caption: 'A phone screenshot' },
];

export function fakePhotoReply(text: string): string {
  const file = (text.match(/File: (.+)/)?.[1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const hits = WORDS.filter((w) => file.includes(w.word));
  const caption = hits.find((h) => h.caption)?.caption ?? 'Site work in progress';
  const reply: Record<string, unknown> = { caption, flags: hits.map(({ key, confidence, detail }) => ({ key, confidence, detail })) };
  if (/Draft the snag/.test(text)) {
    reply.snag = file.includes('leak')
      ? { title: 'Water leak below the bathroom slab', description: 'Damp patch and dripping water on the ceiling below the first-floor bathroom.', location: 'Ground floor, below bathroom', trade: 'Plumbing' }
      : { title: 'Crack in plaster near the window', description: 'A hairline crack runs from the window corner diagonally across the plaster.', location: null, trade: 'Plaster' };
  }
  return JSON.stringify(reply);
}

/**
 * Labelled cases for the checks (item 76's set of 50): a photo's file name, what it is filed with and the flags the
 * record must show. The test model reads the file name, so these test the confidence bar, which flags apply to which
 * record and the switch, not the picture; `photo-eval.ts` scores a real model on real photos.
 */
export const PHOTO_CASES: { file: string; kind: PhotoCheckKind; entry: string | null; expect: PhotoFlag[] }[] = [
  ...['slab', 'column', 'beam', 'footing', 'staircase'].flatMap((w) => [
    { file: `dpr-${w}-nohelmet.jpg`, kind: 'dpr' as const, entry: `Reinforcement for the ${w}`, expect: ['NO_HELMET' as const] },
    { file: `dpr-${w}-ok.jpg`, kind: 'dpr' as const, entry: `Concrete for the ${w}`, expect: [] },
    { file: `dpr-${w}-helmetmaybe.jpg`, kind: 'dpr' as const, entry: `Shuttering for the ${w}`, expect: [] },
  ]),
  ...['east', 'west', 'north', 'south'].flatMap((w) => [
    { file: `progress-${w}-plaster.jpg`, kind: 'progress' as const, entry: `Brickwork, ${w} wall, 12 m3`, expect: ['OTHER_WORK' as const] },
    { file: `progress-${w}-brick.jpg`, kind: 'progress' as const, entry: `Brickwork, ${w} wall, 12 m3`, expect: [] },
    { file: `progress-${w}-noharness.jpg`, kind: 'progress' as const, entry: `Slab edge shuttering, ${w}`, expect: ['NO_HARNESS' as const] },
  ]),
  ...['km2', 'km5', 'km9'].flatMap((w) => [
    { file: `incident-${w}-nobarricade.jpg`, kind: 'incident' as const, entry: `Near miss at the open trench, ${w}`, expect: ['NO_BARRICADE' as const] },
    { file: `incident-${w}-plaster.jpg`, kind: 'incident' as const, entry: `Fall of material at ${w}`, expect: [] },
    { file: `incident-${w}-badscaffold-nohelmet.jpg`, kind: 'incident' as const, entry: `Plank fell from the scaffold at ${w}`, expect: ['NO_HELMET' as const, 'UNSAFE_SCAFFOLD' as const] },
  ]),
  ...['bath', 'kitchen', 'lobby', 'balcony'].flatMap((w) => [
    { file: `snag-${w}-crack.jpg`, kind: 'defect' as const, entry: `Crack in plaster, ${w}`, expect: [] },
    { file: `snag-${w}-dark.jpg`, kind: 'defect' as const, entry: `Damp patch, ${w}`, expect: ['UNCLEAR' as const] },
  ]),
  { file: 'dpr-screenshot.png', kind: 'dpr', entry: 'Excavation for the pump house', expect: ['NOT_SITE'] },
  { file: 'dpr-dark-nohelmet.jpg', kind: 'dpr', entry: 'Night concreting of the raft', expect: ['UNCLEAR', 'NO_HELMET'] },
  { file: 'progress-plaster-noentry.jpg', kind: 'progress', entry: null, expect: [] },
  { file: 'dpr-badscaffold.jpg', kind: 'dpr', entry: 'External plastering from the scaffold', expect: ['UNSAFE_SCAFFOLD'] },
  { file: 'dpr-plaster-entry.jpg', kind: 'dpr', entry: 'Brick masonry on the second floor', expect: ['OTHER_WORK'] },
  { file: 'defect-plaster.jpg', kind: 'defect', entry: 'Crack in the brick wall', expect: [] },
];
