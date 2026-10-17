import { AsyncLocalStorage } from 'async_hooks';

/**
 * The organisation the current request acts for, carried through async calls. The JWT strategy sets it once the
 * user is known; PrismaService then makes Postgres row-level security see it (`app.org_id`). Unset (public
 * endpoints, scheduled jobs, the seed) means no tenant filter, as before.
 */
interface TenantStore {
  orgId?: string;
  /** Inside a transaction that already set app.org_id. */
  inTx?: boolean;
  /** The request's clock for the Server-Timing header, shared (by reference) with every nested context. */
  timing?: RequestTiming;
}

/** When the request started and the database time it has used so far (summed over queries, which may overlap). */
export interface RequestTiming {
  start: number;
  dbMs: number;
  queries: number;
}

const storage = new AsyncLocalStorage<TenantStore>();

/** TENANT_RLS=off turns the database guard off without a migration (the policies then let everything through). */
export const tenantRlsEnabled = () => process.env.TENANT_RLS !== 'off';

/** Express middleware: give every request its own (empty) tenant context, and start its clock. */
export function tenantMiddleware(_req: unknown, _res: unknown, next: () => void) {
  storage.run({ timing: { start: performance.now(), dbMs: 0, queries: 0 } }, next);
}

/** Count one database operation and its time against the current request, if there is one. */
export function recordDbTime(ms: number) {
  const t = storage.getStore()?.timing;
  if (!t) return;
  t.dbMs += ms;
  t.queries += 1;
}

export function setTenant(orgId: string) {
  const store = storage.getStore();
  if (store) store.orgId = orgId;
}

export const tenantStore = () => storage.getStore();

export function runInTenantTx<T>(fn: () => T): T {
  return storage.run({ ...storage.getStore(), inTx: true }, fn);
}

/** Run something that must see every organisation (e.g. checking an email is unused anywhere). */
export function withoutTenant<T>(fn: () => T): T {
  return storage.run({ timing: storage.getStore()?.timing }, fn);
}
