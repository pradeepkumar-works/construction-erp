/**
 * A weighbridge indicator's output: most indicators send the weight on the bridge several times a second as
 * a line of text ("ST,GS,+0026420kg", "  26420", STX 26420 ETX, "W: 26.42 t"). `splitFrames` cuts the stream into
 * lines, `readFrame` reads one, and `WeightWatch` turns the stream into weighings: a weight above the empty bridge that
 * holds still for a few seconds, taken once per truck. Pure: tested in `weight-test.ts`.
 */

export interface Frame {
  kg: number;
  /** What the indicator says of it: ST stable, US/MO in motion; null when it does not say */
  stable: boolean | null;
}

export interface Weighing {
  at: Date;
  weightKg: number;
  stableSeconds: number;
}

const STX = '\x02';
const ENDS = /[\r\n\x03]/;

/** The whole lines in what came in so far, and what is left for the next read (a line not yet finished). */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  for (;;) {
    const end = rest.search(ENDS);
    if (end < 0) break;
    const line = rest.slice(0, end);
    rest = rest.slice(end + 1);
    const start = line.lastIndexOf(STX);
    const body = (start >= 0 ? line.slice(start + 1) : line).trim();
    if (body) frames.push(body);
  }
  // A stream with no line ends at all would grow for ever: keep only its tail.
  return { frames, rest: rest.length > 512 ? rest.slice(-128) : rest };
}

/** One line from the indicator as kilograms, or null when it carries no weight (or an overload). */
export function readFrame(line: string): Frame | null {
  const text = line.replace(/[\x00-\x1f\x7f]/g, ' ');
  if (/\b(OL|OVER|ERR)\b/i.test(text)) return null;
  const nums = [...text.matchAll(/([+-])?\s*(\d+(?:[.,]\d+)?)/g)];
  if (!nums.length) return null;
  const m = nums[nums.length - 1];
  let value = Number(m[2].replace(',', '.')) * (m[1] === '-' ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  const after = text.slice((m.index ?? 0) + m[0].length);
  const unit = /^\s*(kg|t|lb)\b/i.exec(after)?.[1]?.toLowerCase() ?? /\b(kg|t|lb)\b/i.exec(text)?.[1]?.toLowerCase();
  if (unit === 't') value *= 1000;
  if (unit === 'lb') value *= 0.45359237;
  const stable = /\b(US|MO|UNST|MOTION)\b/i.test(text) ? false : /\bST\b/i.test(text) ? true : null;
  return { kg: Math.round(value * 1000) / 1000, stable };
}

/**
 * The weighings in a stream of frames. A truck is weighed once it is above `minKg` and the weight holds within the
 * indicator's step (the larger of 10 kg and 0.1%) for `stableSeconds`; the next weighing waits until the bridge has been
 * empty again, so a truck standing on the bridge for minutes is one weighing.
 */
export class WeightWatch {
  private armed = true;
  private start: { at: Date; kg: number } | null = null;

  constructor(
    private minKg: number,
    private stableSeconds: number,
  ) {}

  feed(at: Date, f: Frame): Weighing | null {
    if (f.kg < this.minKg) {
      this.armed = true;
      this.start = null;
      return null;
    }
    if (!this.armed || f.stable === false) {
      this.start = null;
      return null;
    }
    const step = Math.max(10, f.kg * 0.001);
    if (!this.start || Math.abs(f.kg - this.start.kg) > step) {
      this.start = { at, kg: f.kg };
      return null;
    }
    const held = (at.getTime() - this.start.at.getTime()) / 1000;
    if (held < this.stableSeconds) return null;
    this.armed = false;
    this.start = null;
    return { at, weightKg: f.kg, stableSeconds: Math.round(held) };
  }
}
