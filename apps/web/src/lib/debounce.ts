'use client';

import { useEffect, useState } from 'react';

/** The value a moment after it last changed, so the API is asked once per pause in typing rather than per letter. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
