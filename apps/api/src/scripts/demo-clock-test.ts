/**
 * Tests for the demo clock (ARCHITECTURE "Demo clock"). The arithmetic is pure; with `--db` against a seeded database it
 * also moves the demo ten days forward inside a transaction it rolls back, checking every record moved by ten and a
 * customer's company did not:
 *
 *   node dist/scripts/demo-clock-test.js [--db]
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { demoShiftDays, demoShiftMonths, monthPlus } from '../demo/demo-clock-rules';
import { moveDemo, redateDemos } from '../demo/redate';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('the demo moves by the whole days since it was dated, and not at all when current or ahead', () => {
  assert.equal(demoShiftDays('2026-10-20', '2026-11-08'), 19);
  assert.equal(demoShiftDays('2026-11-08', '2026-11-08'), 0);
  assert.equal(demoShiftDays('2026-11-09', '2026-11-08'), 0);
  assert.equal(demoShiftDays('2026-02-27', '2026-03-01'), 2);
});

test('a month field moves by the months the demo’s day crossed, over a year end too', () => {
  assert.equal(demoShiftMonths('2026-10-31', '2026-11-01'), 1);
  assert.equal(demoShiftMonths('2026-11-01', '2026-11-30'), 0);
  assert.equal(demoShiftMonths('2026-12-15', '2027-02-01'), 2);
  assert.equal(monthPlus('2026-10', 1), '2026-11');
  assert.equal(monthPlus('2026-12', 2), '2027-02');
  assert.equal(monthPlus('2026-11', 0), '2026-11');
});

if (process.argv.includes('--db'))
  test('a demo dated ten days back comes forward ten days, and a customer’s company stays where it is', async () => {
    const db = new PrismaClient();
    const ROLLBACK = 'roll back';
    try {
      const demo = await db.organization.findUniqueOrThrow({ where: { code: 'DEMO' }, select: { id: true, demoDatedOn: true } });
      assert.ok(demo.demoDatedOn, 'the seed dates the demo');
      const today = demo.demoDatedOn.toISOString().slice(0, 10);
      const tenBack = new Date(demo.demoDatedOn.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
      const customer = await db.organization.findFirst({ where: { demoDatedOn: null }, select: { id: true } });
      // Everything happens in one transaction that is rolled back, so the database is left as it was.
      await db
        .$transaction(async (tx) => {
          const latest = async (organizationId: string) => (await tx.dailyReport.aggregate({ where: { organizationId }, _max: { date: true } }))._max.date?.getTime() ?? null;
          const stamp = async (organizationId: string) => (await tx.auditLog.aggregate({ where: { organizationId }, _max: { createdAt: true } }))._max.createdAt?.getTime() ?? null;
          const before = await latest(demo.id);
          const loggedBefore = await stamp(demo.id);
          const customerBefore = customer ? await latest(customer.id) : null;
          await moveDemo(tx, demo.id, tenBack, today);
          assert.equal(await latest(demo.id), before! + 10 * 86_400_000, 'the latest daily report moved ten days');
          assert.equal(await stamp(demo.id), loggedBefore! + 10 * 86_400_000, 'timestamps move too');
          if (customer) assert.equal(await latest(customer.id), customerBefore, 'a customer’s company is not moved');
          const after = await tx.organization.findUniqueOrThrow({ where: { id: demo.id }, select: { demoDatedOn: true } });
          assert.equal(after.demoDatedOn!.toISOString().slice(0, 10), today, 'the demo is marked dated today');
          throw new Error(ROLLBACK);
        }, { timeout: 300_000 })
        .catch((e: Error) => {
          if (e.message !== ROLLBACK) throw e;
        });
      assert.deepEqual(await redateDemos(db, today), [], 'a demo dated today is not moved');
    } finally {
      await db.$disconnect();
    }
  });

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}\n${(e as Error).message}\n`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
