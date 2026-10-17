'use client';

import { createContext, useContext } from 'react';

/** Ask Nirmaan from inside a page (AI item 68): whether it can answer now, and asking it a question in a new conversation. */
export interface AskContextValue {
  available: boolean;
  ask: (question: string) => void;
}

export const AskContext = createContext<AskContextValue>({ available: false, ask: () => undefined });

export const useAsk = () => useContext(AskContext);
