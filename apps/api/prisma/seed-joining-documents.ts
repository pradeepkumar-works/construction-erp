/**
 * Demo joining documents. Everyone on the rolls has their papers verified (the trainees' experience letter set aside as
 * freshers), with three people left open so the checklist and the letter rule show: the latest joiner's certificates
 * wait for HR's check and the experience letter has not come, one PAN card was sent back, and the person with no PAN on
 * record has not handed it in. Each file is a one-page PDF kept in the database. Runs once per company (when it has no
 * joining document yet), after the staff and their HR records.
 */
import { PrismaClient, type EmployeeDocumentStatus } from '@prisma/client';
import { EMPLOYEE_DOCUMENT_INFO, EMPLOYEE_DOCUMENT_KINDS, type EmployeeDocumentKind } from '@erp/shared';
import { textPdf } from '../src/documents/demo-contracts';
import { day } from './seed-clock';

type Plan = Partial<Record<EmployeeDocumentKind, { status: EmployeeDocumentStatus; note?: string } | null>>;

const REQUIRED = EMPLOYEE_DOCUMENT_KINDS.filter((k) => EMPLOYEE_DOCUMENT_INFO[k].required);

export async function seedJoiningDocuments(prisma: PrismaClient, organizationId: string) {
  if (await prisma.employeeDocument.count({ where: { organizationId } })) return;
  const [staff, hr] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId, isActive: true }, select: { id: true, fullName: true, employeeCode: true, employmentType: true, joinedOn: true, pan: true }, orderBy: { employeeCode: 'asc' } }),
    prisma.user.findFirst({ where: { organizationId, email: 'hr@demo.com' }, select: { id: true } }),
  ]);
  if (!staff.length || !hr) return;
  const latest = [...staff].filter((e) => e.joinedOn).sort((a, b) => b.joinedOn!.getTime() - a.joinedOn!.getTime())[0];
  const sentBack = staff.find((e) => e.id !== latest?.id && e.pan && e.employmentType === 'PROBATION') ?? staff.find((e) => e.id !== latest?.id && e.pan && e.employeeCode !== 'EMP-001');

  for (const [i, e] of staff.entries()) {
    const plan: Plan = {};
    for (const k of REQUIRED) plan[k] = { status: 'VERIFIED' };
    if (i % 3 === 0) plan.BANK = { status: 'VERIFIED' };
    if (i % 5 === 1) plan.PG = { status: 'VERIFIED' };
    if (e.employmentType === 'TRAINEE') plan.EXPERIENCE = { status: 'WAIVED', note: 'Fresher, first job' };
    if (e.id === latest?.id) Object.assign(plan, { SSC: { status: 'UPLOADED' }, INTER: { status: 'UPLOADED' }, DEGREE: { status: 'UPLOADED' }, EXPERIENCE: null, BANK: null, PG: null });
    if (e.id === sentBack?.id) plan.PAN = { status: 'REJECTED', note: 'The name on the card does not match the Aadhaar. Send a corrected PAN or an affidavit.' };
    if (!e.pan) plan.PAN = null;

    const joined = e.joinedOn ? Math.round((e.joinedOn.getTime() - day(0).getTime()) / 86_400_000) : -30;
    const filedAgo = Math.min(Math.max(joined - 7, -900), -1);
    for (const [kind, line] of Object.entries(plan) as [EmployeeDocumentKind, Plan[EmployeeDocumentKind]][]) {
      if (!line) continue;
      const label = EMPLOYEE_DOCUMENT_INFO[kind].label;
      const file = line.status === 'WAIVED' ? null : textPdf(`${label}: ${e.fullName}`, [[`${label}`, `${e.fullName} (${e.employeeCode})`, 'Demo copy for the joining documents checklist.']]);
      const at = day(e.id === latest?.id ? -2 : filedAgo);
      const attachment = file
        ? await prisma.attachment.create({
            data: { organizationId, fileName: `${kind.toLowerCase()}-${e.employeeCode}.pdf`, mimeType: 'application/pdf', size: file.length, storagePath: `db:seed/joining-${kind.toLowerCase()}-${e.employeeCode}.pdf`, data: new Uint8Array(file), uploadedById: hr.id, employeeId: e.id, createdAt: at },
          })
        : null;
      const checked = line.status !== 'UPLOADED';
      await prisma.employeeDocument.create({
        data: {
          organizationId,
          employeeId: e.id,
          kind,
          status: line.status,
          attachmentId: attachment?.id ?? null,
          note: line.note ?? null,
          checkedById: checked ? hr.id : null,
          checkedAt: checked ? new Date(at.getTime() + 86_400_000) : null,
          createdAt: at,
        },
      });
    }
  }
}
