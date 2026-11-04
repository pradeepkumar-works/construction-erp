import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canClearExit, clearanceDues, clearanceLineProblem, clearanceProblem, type ClearanceFact, type ExitClearanceDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { MastersService } from '../masters/masters.service';
import { dateOnly, iso, money } from '../common/serialize';
import { inr } from '../common/submission-titles';
import type { ClearExitDto } from './staff.dto';

const EXIT_TYPES = ['RESIGNED', 'TERMINATED', 'RETIRED'] as const;

/**
 * Exit clearance (no dues; ARCHITECTURE "HR records"): the company's `exitClearance` master items for someone whose exit is
 * recorded, each signed off as cleared, not applicable, or dues the full and final recovers (`clearanceDues`). The
 * settlement is approved only once nothing is left to clear (`clearanceProblem`).
 */
@Injectable()
export class ExitClearanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private access: ProjectAccessService,
    private masters: MastersService,
  ) {}

  /** The items for an employee, by the company's list, with those signed off since the list changed kept too. */
  async factsFor(organizationId: string, employeeId: string, db: Prisma.TransactionClient = this.prisma) {
    const [items, rows] = await Promise.all([
      this.masters.entriesFor(organizationId, 'exitClearance'),
      db.exitClearanceLine.findMany({ where: { employeeId }, include: { clearedBy: { select: { fullName: true } } } }),
    ]);
    const active = items.filter((i) => i.isActive);
    const lines = active.map((i) => ({ code: i.code, name: i.name, row: rows.find((r) => r.code === i.code) ?? null }));
    for (const r of rows) if (!lines.some((l) => l.code === r.code)) lines.push({ code: r.code, name: r.name, row: r });
    const facts: ClearanceFact[] = lines.map((l) => ({ name: l.name, state: l.row?.state ?? 'PENDING', amount: l.row?.amount ? Number(l.row.amount) : null }));
    return { lines, facts };
  }

  private async exitedEmployee(user: RequestUser, employeeId: string) {
    const e = await this.prisma.employee.findFirst({ where: { id: employeeId, ...this.access.staffWhere(user) }, select: { id: true, fullName: true, leftOn: true } });
    if (!e) throw new NotFoundException('Employee not found');
    const exit = await this.prisma.employeeEvent.findFirst({ where: { employeeId, type: { in: [...EXIT_TYPES] } }, select: { id: true } });
    return { ...e, exited: !!exit || !!e.leftOn };
  }

  async get(user: RequestUser, employeeId: string): Promise<ExitClearanceDto> {
    const e = await this.exitedEmployee(user, employeeId);
    const { lines, facts } = await this.factsFor(user.organizationId, e.id);
    return {
      employeeId: e.id,
      leftOn: dateOnly(e.leftOn),
      lines: lines.map((l) => ({
        code: l.code,
        name: l.row?.name ?? l.name,
        state: l.row?.state ?? 'PENDING',
        amount: l.row?.amount ? money(l.row.amount) : null,
        note: l.row?.note ?? null,
        clearedByName: l.row?.clearedBy.fullName ?? null,
        clearedAt: l.row ? iso(l.row.clearedAt) : null,
      })),
      dues: money(clearanceDues(facts)),
      problem: e.exited ? clearanceProblem(facts) : null,
      canClear: e.exited && canClearExit(user.roleKey),
    };
  }

  /** Sign one item off, or take it back to be cleared (PENDING). Not once the settlement is approved. */
  async clear(user: RequestUser, employeeId: string, code: string, dto: ClearExitDto): Promise<ExitClearanceDto> {
    if (!canClearExit(user.roleKey)) throw new ForbiddenException('HR, accounts, stores or the site manager signs exit clearance off');
    const e = await this.exitedEmployee(user, employeeId);
    if (!e.exited) throw new BadRequestException(`Record ${e.fullName}'s resignation or exit first`);
    const settlement = await this.prisma.finalSettlement.findUnique({ where: { employeeId: e.id }, select: { status: true } });
    if (settlement && settlement.status !== 'DRAFT') throw new BadRequestException('The full and final is approved, so the clearance stands as it is');
    const { lines } = await this.factsFor(user.organizationId, e.id);
    const line = lines.find((l) => l.code === code);
    if (!line) throw new NotFoundException('There is no such clearance item. Add it in Masters first.');
    const amount = dto.state === 'DUES' ? (dto.amount ?? null) : null;
    const note = dto.note?.trim() || null;
    const problem = clearanceLineProblem(dto.state, amount, note);
    if (problem) throw new BadRequestException(problem);
    if (dto.state === 'PENDING') await this.prisma.exitClearanceLine.deleteMany({ where: { employeeId: e.id, code } });
    else {
      const data = { name: line.name, state: dto.state, amount, note, clearedById: user.id, clearedAt: new Date() };
      await this.prisma.exitClearanceLine.upsert({ where: { employeeId_code: { employeeId: e.id, code } }, create: { organizationId: user.organizationId, employeeId: e.id, code, ...data }, update: data });
    }
    const words = dto.state === 'PENDING' ? 'taken back to clear' : dto.state === 'DUES' ? `dues of ${inr(amount!)}` : dto.state === 'CLEARED' ? 'cleared' : 'not applicable';
    await this.audit.log(user, 'EMPLOYEE', e.id, 'UPDATED', `Exit clearance: ${line.name}, ${words}`);
    return this.get(user, e.id);
  }
}
