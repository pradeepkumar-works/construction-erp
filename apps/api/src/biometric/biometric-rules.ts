/**
 * Biometric attendance (v6 item 101): reading what devices send and working out a person's day from their punches.
 * Pure functions, tested by `src/scripts/biometric-test.ts`.
 */

/** A punch as read: the user number on the device and the time on the device's clock, "YYYY-MM-DD HH:mm:ss". */
export interface RawPunch {
  pin: string;
  local: string;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** A real calendar day and time, else null. */
function validLocal(y: number, mo: number, d: number, h: number, mi: number, s: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/** The instant a device-clock time stands for, for a device `offsetMin` minutes ahead of UTC. */
export function localToUtc(local: string, offsetMin: number): Date {
  const m = LOCAL.exec(local)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offsetMin * 60_000);
}

/** The device-clock time of an instant. */
export function utcToLocal(at: Date, offsetMin: number): string {
  const d = new Date(at.getTime() + offsetMin * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** A user number as kept: trimmed, leading zeros dropped from an all-digit number (devices pad them differently). */
export function cleanPin(pin: string): string {
  const p = pin.trim();
  return /^\d+$/.test(p) ? String(BigInt(p)) : p;
}

/**
 * The ATTLOG table an ADMS (iclock) device posts: one punch a line, tab separated: user number, "YYYY-MM-DD HH:mm:ss",
 * then status, verify mode and work code, which attendance does not need. Lines that do not read are left out.
 */
export function parseAdmsAttlog(body: string): RawPunch[] {
  const out: RawPunch[] = [];
  for (const line of body.split(/\r?\n/)) {
    const [pin, time] = line.split('\t');
    if (!pin?.trim() || !time) continue;
    const m = LOCAL.exec(time.trim());
    const local = m && validLocal(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
    if (local) out.push({ pin: cleanPin(pin), local });
  }
  return out;
}

/**
 * A time from a webhook: "YYYY-MM-DD HH:mm(:ss)" or "YYYY-MM-DDTHH:mm(:ss)" on the device's clock, or with a "Z" or
 * "+05:30" offset, which is turned to the device's clock. Null when it does not read.
 */
export function webhookLocal(time: string, offsetMin: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(time.trim());
  if (!m) return null;
  const local = validLocal(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (!local || !m[7]) return local;
  const zone = m[7] === 'Z' ? 0 : (m[7][0] === '-' ? -1 : 1) * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(-2)));
  return utcToLocal(localToUtc(local, zone), offsetMin);
}

/** "2026-10-21", "21/10/2026", "21-10-2026" or "21.10.2026" as [y, m, d]. */
function readDate(s: string): [number, number, number] | null {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return [+m[1], +m[2], +m[3]];
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  return m ? [+m[3], +m[2], +m[1]] : null;
}

/** "9:05", "09:05:30", "9:05 AM" or "6:40 pm" as [h, m, s]. */
function readTime(s: string): [number, number, number] | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(s);
  if (!m) return null;
  let h = +m[1];
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (/p/i.test(m[4]) ? 12 : 0);
  }
  return [h, +m[2], +(m[3] ?? 0)];
}

const PIN_HEAD = /^(pin|user ?(id|no)|emp(loyee)?[ ._]?(no|code|id)|ac[ -]?no\.?|enroll(ment)?[ ._]?(no|id)|badge( ?no)?|card ?no|id|no\.?)$/i;
const WHEN_HEAD = /^(date ?time|punch( ?time)?|time ?stamp|log ?time|check ?time|att(endance)? ?time)$/i;
const DATE_HEAD = /^(date|punch ?date|att(endance)? ?date|log ?date)$/i;
const TIME_HEAD = /^(time|punch ?time|log ?time|in ?time)$/i;

/**
 * A punch file exported from a device or its software (CSV, tab or semicolon separated; the web turns an Excel sheet
 * into CSV first). With a header row, the user number column and either a date-time column or a date and a time column
 * are found by their names; without one, the first column is the user number and the next one (or two) the time.
 */
export function parsePunchFile(text: string): { punches: RawPunch[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? '';
  const sep = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const cells = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
  const head = cells(first);
  const pinCol = head.findIndex((h) => PIN_HEAD.test(h));
  let cols: { pin: number; when?: number; date?: number; time?: number } = { pin: 0, when: 1 };
  let start = 0;
  if (pinCol >= 0) {
    start = lines.indexOf(first) + 1;
    const when = head.findIndex((h) => WHEN_HEAD.test(h));
    const date = head.findIndex((h) => DATE_HEAD.test(h));
    const time = head.findIndex((h, i) => i !== date && TIME_HEAD.test(h));
    cols = when >= 0 ? { pin: pinCol, when } : { pin: pinCol, date, time };
    if (cols.when === undefined && (date < 0 || time < 0)) return { punches: [], errors: ['The file has a user number column but no date and time columns. Name them Date and Time, or DateTime.'] };
  }
  const punches: RawPunch[] = [];
  const errors: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = cells(lines[i]);
    const pin = c[cols.pin] ?? '';
    let d: [number, number, number] | null = null;
    let t: [number, number, number] | null = null;
    if (cols.when !== undefined) {
      const raw = c[cols.when] ?? '';
      const at = raw.search(/[ T]\d{1,2}:/);
      d = at > 0 ? readDate(raw.slice(0, at)) : null;
      t = at > 0 ? readTime(raw.slice(at + 1).trim()) : null;
      if (!d && pinCol < 0 && c.length > 2) {
        // No header: user number, date, time in three columns.
        d = readDate(raw);
        t = readTime(c[cols.when + 1] ?? '');
      }
    } else {
      d = readDate(c[cols.date!] ?? '');
      t = readTime(c[cols.time!] ?? '');
    }
    const local = d && t && validLocal(d[0], d[1], d[2], t[0], t[1], t[2]);
    if (!pin || !local) {
      if (errors.length < 20) errors.push(`Line ${i + 1}: ${!pin ? 'no user number' : 'the date and time do not read'} (${lines[i].trim().slice(0, 60)})`);
      continue;
    }
    punches.push({ pin: cleanPin(pin), local });
  }
  return { punches, errors };
}

/** Punches closer together than this are one punch pressed twice, not an in and an out. */
export const DOUBLE_PUNCH_MINUTES = 10;

/**
 * A person's day from their punches (device-clock "HH:mm:ss", any order): in at the first, out at the last unless it
 * is within DOUBLE_PUNCH_MINUTES of the first; under half of `fullDayHours` between them is a half day.
 */
export function dayFromPunches(times: string[], fullDayHours: number): { inTime: string; outTime: string | null; hours: number | null; status: 'PRESENT' | 'HALF_DAY' } {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + Number(t.slice(6, 8) || 0) / 60;
  const sorted = [...times].sort();
  const inTime = sorted[0];
  const last = sorted[sorted.length - 1];
  const gap = mins(last) - mins(inTime);
  if (gap < DOUBLE_PUNCH_MINUTES) return { inTime, outTime: null, hours: null, status: 'PRESENT' };
  const hours = Math.round((gap / 60) * 100) / 100;
  return { inTime, outTime: last, hours, status: hours < fullDayHours / 2 ? 'HALF_DAY' : 'PRESENT' };
}

/** Pins that read as the number in an employee code (EMP-014 is 14) or a worker number (W-0007 is 7). */
export const codeNumber = (code: string): string | null => {
  const m = /(\d+)\s*$/.exec(code);
  return m ? String(BigInt(m[1])) : null;
};

/* ---------- device commands over ADMS (item 150) ---------- */

/** A command handed to the device and not answered is handed again after this long, up to `COMMAND_TRIES` times. */
export const COMMAND_RESEND_MINUTES = 10;
export const COMMAND_TRIES = 3;
/** Commands handed to a device in one answer to `getrequest` */
export const COMMANDS_PER_CALL = 10;
/** A device's clock is set again when it calls once this long has passed since it was last set */
export const CLOCK_EVERY_HOURS = 24;

/** What the device should hold as a user number: digits only, up to 9 (what ZKTeco and eSSL devices take). */
export function devicePinProblem(pin: string): string | null {
  return /^\d{1,9}$/.test(pin) ? null : `The devices take user numbers of up to 9 digits; ${pin} is not one`;
}

/** A name as the device can show it: plain letters (accents dropped), no tabs or line breaks, up to 24 characters. */
export function deviceUserName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
    .trim();
}

