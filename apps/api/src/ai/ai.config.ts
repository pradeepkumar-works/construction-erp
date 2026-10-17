/**
 * Ask Nirmaan settings from the environment (AI item 67). The assistant runs when OPENROUTER_API_KEY or
 * ANTHROPIC_API_KEY is set (or AI_PROVIDER=fake, the scripted stand-in the browser tests use) and AI_DISABLED is not
 * true. With both keys set, OpenRouter wins unless AI_PROVIDER=anthropic.
 */
export type AiEffort = 'low' | 'medium' | 'high';
export type AiProvider = 'openrouter' | 'anthropic' | 'fake';

function providerOf(e: NodeJS.ProcessEnv): AiProvider {
  if (e.AI_PROVIDER === 'fake' || e.AI_PROVIDER === 'anthropic' || e.AI_PROVIDER === 'openrouter') return e.AI_PROVIDER;
  return e.OPENROUTER_API_KEY?.trim() ? 'openrouter' : 'anthropic';
}

/** OpenRouter names Claude `anthropic/claude-opus-5.5`; accept the Anthropic spelling `claude-opus-5-5` too. */
function openRouterModel(name: string): string {
  if (name.includes('/')) return name;
  const m = name.match(/^(claude-[a-z]+)-(\d+)(?:-(\d))?$/);
  return `anthropic/${m ? `${m[1]}-${m[2]}${m[3] ? `.${m[3]}` : ''}` : name}`;
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/** A model as the provider names it. */
export function modelName(name: string, provider: AiProvider): string {
  return provider === 'openrouter' ? openRouterModel(name) : name;
}

export function aiConfig() {
  const e = process.env;
  const effort = e.AI_EFFORT === 'low' || e.AI_EFFORT === 'high' ? e.AI_EFFORT : 'medium';
  const provider = providerOf(e);
  const model = e.AI_MODEL?.trim() || 'claude-opus-5-5';
  const named = (m: string) => modelName(m, provider);
  return {
    provider,
    apiKey: (provider === 'openrouter' ? e.OPENROUTER_API_KEY : e.ANTHROPIC_API_KEY)?.trim() || null,
    model: named(model),
    /** Models a question may name to compare them on the same deployment (scripts/ai-eval.ts); empty = none */
    evalModels: (e.AI_EVAL_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean).map(named),
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
  /** What the gateway billed for the call in US dollars, when it says (OpenRouter does) */
  usd?: number;
}

/** `anthropic/claude-sonnet-5.5` and `claude-sonnet-5-5-20261001` both price as `claude-sonnet-5-5`. */
const priceOf = (model: string) => {
  const key = model.replace(/^.*\//, '').replace(/\./g, '-');
  return Object.entries(PRICES).find(([k]) => key.startsWith(k))?.[1] ?? PRICES['claude-opus-5-5'];
};

/** Cost in paise of one model call: the billed amount when known, else estimated at list prices (an unknown model is priced as Opus). */
export function costPaise(model: string, u: AiUsage, usdInr = aiConfig().usdInr): number {
  const p = priceOf(model);
  const usd = u.usd ?? (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1e6;
  return Math.round(usd * usdInr * 100);
}
