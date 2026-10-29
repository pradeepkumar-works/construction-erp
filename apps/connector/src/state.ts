import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Where the Connector keeps what it needs between runs: its token, the last settings it was sent (so it keeps reading
 * devices while the internet is down), the outbox of readings not yet sent, and its log. On Windows that is
 * %ProgramData%\Nirmaan Connector, so the pairing done by an administrator is the one the background task uses.
 */
export function homeDir(): string {
  const dir =
    process.env.NIRMAAN_CONNECTOR_HOME ||
    (process.platform === 'win32' ? join(process.env.ProgramData || 'C:\\ProgramData', 'Nirmaan Connector') : join(homedir(), '.nirmaan-connector'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export interface Pairing {
  api: string;
  token: string;
  agentId: string;
  name: string;
  pairedAt: string;
}

export interface Connection {
  id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  credential: string | null;
}

export interface Settings {
  agent: { id: string; name: string; organizationName: string };
  pollSeconds: number;
  batchMax: number;
  serverTime: string;
  connections: Connection[];
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Written to a temporary file and moved over the old one, so a power cut never leaves half a file. */
export function writeJsonSafe(file: string, value: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

export const pairingFile = () => join(homeDir(), 'pairing.json');
export const settingsFile = () => join(homeDir(), 'settings.json');
export const outboxFile = () => join(homeDir(), 'outbox.jsonl');
export const logFile = () => join(homeDir(), 'connector.log');

export const readPairing = () => readJson<Pairing>(pairingFile());
export const readSettings = () => readJson<Settings>(settingsFile());

const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** A line on the console and in connector.log, which rolls over to connector.log.1 at 5 MB. */
export function log(message: string) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    const file = logFile();
    if (existsSync(file) && statSync(file).size > LOG_MAX_BYTES) renameSync(file, `${file}.1`);
    appendFileSync(file, line + '\n');
  } catch {
    // The console line is enough when the log cannot be written.
  }
}
