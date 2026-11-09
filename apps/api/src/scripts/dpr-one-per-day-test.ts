/**
 * One DPR per site per day (ARCHITECTURE "Structured DPR"), held by the database as well as the form: two phones
 * draining their outboxes at the same moment for the same site and day get one DPR and a 409, never two DPRs whose
 * quantities count twice. A retry under the same client id still returns the first. Runs on the demo company; the DPRs
 * it makes go again.
 *
 *   DATABASE_URL=… node dist/scripts/dpr-one-per-day-test.js
 */
import { randomUUID } from 'node:crypto';
import type { RoleKey } from '@erp/shared';

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { DprService } = await import('../dpr/dpr.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const dprs = app.get(DprService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };
  const made: string[] = [];

  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(org.id);
      (async () => {
        const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
        const as = (email: string) => {
          const u = users.find((x) => x.email === email);
          if (!u) throw new Error(`No ${email} in the demo company`);
          return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
        };
        const engineer = as('engineer@demo.com');
        const pm = as('pm@demo.com');
        const project = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, code: 'RD-2026-01' } });
        const filed = new Set((await prisma.dailyReport.findMany({ where: { projectId: project.id }, select: { date: true } })).map((d) => d.date.toISOString().slice(0, 10)));
        const free = Array.from({ length: 200 }, (_, i) => new Date(Date.now() - (i + 30) * 86_400_000).toISOString().slice(0, 10)).find((d) => !filed.has(d));
        if (!free) throw new Error('No day without a DPR on the road site');
        const draft = (id: string, by: string) => ({ id, projectId: project.id, date: free, workExecuted: `Embankment filling (from ${by}'s phone)`, submit: false });

        const ids = [randomUUID(), randomUUID()];
        made.push(...ids);
        const out = await Promise.allSettled([dprs.create(engineer, draft(ids[0], 'the engineer')), dprs.create(pm, draft(ids[1], 'the PM'))]);
        const words = out.map((o) => (o.status === 'fulfilled' ? 'created' : `${(o.reason as Error).constructor.name}: ${(o.reason as Error).message}`));
        const count = await prisma.dailyReport.count({ where: { projectId: project.id, date: new Date(`${free}T00:00:00Z`), status: { not: 'REJECTED' } } });
        check(`two phones filing ${free} at once: one DPR`, count === 1, `${count} DPRs; ${words.join('; ')}`);
        check('the other phone is told the day already has one', out.some((o) => o.status === 'rejected' && (o.reason as Error).constructor.name === 'ConflictException' && /already exists/.test((o.reason as Error).message)), words.join('\n  '));

        const winner = out.findIndex((o) => o.status === 'fulfilled');
        if (winner >= 0) {
          const again = await dprs.create(winner === 0 ? engineer : pm, draft(ids[winner], winner === 0 ? 'the engineer' : 'the PM'));
          check('a retry under the same client id returns the first DPR', again.id === ids[winner]);
        }
      })()
        .finally(async () => {
          await prisma.auditLog.deleteMany({ where: { entityId: { in: made } } });
          await prisma.dailyReport.deleteMany({ where: { id: { in: made } } });
        })
        .then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nOne DPR per day: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
