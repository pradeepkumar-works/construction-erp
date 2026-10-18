import { API_URL } from './api';

/**
 * The speed budgets (item 83), Google's "good" thresholds: largest paint within 2.5 s of opening a page, layout shift
 * under 0.1, and the slowest response to a click or key under 200 ms. One constant, so a CI check (item 89) can read it.
 */
export const WEB_VITAL_BUDGETS = { LCP: 2500, CLS: 0.1, INP: 200 } as const;
export type BudgetedVital = keyof typeof WEB_VITAL_BUDGETS;

export interface VitalReport {
  name: BudgetedVital;
  /** Milliseconds, or the unitless layout-shift score for CLS. */
  value: number;
  rating?: string;
  overBudget: boolean;
  /** The page, with record ids left out (`/dpr/:id`). */
  path: string;
  /** One page load's metric; a later report with the same id replaces the earlier one. */
  id: string;
}

const isBudgeted = (name: string): name is BudgetedVital => name in WEB_VITAL_BUDGETS;
const routeOf = (path: string) => path.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id');

let queue: VitalReport[] = [];
let listening = false;
let flushing = false;

/** Sends what has been measured in one beacon, as the tab is hidden or closed (form-encoded, so no CORS preflight). */
function flush() {
  if (!queue.length || typeof navigator.sendBeacon !== 'function') return;
  const body = new URLSearchParams({ data: JSON.stringify(queue) });
  queue = [];
  try {
    navigator.sendBeacon(`${API_URL}/vitals`, body);
  } catch {
    // Reporting is best effort.
  }
}

/**
 * Next's `useReportWebVitals` callback: keeps LCP, CLS and INP against their budgets. In development each one goes to the
 * console; in production they go to `POST /api/vitals` (one log line each) when the tab is hidden.
 */
export function reportWebVital(metric: { name: string; value: number; rating?: string; id: string }) {
  if (!isBudgeted(metric.name)) return;
  const budget = WEB_VITAL_BUDGETS[metric.name];
  const report: VitalReport = {
    name: metric.name,
    value: Math.round(metric.value * (metric.name === 'CLS' ? 1000 : 1)) / (metric.name === 'CLS' ? 1000 : 1),
    rating: metric.rating,
    overBudget: metric.value > budget,
    path: routeOf(window.location.pathname),
    id: metric.id,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[web vitals] ${report.name} ${report.value} on ${report.path} (budget ${budget}${report.overBudget ? ', over' : ''})`);
    return;
  }
  queue = [...queue.filter((r) => r.id !== report.id), report];
  // web-vitals hands over what it still holds (CLS, and LCP when no idle moment came after the first key or click) while the
  // tab is hiding, inside the visibilitychange that flushes: a listener added now would miss that event, and one added
  // earlier may already have run. So a report made while hidden is sent straight after, batched in a microtask.
  if (document.visibilityState === 'hidden') {
    if (!flushing) {
      flushing = true;
      queueMicrotask(() => {
        flushing = false;
        flush();
      });
    }
    return;
  }
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    window.addEventListener('pagehide', flush);
  }
}
