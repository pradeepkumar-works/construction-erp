import Anthropic from '@anthropic-ai/sdk';
import type { AiEffort, AiUsage } from './ai.config';

type Block = Anthropic.Beta.BetaContentBlock;
export type ModelMessage = Anthropic.Beta.BetaMessageParam;

export interface TurnArgs {
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: ModelMessage[];
}

export interface TurnResult {
  content: Block[];
  stopReason: string | null;
  usage: AiUsage;
  /** The model that answered (a refusal fallback can hand over to another) */
  model: string;
}

/** One model call: streams visible text through `onText`, returns the whole message. */
export interface AiModel {
  readonly name: string;
  turn(args: TurnArgs, onText: (text: string) => void, signal: AbortSignal): Promise<TurnResult>;
}

/** Claude through the Anthropic API. */
export class AnthropicModel implements AiModel {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly name: string,
    private readonly effort: AiEffort,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async turn(args: TurnArgs, onText: (text: string) => void, signal: AbortSignal): Promise<TurnResult> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.name,
        max_tokens: 16_000,
        system: [{ type: 'text', text: args.system }],
        tools: args.tools,
        messages: args.messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: this.effort },
        // The instructions and tools are the same on every call, so they are read from the cache after the first.
        cache_control: { type: 'ephemeral' },
        // If the model declines on a policy check, the API retries on its default fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal },
    );
    stream.on('text', (t) => onText(t));
    const msg = await stream.finalMessage();
    const u = msg.usage;
    return {
      content: msg.content,
      stopReason: msg.stop_reason,
      model: msg.model,
      usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    };
  }
}

/**
 * A scripted stand-in for the browser tests and local work without a key (AI_PROVIDER=fake). It calls one real tool
 * picked from the question's words, then lists what came back as links, so the tools, access rules, citations and
 * the panel are exercised end to end without calling a model.
 */
export class FakeModel implements AiModel {
  readonly name = 'fake';

  async turn(args: TurnArgs, onText: (text: string) => void): Promise<TurnResult> {
    const last = args.messages[args.messages.length - 1];
    const blocks = Array.isArray(last.content) ? last.content : [];
    const result = blocks.find((b): b is Anthropic.Beta.BetaToolResultBlockParam => b.type === 'tool_result');
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    if (!result) {
      const question = blocks
        .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text')
        .map((b) => b.text)
        .pop()
        ?.toLowerCase() ?? (typeof last.content === 'string' ? last.content.toLowerCase() : '');
      const [name, input] = pickTool(question);
      return { content: [{ type: 'tool_use', id: `toolu_fake_${Date.now()}`, name, input, caller: { type: 'direct' } } as Block], stopReason: 'tool_use', usage, model: this.name };
    }
    const raw = typeof result.content === 'string' ? result.content : (result.content ?? []).map((c) => ('text' in c ? c.text : '')).join('');
    const text = result.is_error ? `I can't show that. ${raw}` : describe(raw);
    for (const part of text.match(/[\s\S]{1,40}/g) ?? []) onText(part);
    return { content: [{ type: 'text', text, citations: null } as Block], stopReason: 'end_turn', usage, model: this.name };
  }
}

const STOP = new Set(['what', 'which', 'show', 'list', 'find', 'about', 'the', 'and', 'for', 'with', 'this', 'that', 'how', 'many', 'are', 'there', 'our', 'any', 'all', 'from', 'me', 'please']);

function pickTool(q: string): [string, Record<string, unknown>] {
  if (/approv/.test(q)) return ['approvals_waiting', {}];
  if (/my work|waiting for me|today/.test(q)) return ['my_work', {}];
  if (/cost|margin|budget/.test(q)) return ['project_cost', {}];
  if (/project/.test(q)) return ['list_projects', {}];
  const word = q
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .sort((a, b) => b.length - a.length)[0];
  return ['search_records', { q: word ?? q.slice(0, 40) }];
}

const LABEL_KEYS = ['title', 'poNo', 'requestNo', 'billLabel', 'billNo', 'woNo', 'mbNo', 'expenseNo', 'inspectionNo', 'riskNo', 'docNo', 'label', 'name', 'code'];

function describe(raw: string): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'I found records, but the list was too long to read here. Ask about one project.';
  }
  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: Record<string, unknown>[] }).items
      : [];
  const linked = rows.filter((r) => r && typeof r === 'object' && typeof r.href === 'string');
  if (!linked.length) return 'I found nothing for that in the records you can see.';
  const lines = linked.slice(0, 5).map((r) => {
    const label = LABEL_KEYS.map((k) => r[k]).find((v) => typeof v === 'string' && v) as string | undefined;
    return `- [${label ?? 'Record'}](${r.href as string})${typeof r.status === 'string' ? ` (${r.status})` : ''}`;
  });
  return `Here is what I found (${linked.length}):\n\n${lines.join('\n')}`;
}
