/**
 * Attendance stays as payroll paid it (ARCHITECTURE "Attendance"): once a month's salary run is approved or paid, a
 * biometric device that syncs that month late does not change a staff member's day, and an overtime hour from that month
 * can no longer be approved. Runs on the demo company, whose October run is paid; planted rows go again.
 *
 *   DATABASE_URL=… node dist/scripts/attendance-lock-test.js
 */
import type { RoleKey } from '@erp/shared';

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { BiometricService } = await import('../biometric/biometric.service');
  const { StaffService } = await import('../staff/staff.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const biometric = app.get(BiometricService);
  const staff = app.get(StaffService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };
  const cleanup: (() => Promise<unknown>)[] = [];

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
        const admin = as('admin@demo.com');
        const run = await prisma.payrollRun.findFirstOrThrow({ where: { organizationId: org.id, projectId: null, status: { in: ['APPROVED', 'PAID'] } }, orderBy: { month: 'desc' } });
        console.log(`Locked month: ${run.month} (${run.runNo}, ${run.status})`);

        // 1. A punch file synced late for a staff member's day in the locked month.
        const device = await prisma.biometricDevice.findFirstOrThrow({ where: { organizationId: org.id, protocol: 'FILE', isActive: true } });
        const map = await prisma.biometricUser.findFirstOrThrow({ where: { organizationId: org.id, employeeId: { not: null } }, orderBy: { pin: 'asc' } });
        const day = await prisma.staffAttendance.findFirstOrThrow({ where: { employeeId: map.employeeId!, date: { gte: new Date(`${run.month}-01`), lte: new Date(`${run.month}-28`) } }, orderBy: { date: 'asc' } });
        const date = day.date.toISOString().slice(0, 10);
        cleanup.push(() => prisma.biometricPunch.deleteMany({ where: { deviceId: device.id, pin: map.pin, date: day.date, time: { in: ['06:01', '22:59'] } } }));
        cleanup.push(() => prisma.staffAttendance.update({ where: { id: day.id }, data: { checkIn: day.checkIn, checkOut: day.checkOut, status: day.status, overtimeHours: day.overtimeHours, overtimeStatus: day.overtimeStatus, overtimeDecidedById: day.overtimeDecidedById, overtimeDecidedAt: day.overtimeDecidedAt, biometricDeviceId: day.biometricDeviceId } }));
        const result = await biometric.importFile(admin, { deviceId: device.id, text: `${map.pin},${date} 06:01:00\n${map.pin},${date} 22:59:00\n` });
        const after = await prisma.staffAttendance.findUniqueOrThrow({ where: { id: day.id } });
        check(
          `a late punch file leaves ${date} as payroll paid it`,
          after.checkIn?.getTime() === day.checkIn?.getTime() && after.checkOut?.getTime() === day.checkOut?.getTime() && String(after.overtimeHours) === String(day.overtimeHours),
          `check-in ${day.checkIn?.toISOString()} → ${after.checkIn?.toISOString()}, check-out ${day.checkOut?.toISOString()} → ${after.checkOut?.toISOString()}, overtime ${day.overtimeHours} → ${after.overtimeHours}`,
        );
        const punches = await prisma.biometricPunch.findMany({ where: { deviceId: device.id, pin: map.pin, date: day.date, time: { in: ['06:01', '22:59'] } } });
        check('the punches are kept and marked Day locked', punches.length === 2 && punches.every((p) => p.result === 'LOCKED'), `results: ${punches.map((p) => p.result).join(', ')}; applied ${result.applied}`);

        // 2. Overtime from the locked month, waiting for a decision.
        const ot = await prisma.staffAttendance.findFirstOrThrow({ where: { organizationId: org.id, overtimeStatus: { not: null }, date: { gte: new Date(`${run.month}-01`), lte: new Date(`${run.month}-28`) } }, orderBy: { date: 'asc' } });
        cleanup.push(() => prisma.staffAttendance.update({ where: { id: ot.id }, data: { overtimeStatus: ot.overtimeStatus, overtimeDecidedById: ot.overtimeDecidedById, overtimeDecidedAt: ot.overtimeDecidedAt, overtimeRecommendedById: ot.overtimeRecommendedById } }));
        await prisma.staffAttendance.update({ where: { id: ot.id }, data: { overtimeStatus: 'PENDING', overtimeDecidedById: null, overtimeDecidedAt: null, overtimeRecommendedById: null } });
        const outcomes: string[] = [];
        for (const email of ['hr@demo.com', 'admin@demo.com', 'md@demo.com', 'pm@demo.com']) {
          try {
            await staff.decideOvertime(as(email), ot.id, 'APPROVE');
            outcomes.push(`${email}: decided`);
          } catch (e) {
            outcomes.push(`${email}: ${(e as Error).constructor.name} ${(e as Error).message}`);
          }
        }
        const otAfter = await prisma.staffAttendance.findUniqueOrThrow({ where: { id: ot.id } });
        check(`overtime on ${ot.date.toISOString().slice(0, 10)} can no longer be recommended or approved`, otAfter.overtimeStatus === 'PENDING' && !otAfter.overtimeRecommendedById && !otAfter.overtimeDecidedById, outcomes.join('\n  '));
        check('the refusal names the paid run', outcomes.some((o) => o.includes('ConflictException') && o.includes(run.runNo)), outcomes.join('\n  '));
      })()
        .finally(async () => {
          for (const undo of cleanup.reverse()) await undo();
        })
        .then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nAttendance lock: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
