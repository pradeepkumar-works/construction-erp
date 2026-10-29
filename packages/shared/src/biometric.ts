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

/** Biometric device commands (item 150): what an ADMS device is asked to do when it next calls. */
export const BIOMETRIC_COMMAND_KINDS = ['ADD_USER', 'REMOVE_USER', 'SET_CLOCK'] as const;
export type BiometricCommandKind = (typeof BIOMETRIC_COMMAND_KINDS)[number];
export const BIOMETRIC_COMMAND_KIND_LABELS: Record<BiometricCommandKind, string> = {
  ADD_USER: 'Put on the device',
  REMOVE_USER: 'Take off the device',
  SET_CLOCK: 'Set the clock',
};
export const BIOMETRIC_COMMAND_STATUSES = ['QUEUED', 'SENT', 'DONE', 'FAILED', 'CANCELLED'] as const;
export type BiometricCommandStatus = (typeof BIOMETRIC_COMMAND_STATUSES)[number];
export const BIOMETRIC_COMMAND_STATUS_LABELS: Record<BiometricCommandStatus, string> = {
  QUEUED: 'Waiting for the device',
  SENT: 'Sent, no answer yet',
  DONE: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};
/** The longest name most devices show */
export const DEVICE_NAME_MAX = 24;

export interface BiometricCommandDto {
  id: string;
  deviceId: string;
  deviceName: string;
  kind: BiometricCommandKind;
  pin: string | null;
  name: string | null;
  status: BiometricCommandStatus;
  attempts: number;
  createdAt: string;
  createdByName: string;
  sentAt: string | null;
  doneAt: string | null;
  note: string | null;
}

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
  /** ADMS: commands waiting for the device, and the last ones it refused or never answered (item 150) */
  commandsWaiting: number;
  commandsFailed: number;
  /** ADMS: when its clock was last set */
  clockSetAt: string | null;
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
  /** The matched person has left (an employee or worker no longer active) */
  left: boolean;
  /** ADMS devices the number was last added to, commands for it still waiting, and devices whose last one failed (item 150) */
  onDevices: number;
  commandsWaiting: number;
  commandsFailed: number;
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
