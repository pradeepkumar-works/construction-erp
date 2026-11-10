import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { recordDbTime, runInTenantTx, tenantRlsEnabled, tenantStore } from './tenant-context';

const NO_ORG = '00000000-0000-0000-0000-000000000000';

/** Does this operation run inside a transaction (an interactive one's `tx`, or a batch)? Prisma marks it on the request. */
const inTransaction = (params: unknown) => Boolean((params as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction);

/**
 * The Prisma client, with the request's organisation handed to Postgres row-level security: each query of a
 * signed-in request runs in a short transaction that first sets `app.org_id`, so a query that forgot its
 * `organizationId` filter still cannot read or write another organisation's rows. Interactive and batch
 * transactions set it once at the start (a nested one, and a query on this client inside one, set it again). Raw
 * queries are not wrapped. `src/scripts/tenant-isolation-test.ts` holds this.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    const base = this as PrismaClient;
    const setOrg = (client: PrismaClient, orgId: string) => client.$executeRaw`SELECT set_config('app.org_id', ${orgId}, TRUE)`;
    const ext = base.$extends({
      query: {
        $allModels: {
          async $allOperations(params) {
            const { args, query } = params;
            const ctx = tenantStore();
            const t0 = performance.now();
            try {
              // A query is left as it is only when it runs inside a transaction, which set app.org_id at its start.
              // Inside a transaction's callback, a query on this client rather than on `tx` runs on another
              // connection where nothing set it, so it is wrapped like any other.
              if (!tenantRlsEnabled() || !ctx?.orgId || inTransaction(params)) return await query(args);
              const [, result] = await base.$transaction([setOrg(base, ctx.orgId), query(args)]);
              return result;
            } finally {
              // Server-Timing's db figure: each top-level operation once (its RLS transaction included).
              if (!ctx?.inTx) recordDbTime(performance.now() - t0);
            }
          },
        },
      },
    });
    const transaction = (arg: unknown, opts?: unknown) => {
      const ctx = tenantStore();
      const orgId = ctx?.orgId;
      // A transaction started inside another one is a connection of its own, so it sets app.org_id too.
      if (!tenantRlsEnabled() || !orgId) return (ext.$transaction as any)(arg, opts);
      // The operations inside run with inTx set and are not timed one by one: the whole transaction counts once.
      const t0 = performance.now();
      const timed = <T>(p: Promise<T>) => p.finally(() => recordDbTime(performance.now() - t0));
      if (typeof arg === 'function') {
        return timed(
          ext.$transaction(async (tx) => {
            await setOrg(tx as unknown as PrismaClient, orgId);
            return runInTenantTx(() => (arg as (tx: unknown) => Promise<unknown>)(tx));
          }, opts as any),
        );
      }
      return timed(runInTenantTx(() => (ext.$transaction as any)([setOrg(base, orgId), ...(arg as unknown[])], opts)).then((r: unknown[]) => r.slice(1)));
    };
    const own = new Set<PropertyKey>(['onModuleInit', 'onModuleDestroy', 'tenantGuardStatus']);
    return new Proxy(ext, {
      get(target, prop, receiver) {
        if (prop === '$transaction') return transaction;
        if (own.has(prop)) return (base as any)[prop].bind(base);
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Does Postgres actually hide other organisations' rows? (`bypassed` = the database role skips row-level security.) */
  async tenantGuardStatus(): Promise<'off' | 'enforced' | 'bypassed'> {
    if (!tenantRlsEnabled()) return 'off';
    // Called on the plain client (see the proxy), so this is the unwrapped $transaction.
    const [, rows] = await this.$transaction([
      this.$executeRaw`SELECT set_config('app.org_id', ${NO_ORG}, TRUE)`,
      this.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Organization"`,
    ]);
    return rows[0].n === 0 ? 'enforced' : 'bypassed';
  }
}
