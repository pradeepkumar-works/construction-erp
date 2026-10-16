'use client';

import { createContext, useContext } from 'react';

/**
 * How far from the top of the window a sticky element must stop to sit below what is already stuck there: the app
 * header (56px), plus a page's own sticky bar (the project workspace's tabs). Sticky table headers read it.
 */
export const APP_HEADER_HEIGHT = 56;
export const StickyTopContext = createContext(APP_HEADER_HEIGHT);
export const useStickyTop = () => useContext(StickyTopContext);
