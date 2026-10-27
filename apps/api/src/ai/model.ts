import Anthropic from '@anthropic-ai/sdk';
import type { AiEffort, AiUsage } from './ai.config';
import { fakePhotoReply } from '../photo-checks/fake-photos';
import { fakeHindranceReply } from '../hindrance/fake-hindrance';

type Block = Anthropic.Beta.BetaContentBlock;
export type ModelMessage = Anthropic.Beta.BetaMessageParam;

export interface TurnArgs {
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: ModelMessage[];
  /** The conversation, so a gateway keeps its calls on one provider and the prompt cache stays warm */
  sessionId?: string;
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

/** OpenRouter's Anthropic-compatible Messages API, so the same client and message shapes serve both. */
const OPENROUTER_URL = 'https://openrouter.ai/api';

/** Claude through the Anthropic API, or any model OpenRouter serves (it translates the Messages API for non-Claude models). */
export class MessagesModel implements AiModel {
  private readonly client: Anthropic;

  constructor(
    private readonly provider: 'anthropic' | 'openrouter',
    apiKey: string,
    readonly name: string,
    private readonly effort: AiEffort,
  ) {
    // OpenRouter takes its key as a bearer token; `apiKey: null` keeps a stray ANTHROPIC_API_KEY from being sent there.
    const auth = provider === 'openrouter' ? { apiKey: null, authToken: apiKey, baseURL: OPENROUTER_URL } : { apiKey };
    this.client = new Anthropic({ ...auth, maxRetries: 2, timeout: 120_000 });
  }

