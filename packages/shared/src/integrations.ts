import type { RoleKey } from './enums';

/**
 * Integration layer (item 139, ARCHITECTURE "Integration layer"). A connection is an outside system the company has
 * joined to Nirmaan: a vendor's cloud that posts to the connection's own web address, or a device on a site's
 * network that a paired Nirmaan Connector reads and sends on. Every message is kept in the log with what was made of
 * it. The API's `integration-rules.ts` holds the secrets, pairing codes and health; this holds the labels and shapes.
 */

export const INTEGRATION_KINDS = ['GENERIC_WEBHOOK', 'CONNECTOR_CHECK', 'MACHINE_FEED', 'GPS_TRACKER', 'FUEL_DISPENSER', 'WEIGHBRIDGE', 'BATCHING_PLANT'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/** How a kind's messages reach Nirmaan: posted to its web address, read on site by a paired Connector, or asked for by Nirmaan. */
export type IntegrationTransport = 'HOOK' | 'CONNECTOR' | 'POLL';

export interface IntegrationKindInfo {
  label: string;
  transport: IntegrationTransport;
  description: string;
  /** Minutes without a message before a working connection shows as quiet */
  quietAfterMin: number;
}

export const INTEGRATION_KIND_INFO: Record<IntegrationKind, IntegrationKindInfo> = {
  GENERIC_WEBHOOK: {
    label: 'Web address for another service',
    transport: 'HOOK',
    description: 'Any service that can post JSON: each message is kept in the log, and a deviceId in it lists the device under Devices.',
    quietAfterMin: 24 * 60,
  },
  CONNECTOR_CHECK: {
    label: 'Connector check',
    transport: 'CONNECTOR',
    description: 'The Connector sends one reading a minute from the computer it runs on, to show it is working.',
    quietAfterMin: 10,
  },
  MACHINE_FEED: {
    label: "Machine maker's feed (AEMP)",
    transport: 'POLL',
    description:
      "The fleet feed a maker gives its machines' owners (AEMP 2.0, ISO 15143-3: CAT, Komatsu, JCB, Volvo, Tata Hitachi and others). Nirmaan asks it every hour for each machine's hour meter, idle hours, fuel and position.",
    quietAfterMin: 3 * 60,
  },
  GPS_TRACKER: {
    label: 'GPS tracker service',
    transport: 'HOOK',
    description:
      "A tracker's service posts each reading as JSON: deviceId (or imei), time, latitude and longitude, ignition, and the hour meter (engineHours) where the tracker reads one. Traccar's event forwarding works as it is.",
    quietAfterMin: 6 * 60,
  },
  FUEL_DISPENSER: {
    label: 'Fuel dispenser',
    transport: 'HOOK',
    description:
      "A site's fuel dispenser or bowser posts each fill as JSON: its id, time, litres, and the machine's tag (RFID, code or number plate) and meter. A fill into a matched machine becomes a fuel issue slip from the site's store.",
    quietAfterMin: 3 * 24 * 60,
  },
  WEIGHBRIDGE: {
    label: 'Weighbridge',
    transport: 'CONNECTOR',
    description:
      "The Connector reads the weighbridge's indicator on its serial port or network address and sends each weight it holds steady. The store makes each truck's ticket from its two weights, and the net weight fills the GRN.",
    quietAfterMin: 2 * 24 * 60,
  },
  BATCHING_PLANT: {
    label: 'Batching plant',
    transport: 'CONNECTOR',
    description:
      "The Connector reads the batch reports the plant's controller writes to a folder on its computer. Each batch, with the materials it weighed, waits on the RMC page to become a truck's challan at those weights.",
    quietAfterMin: 2 * 24 * 60,
  },
};

/** A fuel dispenser's settings: the fuel item it pours, issued from the connection's site. */
export interface FuelDispenserConfig {
  itemId: string;
}

/** How Nirmaan signs in to a maker's feed: a key it is given, a user and password, or OAuth client credentials. */
export const FEED_AUTHS = ['BEARER', 'BASIC', 'OAUTH'] as const;
export type FeedAuth = (typeof FEED_AUTHS)[number];
export const FEED_AUTH_LABELS: Record<FeedAuth, string> = {
  BEARER: 'API key (sent as a bearer token)',
  BASIC: 'User name and password (user:password)',
  OAUTH: 'OAuth client (client id and secret)',
};

/** A maker's feed's settings, kept in the connection's config; the key, password or client secret is its sealed credential. */
export interface MachineFeedConfig {
  /** The fleet snapshot's address, e.g. https://api.example.com/aemp/Fleet/1 */
  url: string;
  auth: FeedAuth;
  /** OAUTH: where the token comes from, the client id and the scope if the maker asks for one */
  tokenUrl?: string;
  clientId?: string;
  scope?: string;
}

/** What one read of a maker's feed did. */
export interface FeedPollResultDto {
  machines: number;
  taken: number;
  duplicates: number;
  failed: number;
  problem: string | null;
}

/** The kind in a connection's web address: GENERIC_WEBHOOK is /hooks/generic-webhook/<secret>. */
export const integrationKindSlug = (kind: IntegrationKind) => kind.toLowerCase().replace(/_/g, '-');
export const integrationKindFromSlug = (slug: string): IntegrationKind | null =>
  INTEGRATION_KINDS.find((k) => integrationKindSlug(k) === slug) ?? null;

export const INTEGRATION_EVENT_STATUSES = ['OK', 'FAILED', 'IGNORED'] as const;
export type IntegrationEventStatus = (typeof INTEGRATION_EVENT_STATUSES)[number];
export const INTEGRATION_EVENT_STATUS_LABELS: Record<IntegrationEventStatus, string> = {
  OK: 'Taken in',
  FAILED: 'Failed',
  IGNORED: 'Not used',
};

export const CONNECTION_HEALTHS = ['NOT_SET_UP', 'LIVE', 'FAILING', 'QUIET', 'OFF'] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTHS)[number];
export const CONNECTION_HEALTH_LABELS: Record<ConnectionHealth, string> = {
  NOT_SET_UP: 'Waiting for the first message',
  LIVE: 'Working',
  FAILING: 'Failing',
  QUIET: 'Quiet',
  OFF: 'Switched off',
};

