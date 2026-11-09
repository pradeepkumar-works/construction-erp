/**
 * A decision and what it moves land together (ARCHITECTURE "One approval workflow"): approving a DPR moves
 * its work lines in the same transaction as the DPR's status, so a step that fails on the way leaves the DPR where it
 * was, never APPROVED with its work lines still SUBMITTED (they would never count). Runs on the demo company; the DPR
 * it makes goes again.
 *
 *   DATABASE_URL=… node dist/scripts/approval-hooks-test.js
 */
import { randomUUID } from 'node:crypto';
import type { RoleKey } from '@erp/shared';

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { DprService } = await import('../dpr/dpr.service');
  const { SubmissionLifecycleService } = await import('../common/submission-lifecycle.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const dprs = app.get(DprService);
  const lifecycle = app.get(SubmissionLifecycleService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };
  const id = randomUUID();
  // The DPR's own status step, swapped for a failing one and put back.
  const hooks = (lifecycle as unknown as { statusHooks: Map<string, (...args: unknown[]) => Promise<void>> }).statusHooks;
  const syncLines = hooks.get('DPR')!;

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
        const activity = await prisma.activity.findFirstOrThrow({ where: { projectId: project.id, holdPoint: false, hiddenWork: false, subActivities: { none: {} } }, select: { id: true } });
        const filed = new Set((await prisma.dailyReport.findMany({ where: { projectId: project.id }, select: { date: true } })).map((d) => d.date.toISOString().slice(0, 10)));
        const free = Array.from({ length: 200 }, (_, i) => new Date(Date.now() - (i + 30) * 86_400_000).toISOString().slice(0, 10)).find((d) => !filed.has(d));
        if (!free) throw new Error('No day without a DPR on the road site');

        await dprs.create(engineer, { id, projectId: project.id, date: free, workExecuted: 'Embankment filling', submit: false });
        await prisma.progressEntry.create({ data: { organizationId: org.id, projectId: project.id, activityId: activity.id, date: new Date(`${free}T00:00:00Z`), quantity: '12.500', dailyReportId: id, submittedById: engineer.id } });
        const state = async () => ({
          dpr: (await prisma.dailyReport.findUniqueOrThrow({ where: { id }, select: { status: true } })).status,
          lines: (await prisma.progressEntry.findMany({ where: { dailyReportId: id }, select: { status: true, reviewedById: true } })),
        });

        await lifecycle.submit(engineer, 'DPR', id);
        let s = await state();
        check('submitting the DPR submits its work line', s.dpr === 'SUBMITTED' && s.lines.every((l) => l.status === 'SUBMITTED'), JSON.stringify(s));

        // A step after the status fails before writing anything (a lost connection, a bug in the step).
        hooks.set('DPR', async () => {
          throw new Error('the work lines could not be moved');
        });
        const failed = await lifecycle.review(pm, 'DPR', id, 'APPROVE').then(() => 'approved', (e: Error) => e.message);
        s = await state();
        check('the approver is told the approval did not go through', failed !== 'approved', failed);
        check('the DPR is not approved while its work line is left behind', s.dpr === 'SUBMITTED' && s.lines.every((l) => l.status === 'SUBMITTED'), JSON.stringify(s));

        // The step moves the lines, then something after it fails: nothing it wrote stays.
        hooks.set('DPR', async (...args: unknown[]) => {
          await syncLines(...args);
          throw new Error('a later step failed');
        });
        await lifecycle.review(pm, 'DPR', id, 'APPROVE').catch(() => undefined);
        s = await state();
        check('what the step wrote goes back with the approval', s.dpr === 'SUBMITTED' && s.lines.every((l) => l.status === 'SUBMITTED' && !l.reviewedById), JSON.stringify(s));
        const audit = await prisma.auditLog.count({ where: { entityId: id, action: 'APPROVED' } });
        check('a failed approval leaves no Approved line in the history', audit === 0, `${audit} lines`);

        hooks.set('DPR', syncLines);
        const done = await lifecycle.review(pm, 'DPR', id, 'APPROVE');
        s = await state();
        check('approving again approves the DPR and its work line together', done.status === 'APPROVED' && s.dpr === 'APPROVED' && s.lines.every((l) => l.status === 'APPROVED' && l.reviewedById === pm.id), JSON.stringify(s));
      })()
        .finally(async () => {
          hooks.set('DPR', syncLines);
          await prisma.auditLog.deleteMany({ where: { entityId: id } });
          await prisma.approvalStep.deleteMany({ where: { entityId: id } });
          await prisma.dailyReport.deleteMany({ where: { id } });
        })
        .then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nApproval steps: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
