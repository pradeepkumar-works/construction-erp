/**
 * Hindi for the site app (v4 item 49), keyed by the English text on screen. Each file covers a group of screens; a
 * key may appear in more than one file only with the same Hindi. `npm run i18n:check` lists English text passed to
 * `t()` that has no Hindi yet.
 */
import { COMMON } from './common';
import { CORE } from './core';
import { SITE } from './site';
import { QUALITY } from './quality';
import { COMMERCIAL } from './commercial';
import { AI } from './ai';

export const HI: Record<string, string> = { ...COMMON, ...CORE, ...SITE, ...QUALITY, ...COMMERCIAL, ...AI };
