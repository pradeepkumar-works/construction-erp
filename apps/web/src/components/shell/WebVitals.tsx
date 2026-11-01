'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { reportWebVital } from '@/lib/vitals';

/** Measures every page's Web Vitals against the budgets in `lib/vitals.ts`. Draws nothing. */
export function WebVitals() {
  useReportWebVitals(reportWebVital);
  return null;
}
