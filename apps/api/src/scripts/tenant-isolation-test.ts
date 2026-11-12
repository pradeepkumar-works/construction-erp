/**
 * One company never sees another's records (ARCHITECTURE "Organisations and tenancy"). Three layers, checked against the
 * demo group, where Demo Buildcon is company B and Demo Infra Projects company A:
 *
 *  1. Every table with an `organizationId` (and Organization) has row-level security on and forced, the
 *     `tenant_isolation` policy, and its lines in `prisma/rls-rollback.sql`; a table without the column is a line of
 *     CHILD_TABLES, read only through its parent.
 *  2. With B's company set, no table shows or changes a row of another company, however the query is made: on its
 *     own, on the client inside a transaction's callback rather than on `tx`, in a nested transaction, or in a batch.
 *  3. B's own people asking the services for A's project, DPR, bill, order or vendor get not found or forbidden,
 *     and A's records are in none of B's lists.
 *
 * Run as the API's database role (row-level security applies), never the owner:
 *
 *   DATABASE_URL=… node dist/scripts/tenant-isolation-test.js
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoleKey } from '@erp/shared';

/** Tables with no `organizationId`: lines of a parent that has one, or rows above any one company. */
const CHILD_TABLES = new Set([
  // Above a company: the group, its admins, a person's one sign-in and the sign-in guard's counts.
  'CompanyGroup', 'GroupAdmin', 'Login', 'AuthAttempt',
  // Lines read only through a parent row that has the company on it.
  'AttendanceLine', 'DebitNoteLine', 'DesignRoundItem', 'DesignSubmissionDoc', 'DocumentRevision', 'LetterSeriesCounter',
  'MaterialRequestItem', 'MeasurementLine', 'ProjectBudgetLine', 'ProjectMember', 'PurchaseOrderLine', 'PushToken',
  'QualityTestReading', 'QuotationLine', 'RaBillHoldRelease', 'RaBillItem', 'RaBillPvLine', 'RaBillSecuredAdvance',
  'RaBillStageLine', 'SubcontractBillLine', 'SubcontractBillMaterial', 'SubcontractBillCharge', 'TransmittalItem', 'VendorBillLine',
  'WorkOrderAmendmentLine', 'WorkOrderLine',
  '_prisma_migrations',
]);
const POLICY = /^\(\(app_current_org\(\) IS NULL\) OR \("?(organizationId|id)"? = app_current_org\(\)\)\)$/;

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { ProjectsService } = await import('../projects/projects.service');
  const { DprService } = await import('../dpr/dpr.service');
  const { RaBillsService } = await import('../ra-bills/ra-bills.service');
  const { PurchaseOrdersService } = await import('../purchasing/purchase-orders.service');
  const { VendorsService } = await import('../vendors/vendors.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };

  // 1. Every company table is covered.
  const tables = await prisma.$queryRaw<{ name: string; org: boolean; rls: boolean; forced: boolean; policy: string | null }[]>`
    SELECT c.relname AS name,
           EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'organizationId') AS org,
           c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
           (SELECT p.qual FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'
              AND p.cmd = 'ALL' AND p.qual = p.with_check) AS policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY 1`;
  const guarded = tables.filter((t) => t.org || t.name === 'Organization');
  const rollback = readFileSync(join(process.cwd(), 'prisma/rls-rollback.sql'), 'utf8');
  const uncovered = guarded.filter((t) => !t.rls || !t.forced || !t.policy || !POLICY.test(t.policy)).map((t) => t.name);
  check(`all ${guarded.length} company tables have row-level security on, forced, and the tenant_isolation policy`, guarded.length > 200 && uncovered.length === 0, `missing on: ${uncovered.join(', ')} (copy a policy from 20261013211500_tenant_rls into the table's migration)`);
  const noUndo = guarded.filter((t) => !['NO FORCE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY'].every((s) => rollback.includes(`ALTER TABLE "${t.name}" ${s};`)) || !rollback.includes(`DROP POLICY IF EXISTS tenant_isolation ON "${t.name}";`)).map((t) => t.name);
  check('each has its lines in prisma/rls-rollback.sql', noUndo.length === 0, `no lines for: ${noUndo.join(', ')}`);
  const strays = tables.filter((t) => !t.org && t.name !== 'Organization' && !CHILD_TABLES.has(t.name)).map((t) => t.name);
  check('a table without organizationId is a known line table', strays.length === 0, `${strays.join(', ')}: add organizationId and a policy, or, for lines read only through their parent, a line in CHILD_TABLES`);

  const a = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const b = await prisma.organization.findFirstOrThrow({ where: { code: 'DEMOBC' } });
  const aProject = await prisma.project.findFirstOrThrow({ where: { organizationId: a.id } });
  const aDpr = await prisma.dailyReport.findFirstOrThrow({ where: { organizationId: a.id } });
  const aBill = await prisma.raBill.findFirstOrThrow({ where: { organizationId: a.id } });
  const aOrder = await prisma.purchaseOrder.findFirstOrThrow({ where: { organizationId: a.id } });
  const aVendor = await prisma.vendor.findFirstOrThrow({ where: { organizationId: a.id } });
  // Without a company set the policies let everything through, so there is something to hide.
  const othersSeen = await prisma.project.count({ where: { organizationId: { not: b.id } } });
  check('with no company set, other companies have rows (so the checks below can fail)', othersSeen > 0, `${othersSeen}`);

  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(b.id);
      (async () => {
        // 2. Nothing of another company shows or changes under B, by any route to the database.
        const leaks: string[] = [];
        await prisma.$transaction(
          async (tx) => {
            for (const t of guarded) {
              const col = t.name === 'Organization' ? 'id' : 'organizationId';
              const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t.name}" WHERE "${col}" <> $1`, b.id);
              if (n > 0) leaks.push(`${t.name} (${n})`);
            }
          },
          { timeout: 120_000 },
        );
        check(`under company B, no table shows a row of another company`, leaks.length === 0, leaks.join(', '));

        const seen = async () => ({
          plain: await prisma.project.findUnique({ where: { id: aProject.id } }),
          clientInTx: await prisma.$transaction(async () => prisma.project.findUnique({ where: { id: aProject.id } })),
          nestedTx: await prisma.$transaction(async () => prisma.$transaction(async (t2) => t2.project.findUnique({ where: { id: aProject.id } }))),
          batchInTx: await prisma.$transaction(async () => (await prisma.$transaction([prisma.project.findUnique({ where: { id: aProject.id } })]))[0]),
          batch: (await prisma.$transaction([prisma.project.findUnique({ where: { id: aProject.id } })]))[0],
        });
        const s = await seen();
        const shown = Object.entries(s).filter(([, v]) => v).map(([k]) => k);
        check('a query with no company filter misses A’s project on its own, in a batch, and inside a transaction on the client or a nested one', shown.length === 0, `seen by: ${shown.join(', ')}`);

        const changed = await prisma.$transaction(async (tx) => {
          const updated = await tx.project.updateMany({ where: { id: aProject.id }, data: { name: aProject.name } });
          const stray = await prisma.vendor.updateMany({ where: { id: aVendor.id }, data: { name: aVendor.name } });
          return updated.count + stray.count;
        });
        check('under company B, A’s rows cannot be changed', changed === 0, `${changed} rows changed`);
        const planted = await prisma
          .$transaction((tx) => tx.$executeRawUnsafe(`UPDATE "Vendor" SET "organizationId" = $1 WHERE id = (SELECT id FROM "Vendor" WHERE "organizationId" = $2 LIMIT 1)`, a.id, b.id).then(() => Promise.reject(new Error('moved'))))
          .catch((e: Error) => (e.message === 'moved' ? 'moved (and put back)' : 'refused'));
        check('nor can one of B’s rows be handed to A', planted === 'refused', planted);

        // 3. B's people asking for A's records.
        const users = await prisma.user.findMany({ where: { organizationId: b.id, isActive: true }, include: { role: true } });
        const as = (email: string) => {
          const u = users.find((x) => x.email === email);
          if (!u) throw new Error(`No ${email} in Demo Buildcon`);
          return { id: u.id, organizationId: b.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName, seesAllProjects: true };
        };
        const admin = as('admin@demo.com');
        const refused = (p: Promise<unknown>) => p.then(() => 'answered', (e: { status?: number; getStatus?: () => number }) => String(e.getStatus?.() ?? e.status ?? e));
        const asked: [string, () => Promise<unknown>][] = [
          ['project', () => app.get(ProjectsService).get(admin, aProject.id)],
          ['DPR', () => app.get(DprService).get(admin, aDpr.id)],
          ['RA bill', () => app.get(RaBillsService).get(admin, aBill.id)],
          ['purchase order', () => app.get(PurchaseOrdersService).get(admin, aOrder.id)],
          ['vendor', () => app.get(VendorsService).get(admin, aVendor.id)],
        ];
        for (const [what, p] of asked) {
          const r = await refused(p());
          check(`B’s admin asking for A’s ${what} gets not found or forbidden`, r === '404' || r === '403', r);
        }
        const lists = await Promise.all([
          app.get(ProjectsService).list(admin, { pageSize: 500 } as never),
          app.get(DprService).list(admin, { pageSize: 500 } as never),
          app.get(RaBillsService).list(admin, { pageSize: 500 } as never),
          app.get(PurchaseOrdersService).list(admin, { pageSize: 500 } as never),
          app.get(VendorsService).list(admin, { pageSize: 500 } as never),
        ]);
        const aIds = new Set([aProject.id, aDpr.id, aBill.id, aOrder.id, aVendor.id]);
        const listed = lists.flatMap((l) => l.items as { id: string }[]).filter((i) => aIds.has(i.id));
        check('none of A’s records is in B’s lists', listed.length === 0 && lists[0].items.length > 0, `${listed.length} of A's in B's lists; B's projects: ${lists[0].items.length}`);
      })().then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nTenant isolation: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
