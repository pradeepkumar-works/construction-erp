/**
 * Biometric attendance (v6 item 101): fingerprint or face devices at sites and offices, the user numbers on them
 * matched to employees and workers, and their punches turned into attendance. The parsing and the day's in and out
 * are in the API's `biometric-rules.ts`; this holds the labels and the shapes the screens use.
 */

export const BIOMETRIC_PROTOCOLS = ['ADMS', 'WEBHOOK', 'FILE'] as const;
export type BiometricProtocol = (typeof BIOMETRIC_PROTOCOLS)[number];
export const BIOMETRIC_PROTOCOL_LABELS: Record<BiometricProtocol, string> = {
  ADMS: 'Sends by itself (ADMS: ZKTeco, eSSL)',
  WEBHOOK: 'Sends to a web address (webhook)',
  FILE: 'Punch files imported by hand',
};

export const BIOMETRIC_PUNCH_RESULTS = ['APPLIED', 'UNMATCHED', 'LOCKED', 'SKIPPED'] as const;
export type BiometricPunchResult = (typeof BIOMETRIC_PUNCH_RESULTS)[number];
export const BIOMETRIC_PUNCH_RESULT_LABELS: Record<BiometricPunchResult, string> = {
  APPLIED: 'Marked',
  UNMATCHED: 'Not matched',
  LOCKED: 'Day locked',
  SKIPPED: 'Not marked',
};

export interface BiometricDeviceDto {
  id: string;
  name: string;
  model: string | null;
  protocol: BiometricProtocol;
  serialNo: string | null;
  /** WEBHOOK only: the key the device sends in X-Device-Key */
  apiKey: string | null;
  projectId: string | null;
  projectName: string | null;
  utcOffsetMin: number;
  isActive: boolean;
  lastSeenAt: string | null;
  lastPunchAt: string | null;
  punchesToday: number;
  createdAt: string;
}

/** A user number seen on the devices or matched by HR, with who it is. */
export interface BiometricUserDto {
  pin: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  workerId: string | null;
  workerNo: string | null;
  workerName: string | null;
  /** Punches in the last 30 days, and how many of them are not matched */
  punches: number;
  unmatched: number;
  lastPunchAt: string | null;
}

export interface BiometricPunchDto {
  id: string;
  deviceId: string;
  deviceName: string;
  pin: string;
  /** Who the number is matched to, if anyone */
  personName: string | null;
  personCode: string | null;
  date: string;
  time: string;
  result: BiometricPunchResult;
  note: string | null;
}

/** What a batch of punches did, from a device, the webhook or a file. */
export interface BiometricIngestResultDto {
  received: number;
  added: number;
  duplicates: number;
  applied: number;
  unmatched: number;
  notMarked: number;
  /** Lines of a file that could not be read, with their line numbers */
  errors: string[];
}
