/**
 * A salary run's steps taken at the same moment (ARCHITECTURE "Payroll"): two people acting on one run at once get
 * one step done and a refusal, never both. A send-back racing a pay cannot leave a paid run in draft (and a second bank
 * file), and a run is approved and paid once. Runs on the demo company with a run of its own, removed afterwards.
 *
 *   DATABASE_URL=… node dist/scripts/payroll-run-race-test.js
 */
import type { RoleKey } from '@erp/shared';

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { PayrollRunService } = await import('../payroll/payroll-run.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const runs = app.get(PayrollRunService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };
  const settle = async (steps: (() => Promise<unknown>)[]) => {
    const out = await Promise.allSettled(steps.map((s) => s()));
    return { done: out.filter((o) => o.status === 'fulfilled').length, words: out.map((o) => (o.status === 'fulfilled' ? 'done' : `${(o.reason as Error).constructor.name}: ${(o.reason as Error).message}`)) };
  };
  const runIds: string[] = [];

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
        const hr = as('hr@demo.com');
        const md = as('md@demo.com');
        const admin = as('admin@demo.com');
        const accounts = as('accounts@demo.com');
        const taken = new Set((await prisma.payrollRun.findMany({ where: { organizationId: org.id }, select: { month: true } })).map((r) => r.month));
        const [m1, m2] = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].filter((m) => !taken.has(m));
        if (!m2) throw new Error('No free months for the test runs');
        const prepare = async (month: string) => {
          const run = await runs.create(hr, { month });
          runIds.push(run.id);
          await runs.submit(hr, run.id);
          return run.id;
        };

        // 1. One run approved twice at once, then paid twice at once.
        const a = await prepare(m1);
        const approve = await settle([() => runs.approve(md, a), () => runs.approve(admin, a)]);
        check('two approvals at once: one approves, the other is refused', approve.done === 1, approve.words.join('\n  '));
        const pay = await settle([() => runs.pay(accounts, a, { paidOn: todayIn(), paymentRef: 'UTR-RACE-1' }), () => runs.pay(admin, a, { paidOn: todayIn(), paymentRef: 'UTR-RACE-2' })]);
        check('two payments at once: one pays, the other is refused', pay.done === 1, pay.words.join('\n  '));
        const paid = await prisma.auditLog.count({ where: { entityId: a, action: 'PAID' } });
        check('the run is recorded as paid once', paid === 1, `${paid} PAID entries in its history`);

        // 2. Another run sent back while it is being paid.
        const b = await prepare(m2);
        await runs.approve(md, b);
        const race = await settle([() => runs.sendBack(md, b, 'Check the site allowance'), () => runs.pay(accounts, b, { paidOn: todayIn(), paymentRef: 'UTR-RACE-3' })]);
        const after = await prisma.payrollRun.findUniqueOrThrow({ where: { id: b } });
        check('a send-back racing a pay: one of them happens', race.done === 1, race.words.join('\n  '));
        check('and the run is either paid or a draft with no payment on it', (after.status === 'PAID' && !!after.paidOn) || (after.status === 'DRAFT' && !after.paidOn), `status ${after.status}, paid on ${after.paidOn?.toISOString().slice(0, 10) ?? 'none'}`);
      })()
        .finally(async () => {
          await prisma.auditLog.deleteMany({ where: { entityId: { in: runIds } } });
          await prisma.notification.deleteMany({ where: { entityId: { in: runIds } } });
          // The approved run's salary TDS (192) is kept as deductions, which hold their payslips.
          await prisma.tdsDeduction.deleteMany({ where: { payslip: { runId: { in: runIds } } } });
          await prisma.payrollRun.deleteMany({ where: { id: { in: runIds } } });
        })
        .then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nSalary run races: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