export const AGENT_STATES = ['WAITING_TO_PAIR', 'CODE_EXPIRED', 'ONLINE', 'OFFLINE', 'REVOKED'] as const;
export type AgentState = (typeof AGENT_STATES)[number];
export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  WAITING_TO_PAIR: 'Waiting to pair',
  CODE_EXPIRED: 'Code expired',
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  REVOKED: 'Removed',
};

/** Connections, Connectors and the log: an admin or management. */
export const canManageIntegrations = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT';

/** How often a Connector asks for its settings (and so says it is alive), and the most readings in one batch. */
export const CONNECTOR_POLL_SECONDS = 60;
export const CONNECTOR_BATCH_MAX = 500;

export interface IntegrationConnectionDto {
  id: string;
  kind: IntegrationKind;
  name: string;
  projectId: string | null;
  projectName: string | null;
  agentId: string | null;
  agentName: string | null;
  config: Record<string, unknown>;
  /** Last four characters of the saved key or password, if one is saved */
  secretLast4: string | null;
  /** HOOK kinds: the web address path with the secret's last four only (the whole secret is shown once) */
  hookPathHint: string | null;
  isActive: boolean;
  health: ConnectionHealth;
  lastEventAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  eventsToday: number;
  devices: number;
  createdAt: string;
}

/** A new connection or a new web address: the secret path is in the answer once and never again. */
export interface IntegrationSecretDto {
  connection: IntegrationConnectionDto;
  /** Path after the API's /api, e.g. /hooks/generic-webhook/8Hq…; null for a Connector kind */
  hookPath: string | null;
}

export interface ConnectorAgentDto {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  state: AgentState;
  pairCodeExpiresAt: string | null;
  pairedAt: string | null;
  lastSeenAt: string | null;
  version: string | null;
  hostname: string | null;
  connections: number;
  createdAt: string;
}

/** A new Connector or a new pairing code: the code is in the answer once. */
export interface ConnectorPairCodeDto {
  agent: ConnectorAgentDto;
  code: string;
  expiresAt: string;
}

export interface DeviceLinkDto {
  id: string;
  connectionId: string;
  connectionName: string;
  kind: IntegrationKind;
  externalId: string;
  label: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  readings: number;
}

export interface IntegrationEventDto {
  id: string;
  connectionId: string | null;
  connectionName: string | null;
  agentName: string | null;
  direction: 'IN' | 'OUT';
  status: IntegrationEventStatus;
  externalId: string | null;
  summary: string;
  detail: unknown;
  createdAt: string;
}

/* ---------- what the Connector and the hooks are sent ---------- */

/** GET /connector/config: who the Connector is and what it reads. */
export interface ConnectorConfigDto {
  agent: { id: string; name: string; organizationName: string };
  pollSeconds: number;
  batchMax: number;
  serverTime: string;
  connections: { id: string; kind: IntegrationKind; name: string; config: Record<string, unknown>; credential: string | null }[];
}

export interface ConnectorReadingResultDto {
  accepted: number;
  duplicates: number;
  failed: number;
  problems: string[];
}

/** POST /hooks/<kind>/<secret> answers with what it did, so a sender's own log shows it. */
export interface HookResultDto {
  status: IntegrationEventStatus;
  summary: string;
}