/** The device's own count of seconds for a time on its clock ("YYYY-MM-DD HH:mm:ss"), as `SET OPTION DateTime` takes it. */
export function zkDeviceTime(local: string): number {
  const m = LOCAL.exec(local)!;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return ((y - 2000) * 12 * 31 + (mo - 1) * 31 + (d - 1)) * 86_400 + (h * 60 + mi) * 60 + s;
}

export interface CommandToSend {
  cmdNo: number;
  kind: 'ADD_USER' | 'REMOVE_USER' | 'SET_CLOCK';
  pin: string | null;
  name: string | null;
}

/** One line of the answer to `getrequest`: `C:<number>:<command>`, the command made now (a clock set to this instant). */
export function admsCommandLine(c: CommandToSend, now: Date, offsetMin: number): string {
  const text =
    c.kind === 'ADD_USER'
      ? `DATA UPDATE USERINFO PIN=${c.pin}\tName=${deviceUserName(c.name ?? '')}\tPri=0`
      : c.kind === 'REMOVE_USER'
        ? `DATA DELETE USERINFO PIN=${c.pin}`
        : `SET OPTION DateTime=${zkDeviceTime(utcToLocal(now, offsetMin))}`;
  return `C:${c.cmdNo}:${text}`;
}

export interface CommandReply {
  cmdNo: number;
  code: number;
  cmd: string | null;
}

