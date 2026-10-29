/**
 * Demo biometric device commands (item 150): the gate terminal's clock was set when it called this morning, the staff
 * enrolled on it were put there from Nirmaan with their names, and one more was refused by the device. Runs once per
 * company (when it has no command yet), after the biometric demo.
 */
import { PrismaClient } from '@prisma/client';

export async function seedBiometricCommands(prisma: PrismaClient, organizationId: string) {
  if (await prisma.biometricCommand.count({ where: { organizationId } })) return;
  const gate = await prisma.biometricDevice.findFirst({ where: { organizationId, protocol: 'ADMS', name: 'Gate terminal' }, select: { id: true, createdById: true } });
  if (!gate) return;
  const staff = await prisma.biometricUser.findMany({
    where: { organizationId, employeeId: { not: null } },
    include: { employee: { select: { fullName: true } } },
    orderBy: { pin: 'asc' },
    take: 5,
  });
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000);
  let cmdNo = 0;
  const rows = [
    ...staff.map((u, i) => {
      const failed = i === staff.length - 1;
      return {
        organizationId,
        deviceId: gate.id,
        cmdNo: ++cmdNo,
        kind: 'ADD_USER' as const,
        pin: u.pin,
        name: (u.employee?.fullName ?? '').slice(0, 24),
        status: failed ? ('FAILED' as const) : ('DONE' as const),
        attempts: 1,
        sentAt: ago(120 - i),
        doneAt: ago(120 - i),
        returnCode: failed ? -1 : 0,
        note: failed ? 'The device refused it (code -1). Check the user number fits the device, or restart it and try again' : null,
        createdById: gate.createdById,
        createdAt: ago(121 - i),
      };
    }),
    { organizationId, deviceId: gate.id, cmdNo: ++cmdNo, kind: 'SET_CLOCK' as const, status: 'DONE' as const, attempts: 1, sentAt: ago(3), doneAt: ago(3), returnCode: 0, createdById: gate.createdById, createdAt: ago(3) },
  ];
  await prisma.biometricCommand.createMany({ data: rows });
}
