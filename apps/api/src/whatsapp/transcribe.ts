import { aiConfig } from '../ai/ai.config';

/**
 * Hearing a voice note. TRANSCRIBE_PROVIDER picks who listens:
 *   fake        the test stand-in: a "voice note" whose bytes are `FAKE:<words>` is heard as those words
 *   openrouter  an audio model on OpenRouter (TRANSCRIBE_MODEL, default google/gemini-2.5-flash) with OPENROUTER_API_KEY
 *   sarvam      Sarvam AI's speech-to-text (Indian languages, Hinglish), SARVAM_API_KEY, model SARVAM_STT_MODEL
 * Unset: fake when AI_PROVIDER=fake, otherwise voice notes are not heard and the sender is asked to type.
 */
export type TranscribeProvider = 'fake' | 'openrouter' | 'sarvam';

export interface Heard {
  text: string;
  model: string;
  costPaise: number;
}

const TIMEOUT_MS = 45_000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Sarvam lists ₹30 an hour of audio; a WhatsApp voice note (Opus) is about 2 KB a second. */
const SARVAM_PAISE_PER_SECOND = 3000 / 3600;

const PROMPT =
  'Write down this voice note from a construction site in India word for word, in the language and script it is spoken in (Hindi in Devanagari, Hinglish in Roman letters, English as English). Write figures with the digits 0-9 and keep units as said (bags, cum, kg, ltr). Reply with the words only, no notes.';

export function transcribeProvider(e: NodeJS.ProcessEnv = process.env): TranscribeProvider | null {
  const p = e.TRANSCRIBE_PROVIDER?.trim();
  if (p === 'fake' || p === 'openrouter' || p === 'sarvam') return p;
  return e.AI_PROVIDER === 'fake' ? 'fake' : null;
}

export async function transcribe(bytes: Buffer, mimeType: string): Promise<Heard> {
  const provider = transcribeProvider();
  if (provider === 'fake') {
    const said = bytes.toString('utf8');
    return { text: said.startsWith('FAKE:') ? said.slice(5).trim() : '', model: 'fake', costPaise: 0 };
  }
  if (provider === 'openrouter') return openRouter(bytes, mimeType);
  if (provider === 'sarvam') return sarvam(bytes, mimeType);
  throw new Error('Voice notes are not set up on this server');
}

/** "audio/ogg; codecs=opus" → "ogg" */
const formatOf = (mime: string) => (mime.split(';')[0].split('/')[1] || 'ogg').replace('mpeg', 'mp3').replace('x-wav', 'wav');

async function openRouter(bytes: Buffer, mimeType: string): Promise<Heard> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  const model = process.env.TRANSCRIBE_MODEL?.trim() || 'google/gemini-2.5-flash';
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      provider: { data_collection: 'deny' },
      usage: { include: true },
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'input_audio', input_audio: { data: bytes.toString('base64'), format: formatOf(mimeType) } }] }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${json?.error?.message ?? 'no response'}`);
  const usd = json?.usage?.cost ?? 0;
  return { text: (json?.choices?.[0]?.message?.content ?? '').trim(), model, costPaise: Math.round(usd * aiConfig().usdInr * 100) };
}

async function sarvam(bytes: Buffer, mimeType: string): Promise<Heard> {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new Error('SARVAM_API_KEY is not set');
  const model = process.env.SARVAM_STT_MODEL?.trim() || 'saarika:v2.5';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType.split(';')[0] }), `voice.${formatOf(mimeType)}`);
  form.append('model', model);
  form.append('language_code', 'unknown');
  const res = await fetch(process.env.SARVAM_STT_URL || 'https://api.sarvam.ai/speech-to-text', { method: 'POST', headers: { 'api-subscription-key': key }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = (await res.json().catch(() => null)) as { transcript?: string; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${json?.error?.message ?? 'no response'}`);
  return { text: (json?.transcript ?? '').trim(), model, costPaise: Math.round((bytes.length / 2000) * SARVAM_PAISE_PER_SECOND) };
}