/** The device's answers posted to `devicecmd`: a line each, `ID=12&Return=0&CMD=DATA`. Lines that do not read are left out. */
export function parseAdmsReplies(body: string): CommandReply[] {
  const out: CommandReply[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = new URLSearchParams(line.trim());
    const id = f.get('ID');
    const ret = f.get('Return');
    if (!id || !/^\d+$/.test(id) || ret === null || !/^-?\d+$/.test(ret.trim())) continue;
    out.push({ cmdNo: Number(id), code: Number(ret), cmd: f.get('CMD') });
  }
  return out;
}

export interface WaitingCommand {
  id: string;
  status: 'QUEUED' | 'SENT';
  attempts: number;
  sentAt: Date | null;
  createdAt: Date;
}

/**
 * Which waiting commands to hand a device that calls now, oldest first and at most `COMMANDS_PER_CALL`: the queued ones,
 * and the sent ones with no answer after `COMMAND_RESEND_MINUTES`; one sent `COMMAND_TRIES` times with no answer is given up.
 */
export function commandsToSend(rows: WaitingCommand[], now: Date): { send: string[]; giveUp: string[] } {
  const giveUp: string[] = [];
  const due: WaitingCommand[] = [];
  for (const r of rows) {
    const unanswered = r.status === 'SENT' && (!r.sentAt || now.getTime() - r.sentAt.getTime() >= COMMAND_RESEND_MINUTES * 60_000);
    if (r.status === 'QUEUED') due.push(r);
    else if (unanswered && r.attempts >= COMMAND_TRIES) giveUp.push(r.id);
    else if (unanswered) due.push(r);
  }
  due.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { send: due.slice(0, COMMANDS_PER_CALL).map((r) => r.id), giveUp };
}

/** What a device's answer says, in words: done, or refused with its code. */
export function replyNote(code: number): string | null {
  if (code === 0) return null;
  return `The device refused it (code ${code}). Check the user number fits the device, or restart it and try again`;
}

/**
 * Where each user number stands on the devices, from its commands oldest first (cancelled ones left out): on the devices
 * whose last finished command for it added it, waiting where one is not answered yet, failed where the last one failed.
 */
export function userCommandState(
  commands: { pin: string | null; deviceId: string; kind: string; status: string }[],
): Map<string, { onDevices: number; commandsWaiting: number; commandsFailed: number }> {
  const last = new Map<string, Map<string, { kind: string; status: string }>>();
  const waiting = new Map<string, number>();
  for (const c of commands) {
    if (!c.pin || c.status === 'CANCELLED') continue;
    if (c.status === 'QUEUED' || c.status === 'SENT') {
      waiting.set(c.pin, (waiting.get(c.pin) ?? 0) + 1);
      continue;
    }
    if (!last.has(c.pin)) last.set(c.pin, new Map());
    last.get(c.pin)!.set(c.deviceId, c);
  }
  const out = new Map<string, { onDevices: number; commandsWaiting: number; commandsFailed: number }>();
  for (const pin of new Set([...last.keys(), ...waiting.keys()])) {
    const ends = [...(last.get(pin)?.values() ?? [])];
    out.set(pin, {
      onDevices: ends.filter((e) => e.status === 'DONE' && e.kind === 'ADD_USER').length,
      commandsWaiting: waiting.get(pin) ?? 0,
      commandsFailed: ends.filter((e) => e.status === 'FAILED').length,
    });
  }
  return out;
}
