'use client';

import type { ThemeConfig } from 'antd';
import { antdTheme } from '@/ds/antd';
import { FACES } from '@/ds/source/scales';

export type { Appearance } from '@/ds/antd';
export { approveTheme, componentConfig } from '@/ds/antd';
export { TYPE_SCALE } from '@/ds/source/scales';

export const makeTheme = antdTheme;

/** The default look (light, comfortable): the public pages, sign-in, and the app until a user picks otherwise. */
export const appTheme: ThemeConfig = makeTheme({ dark: false, compact: false });

export const DISPLAY_FONT = FACES.display;
