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
}

const storage = new AsyncLocalStorage<TenantStore>();

/** TENANT_RLS=off turns the database guard off without a migration (the policies then let everything through). */
export const tenantRlsEnabled = () => process.env.TENANT_RLS !== 'off';

/** Express middleware: give every request its own (empty) tenant context. */
export function tenantMiddleware(_req: unknown, _res: unknown, next: () => void) {
  storage.run({}, next);
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
  return storage.run({}, fn);
}