  async turn(args: TurnArgs, onText: (text: string) => void, signal: AbortSignal): Promise<TurnResult> {
    const routing =
      this.provider === 'openrouter'
        ? {
            // Only providers that do not keep or train on prompts; the same provider for the whole conversation.
            provider: { data_collection: 'deny' },
            ...(args.sessionId ? { session_id: args.sessionId } : {}),
          }
        : {
            // If the model declines on a policy check, the API retries on its default fallback model in the same call.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default' as const,
          };
    // Adaptive thinking and cache breakpoints are Claude's; other models get only the effort, which OpenRouter maps.
    const claude = this.provider === 'anthropic' || this.name.startsWith('anthropic/');
    const stream = this.client.beta.messages.stream(
      {
        model: this.name,
        max_tokens: 16_000,
        system: [{ type: 'text', text: args.system }],
        tools: args.tools,
        messages: args.messages,
        output_config: { effort: this.effort },
        ...(claude
          ? {
              thinking: { type: 'adaptive' as const },
              // The instructions and tools are the same on every call, so they are read from the cache after the first.
              cache_control: { type: 'ephemeral' as const },
            }
          : {}),
        ...routing,
      },
      { signal },
    );
    stream.on('text', (t) => onText(t));
    // OpenRouter adds what it billed to the final usage; the client keeps only the token counts.
    let usd: number | undefined;
    stream.on('streamEvent', (event) => {
      const cost = event.type === 'message_delta' ? (event.usage as { cost?: unknown }).cost : undefined;
      if (typeof cost === 'number') usd = cost;
    });
    const msg = await stream.finalMessage();
    const u = msg.usage;
    return {
      content: msg.content,
      stopReason: msg.stop_reason,
      model: msg.model,
      usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, usd },
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
    // A page to read (item 70) gets a fixed reading of its kind, so the forms it fills can be tested without a model.
    if (blocks.some((b) => b.type === 'image')) {
      const said = blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
      // A site photo (item 76) is read from words in its file name.
      if (said.includes('Photo check.')) return { content: [{ type: 'text', text: fakePhotoReply(said), citations: null } as Block], stopReason: 'end_turn', usage, model: this.name };
      const kind = blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ').match(/Kind: (\w+)/)?.[1] ?? 'invoice';
      return { content: [{ type: 'text', text: JSON.stringify(FAKE_READS[kind] ?? FAKE_READS.invoice), citations: null } as Block], stopReason: 'end_turn', usage, model: this.name };
    }
    // A DPR remark the hindrance rules could not place (item 123).
    const said = blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
    if (!args.tools.length && said.includes('Hindrance check.')) return { content: [{ type: 'text', text: fakeHindranceReply(said), citations: null } as Block], stopReason: 'end_turn', usage, model: this.name };
    // A call with no tools (a bill-check summary) gets its draft line back.
    if (!args.tools.length) {
      const text = `${(typeof last.content === 'string' ? last.content : '').split('Draft: ').pop()?.trim() ?? ''}`;
      return { content: [{ type: 'text', text, citations: null } as Block], stopReason: 'end_turn', usage, model: this.name };
    }
    if (!result) {
      const texts = blocks.filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text').map((b) => b.text);
      const question = texts[texts.length - 1]?.toLowerCase() ?? (typeof last.content === 'string' ? last.content.toLowerCase() : '');
      // The page or the header's project, from the context note, for the project tools.
      const projectId = texts.join(' ').match(/\/projects\/([0-9a-f-]{36})|\(id ([0-9a-f-]{36})\)/)?.slice(1).find(Boolean);
      const [name, input] = pickTool(question, projectId);
      return { content: [{ type: 'tool_use', id: `toolu_fake_${Date.now()}`, name, input, caller: { type: 'direct' } } as Block], stopReason: 'tool_use', usage, model: this.name };
    }
    const raw = typeof result.content === 'string' ? result.content : (result.content ?? []).map((c) => ('text' in c ? c.text : '')).join('');
    const text = result.is_error ? `I can't show that. ${raw}` : describe(raw);
    for (const part of text.match(/[\s\S]{1,40}/g) ?? []) onText(part);
    return { content: [{ type: 'text', text, citations: null } as Block], stopReason: 'end_turn', usage, model: this.name };
  }
}

const STOP = new Set(['what', 'which', 'show', 'list', 'find', 'about', 'the', 'and', 'for', 'with', 'this', 'that', 'how', 'many', 'are', 'there', 'our', 'any', 'all', 'from', 'me', 'please']);

function pickTool(q: string, projectId?: string): [string, Record<string, unknown>] {
  const draft = fakeDraft(q, projectId);
  if (draft) return draft;
  if (projectId && /summari[sz]e/.test(q)) return ['project_week', { projectId }];
  if (projectId && /changed|last bill/.test(q)) return ['ra_bill_changes', { projectId }];
  if (projectId && /behind|late|delay/.test(q) && !/cost|budget/.test(q)) return ['explain_activities', { projectId }];
  if (/approv/.test(q)) return ['approvals_waiting', {}];
  if (/my work|waiting for me|today/.test(q)) return ['my_work', {}];
  if (/cost|margin|budget/.test(q)) return ['project_cost', projectId ? { projectId } : {}];
  if (/project/.test(q)) return ['list_projects', {}];
  const word = q
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .sort((a, b) => b.length - a.length)[0];
  return ['search_records', { q: word ?? q.slice(0, 40) }];
}

const UNIT = '(bags?|kg|mt|nos|cum|ltr|rmt|sqm)';

/** Drafts from a sentence (item 71), parsed by pattern: enough for the forms to be tested without a model. */
function fakeDraft(q: string, projectId?: string): [string, Record<string, unknown>] | null {
  if (!/^(raise|draft|write|book|log|make|create|fill)\b/.test(q)) return null;
  const code = q.match(/\b([a-z]{2}-\d{4}-\d{2})\b/)?.[1];
  const project = projectId ? { projectId } : code ? { project: code } : {};
  const date = q.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (/\b(mr|material request|indent)\b/.test(q)) {
    const items = [...q.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\s+(?:of\\s+)?(.+?)(?=,| and \\d| for | by | on |$)`, 'g'))].map((m) => ({ quantity: Number(m[1]), unit: m[2], name: m[3].trim() }));
    return ['draft_material_request', { ...project, items, ...(date ? { requiredDate: date } : {}), ...(/urgent/.test(q) ? { priority: 'URGENT' } : {}) }];
  }
  if (/\bexpense\b/.test(q)) {
    const amount = Number(q.match(/(?:₹|rs\.?)\s?([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0);
    return ['draft_expense', { ...project, amount, description: q.match(/\bfor (.+?)(?: paid| by |$)/)?.[1] ?? 'Site expense', category: /diesel|fuel/.test(q) ? 'FUEL' : undefined, paymentMode: /\bupi\b/.test(q) ? 'UPI' : undefined }];
  }
  if (/\bprogress\b/.test(q)) {
    const m = q.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}?\\s+(?:of\\s+)?(.+?)(?= on | at |$)`));
    return ['draft_progress', { ...project, quantity: Number(m?.[1] ?? 0), unit: m?.[2], activity: m?.[3]?.trim() ?? q, ...(date ? { date } : {}) }];
  }
  if (/\b(dpr|daily report)\b/.test(q)) {
    const notes = q.split(':').slice(1).join(':').trim() || q;
    const manpower = [...notes.matchAll(/(\d+)\s+(masons?|helpers?|carpenters?|bar benders?)/g)].map((m) => ({ category: m[2].replace(/s$/, ''), count: Number(m[1]) }));
    return ['draft_dpr', { ...project, workExecuted: notes, manpower, ...(/rain/.test(notes) ? { weather: 'RAINY' } : {}) }];
  }
  if (/\bletter\b/.test(q)) return ['draft_letter', { ...project, subject: q.match(/about (.+)$/)?.[1] ?? 'Site matters', body: 'We write regarding the matter above.' }];
  return null;
}

