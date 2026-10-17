/**
 * Ask Nirmaan settings from the environment (AI item 67). The assistant runs when ANTHROPIC_API_KEY is set (or
 * AI_PROVIDER=fake, the scripted stand-in the browser tests use) and AI_DISABLED is not true.
 */
export type AiEffort = 'low' | 'medium' | 'high';

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export function aiConfig() {
  const e = process.env;
  const effort = e.AI_EFFORT === 'low' || e.AI_EFFORT === 'high' ? e.AI_EFFORT : 'medium';
  return {
    provider: e.AI_PROVIDER === 'fake' ? ('fake' as const) : ('anthropic' as const),
    apiKey: e.ANTHROPIC_API_KEY?.trim() || null,
    model: e.AI_MODEL?.trim() || 'claude-opus-5-5',
    effort: effort as AiEffort,
    disabled: e.AI_DISABLED === 'true',
    /** Rupees a company may spend in a calendar month unless an admin sets its own cap */
    defaultMonthlyCapInr: int(e.AI_DEFAULT_MONTHLY_CAP_INR, 5000),
    /** Questions one user may ask in a day */
    dailyQuestions: int(e.AI_DAILY_QUESTIONS, 60),
    /** For the cost estimate: rupees to the dollar */
    usdInr: Number(e.AI_USD_INR) > 0 ? Number(e.AI_USD_INR) : 88,
  };
}

/** The server can call a model. */
export function aiConfigured(): boolean {
  const c = aiConfig();
  return !c.disabled && (c.provider === 'fake' || !!c.apiKey);
}

/** List prices in US dollars per million tokens (October 2026); cache writes are 1.25 × input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface AiUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Estimated cost in paise of one answer's token use at list prices (an unknown model is priced as Opus). */
export function costPaise(model: string, u: AiUsage, usdInr = aiConfig().usdInr): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5'];
  const usd = (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1e6;
  return Math.round(usd * usdInr * 100);
}