const LABEL_KEYS = ['title', 'poNo', 'requestNo', 'billLabel', 'billNo', 'woNo', 'mbNo', 'expenseNo', 'inspectionNo', 'riskNo', 'docNo', 'label', 'name', 'code'];

function describe(raw: string): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'I found records, but the list was too long to read here. Ask about one project.';
  }
  const draft = (data as { draft?: { title: string; flags?: unknown[] } } | null)?.draft;
  if (draft) return `I've filled it in: ${draft.title}. Open it to check${draft.flags?.length ? ` the ${draft.flags.length === 1 ? 'one thing marked' : `${draft.flags.length} things marked`}` : ''} and save it.`;
  const linked = linkedRows(data);
  if (!linked.length) return 'I found nothing for that in the records you can see.';
  const lines = linked.slice(0, 5).map((r) => {
    const label = LABEL_KEYS.map((k) => r[k]).find((v) => typeof v === 'string' && v) as string | undefined;
    return `- [${label ?? 'Record'}](${r.href as string})${typeof r.status === 'string' ? ` (${r.status})` : ''}`;
  });
  return `Here is what I found (${linked.length}):\n\n${lines.join('\n')}`;
}

/** Every object with a link, in the order they come, however deep (a digest nests them in sections). */
function linkedRows(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) value.forEach((v) => linkedRows(v, out));
  else if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (typeof row.href === 'string') out.push(row);
    Object.values(row).forEach((v) => (v && typeof v === 'object' ? linkedRows(v, out) : undefined));
  }
  return out;
}

const at = (value: unknown, box: number[], confidence: 'high' | 'low' = 'high') => ({ value, confidence, page: 1, box });

/** What the stand-in "reads" off any page: an invoice and a challan for binding wire from Sahoo Auto Parts, and a drawing. */
const FAKE_READS: Record<string, { fields: Record<string, unknown>; lines: Record<string, unknown>[] }> = {
  invoice: {
    fields: {
      vendorName: at('Sahoo Auto Parts', [60, 40, 420, 80]),
      gstin: at('21BXRPS6612K1Z1', [60, 90, 360, 115]),
      invoiceNo: at('SAP/26-27/0412', [640, 140, 940, 170]),
      invoiceDate: at('10/10/2026', [640, 180, 940, 210], 'low'),
      poNo: at(null, [0, 0, 0, 0], 'low'),
      subtotal: at(3400, [760, 640, 940, 665]),
      cgst: at(306, [760, 670, 940, 695]),
      sgst: at(306, [760, 700, 940, 725]),
      igst: at(null, [0, 0, 0, 0]),
      freight: at(null, [0, 0, 0, 0]),
      total: at(4012, [760, 740, 940, 770]),
    },
    lines: [{ description: at('Binding wire 18 SWG', [60, 420, 420, 445]), hsn: at('7217', [430, 420, 500, 445]), quantity: at(40, [520, 420, 600, 445]), unit: at('Kg', [610, 420, 660, 445]), rate: at(85, [670, 420, 760, 445], 'low'), gstRate: at(18, [770, 420, 820, 445]), amount: at(3400, [840, 420, 940, 445]) }],
  },
  challan: {
    fields: {
      supplierName: at('Sahoo Auto Parts', [60, 40, 420, 80]),
      gstin: at('21BXRPS6612K1Z1', [60, 90, 360, 115]),
      challanNo: at('DC-7781', [640, 140, 900, 170]),
      date: at('2026-10-15', [640, 180, 900, 210]),
      vehicleNo: at('OD02AB1234', [640, 220, 900, 250], 'low'),
      poNo: at(null, [0, 0, 0, 0], 'low'),
    },
    lines: [{ description: at('Binding wire 18 SWG', [60, 420, 420, 445]), quantity: at(20, [520, 420, 600, 445]), unit: at('Kg', [610, 420, 660, 445]) }],
  },
  drawing: {
    fields: {
      drawingNo: at('BL-STR-GF-104', [700, 880, 980, 905]),
      revision: at('R2', [700, 910, 760, 935]),
      title: at('Ground floor column layout', [700, 820, 980, 870]),
      date: at('12.10.2026', [780, 910, 980, 935]),
      scale: at('1:100', [700, 940, 800, 965]),
      issuedBy: at('Mohanty Associates', [700, 780, 980, 810], 'low'),
      discipline: at('Structural', [820, 940, 980, 965]),
    },
    lines: [],
  },
};
