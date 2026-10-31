import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageDeliverables,
  canManagePackages,
  canRaiseRisk,
  canViewEpc,
  canViewPurchaseOrders,
  isGuest,
  type ApprovalCode,
  type ClientInputDto,
  type DeliverableDto,
  type EpcDto,
  type PackageDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, formatDay, fxRate, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { RisksService } from '../risks/risks.service';
import { clientInputOverdue, deliverableLate, deliverableStatus, disciplineSummary, packageStatus } from './epc-rules';
import { SaveClientInputDto, SaveDeliverableDto, SavePackageDto } from './epc.dto';

const PACKAGE_INCLUDE = {
  stages: true,
  workElement: { select: { code: true, name: true } },
  vendor: { select: { name: true } },
  purchaseOrder: { select: { poNo: true } },
} satisfies Prisma.ProcurementPackageInclude;
type PackageRow = Prisma.ProcurementPackageGetPayload<{ include: typeof PACKAGE_INCLUDE }>;

const DELIVERABLE_INCLUDE = {
  workElement: { select: { code: true, name: true } },
  document: { select: { docNo: true, currentRevision: { select: { revision: true } } } },
} satisfies Prisma.EngineeringDeliverableInclude;
type DeliverableRow = Prisma.EngineeringDeliverableGetPayload<{ include: typeof DELIVERABLE_INCLUDE }>;

const optDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? parseDate(v) : null);
const codeCompare = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en', { numeric: true });

/**
 * EPC packages and engineering deliverables (ARCHITECTURE "EPC"): the project's Engineering and packages tab.
 * Deliverables are kept by document control, packages by procurement and the project's managers, client inputs (milestones
 * the client owns) by anyone on the project, who can record a late one as a delay in the register. The arithmetic is in
 * `epc-rules.ts`.
 */
@Injectable()
export class EpcService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private risks: RisksService,
  ) {}

  private async assertView(user: RequestUser, projectId: string) {
    if (!canViewEpc(user.roleKey)) throw new ForbiddenException('Your role cannot see engineering and packages');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async get(user: RequestUser, projectId: string): Promise<EpcDto> {
    await this.assertView(user, projectId);
    const today = todayIn();
    const [project, deliverables, packages, inputs, stages] = await Promise.all([
      this.prisma.project.findFirstOrThrow({ where: { id: projectId }, select: { contractModel: true, currency: true, exchangeRate: true } }),
      this.prisma.engineeringDeliverable.findMany({ where: { projectId }, include: DELIVERABLE_INCLUDE }),
      this.prisma.procurementPackage.findMany({ where: { projectId }, include: PACKAGE_INCLUDE }),
      this.prisma.milestone.findMany({ where: { projectId, byClient: true }, include: { delay: { select: { riskNo: true } } }, orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.billingStage.findMany({ where: { projectId, deliverableIds: { isEmpty: false } }, select: { name: true, deliverableIds: true, component: { select: { code: true } } } }),
    ]);
    const seeValues = canViewPurchaseOrders(user.roleKey);
    const releases = (id: string) => stages.filter((s) => s.deliverableIds.includes(id)).map((s) => `${s.component.code} ${s.name}`);
    const deliverableDtos = deliverables.sort(codeCompare).map((d) => this.deliverableDto(d, today, releases(d.id)));
    const packageDtos = packages.sort(codeCompare).map((p) => this.packageDto(p, today, seeValues));
    const clientInputs: ClientInputDto[] = inputs.map((m) => ({
      id: m.id,
      name: m.name,
      dueDate: dateOnly(m.dueDate),
      achievedOn: dateOnly(m.achievedOn),
      note: m.note,
      overdueDays: clientInputOverdue({ dueDate: dateOnly(m.dueDate), achievedOn: dateOnly(m.achievedOn) }, today),
      delayId: m.delayId,
      delayNo: m.delay?.riskNo ?? null,
    }));
    const approved = deliverableDtos.filter((d) => d.status === 'APPROVED').length;
    return {
      projectId,
      contractModel: project.contractModel,
      currency: project.currency,
      exchangeRate: fxRate(project.exchangeRate),
      summary: {
        disciplines: disciplineSummary(deliverableDtos),
        deliverables: deliverableDtos.length,
        approved,
        engineeringPct: deliverableDtos.length ? Math.round((approved / deliverableDtos.length) * 1000) / 10 : 0,
        packages: packageDtos.length,
        delivered: packageDtos.filter((p) => p.forecastFrom === 'DELIVERED').length,
        late: packageDtos.filter((p) => p.lateDays !== null).length,
        clientInputsOverdue: clientInputs.filter((c) => c.overdueDays !== null).length,
      },
      deliverables: deliverableDtos,
      packages: packageDtos,
      clientInputs,
      canEditDeliverables: canManageDeliverables(user.roleKey),
      canEditPackages: canManagePackages(user.roleKey),
      canEditClientInputs: !isGuest(user.roleKey),
      canRecordDelay: canRaiseRisk(user.roleKey),
    };
  }

  private deliverableDto(d: DeliverableRow, today: string, releases: string[]): DeliverableDto {
    const plannedSubmitOn = dateOnly(d.plannedSubmitOn);
    const plannedApprovalOn = dateOnly(d.plannedApprovalOn);
    const late = deliverableLate({ status: d.status, plannedSubmitOn, plannedApprovalOn }, today);
    return {
      id: d.id,
      workElementId: d.workElementId,
      workElementLabel: d.workElement ? `${d.workElement.code} ${d.workElement.name}` : null,
      discipline: d.discipline,
      code: d.code,
      title: d.title,
      documentId: d.documentId,
      documentNo: d.document?.docNo ?? null,
      documentRevision: d.document?.currentRevision?.revision ?? null,
      plannedSubmitOn,
      plannedApprovalOn,
      submittedOn: dateOnly(d.submittedOn),
      revision: d.revision,
      approvalCode: (d.approvalCode as ApprovalCode | null) ?? null,
      approvedOn: dateOnly(d.approvedOn),
      status: d.status,
      note: d.note,
      ...late,
      releases,
    };
  }

  private packageDto(p: PackageRow, today: string, seeValues: boolean): PackageDto {
    const status = packageStatus(
      {
        stages: p.stages.map((s) => ({ stage: s.stage, plannedOn: dateOnly(s.plannedOn), actualOn: dateOnly(s.actualOn) })),
        neededOn: dateOnly(p.neededOn),
        vessel: p.vessel,
        billOfLading: p.billOfLading,
        eta: dateOnly(p.eta),
        portToSiteDays: p.portToSiteDays,
      },
      today,
      formatDay,
    );
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      discipline: p.discipline,
      workElementId: p.workElementId,
      workElementLabel: p.workElement ? `${p.workElement.code} ${p.workElement.name}` : null,
      vendorId: p.vendorId,
      vendorName: p.vendor?.name ?? null,
      purchaseOrderId: p.purchaseOrderId,
      poNo: p.purchaseOrder?.poNo ?? null,
      scope: p.scope,
      value: seeValues ? money(p.value) : null,
      neededOn: dateOnly(p.neededOn),
      vessel: p.vessel,
      billOfLading: p.billOfLading,
      eta: dateOnly(p.eta),
      portToSiteDays: p.portToSiteDays,
      note: p.note,
      ...status,
    };
  }

  // Deliverables

  private async assertElement(projectId: string, workElementId: string | null | undefined) {
    if (workElementId && !(await this.prisma.workElement.count({ where: { id: workElementId, projectId } }))) throw new BadRequestException('Choose a component of this project');
  }

  async saveDeliverable(user: RequestUser, projectId: string, dto: SaveDeliverableDto) {
    if (!canManageDeliverables(user.roleKey)) throw new ForbiddenException('Your role cannot change engineering deliverables');
    await this.access.assertCanAccessProject(user, projectId);
    await this.assertElement(projectId, dto.workElementId);
    if (dto.documentId && !(await this.prisma.document.count({ where: { id: dto.documentId, projectId } }))) throw new BadRequestException('Choose a document of this project');
    const existing = dto.id ? await this.prisma.engineeringDeliverable.findFirst({ where: { id: dto.id, projectId } }) : null;
    if (dto.id && !existing) throw new NotFoundException('Deliverable not found');
    const pick = <K extends 'submittedOn' | 'approvedOn' | 'approvalCode'>(k: K) => (dto[k] !== undefined ? dto[k] : existing ? (k === 'approvalCode' ? existing.approvalCode : dateOnly(existing[k] as Date | null)) : null) as string | null;
    const submittedOn = pick('submittedOn');
    const approvalCode = pick('approvalCode');
    const approvedOn = pick('approvedOn');
    if (approvalCode && !submittedOn) throw new BadRequestException('Give the day it was submitted before the code it came back with');
    if ((approvalCode === 'C' || approvalCode === 'D') && approvedOn) throw new BadRequestException(`Code ${approvalCode} sends it back, so clear the approval date or change the code`);
    if ((approvalCode === 'A' || approvalCode === 'B') && !approvedOn) throw new BadRequestException('Give the day it was approved');
    if (approvedOn && submittedOn && approvedOn < submittedOn) throw new BadRequestException('It cannot be approved before it was submitted');
    for (const d of [submittedOn, approvedOn]) if (d && d > todayIn()) throw new BadRequestException('A submission or approval cannot be dated after today');
    const data = {
      discipline: dto.discipline,
      code: dto.code,
      title: dto.title,
      workElementId: dto.workElementId !== undefined ? dto.workElementId : undefined,
      documentId: dto.documentId !== undefined ? dto.documentId : undefined,
      plannedSubmitOn: optDate(dto.plannedSubmitOn),
      plannedApprovalOn: optDate(dto.plannedApprovalOn),
      submittedOn: submittedOn ? parseDate(submittedOn) : null,
      revision: dto.revision !== undefined ? dto.revision : undefined,
      approvalCode,
      approvedOn: approvedOn ? parseDate(approvedOn) : null,
      status: deliverableStatus({ submittedOn, approvalCode, approvedOn }),
      note: dto.note !== undefined ? dto.note : undefined,
    };
    try {
      const row = existing
        ? await this.prisma.engineeringDeliverable.update({ where: { id: existing.id }, data })
        : await this.prisma.engineeringDeliverable.create({
            data: { ...data, organizationId: user.organizationId, projectId, sortOrder: await this.prisma.engineeringDeliverable.count({ where: { projectId } }) },
          });
      const approvedNow = row.status === 'APPROVED' && existing?.status !== 'APPROVED';
      await this.audit.log(user, 'ENGINEERING_DELIVERABLE', row.id, existing ? (approvedNow ? 'APPROVED' : 'UPDATED') : 'CREATED', `${row.code} ${row.title}`);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`There is already a deliverable ${dto.code} on this project`);
      throw e;
    }
    return this.get(user, projectId);
  }

  /**
   * A design submission's round went to the client or came back with its code: each deliverable that
   * names one of its documents takes the day, the document's revision and the code, under the same status rule as an
   * edit by hand. Returns how many followed.
   */
  async followDesignRound(user: RequestUser, projectId: string, sent: { documentId: string; revision: string }[], r: { submittedOn: string; code: string | null; reviewedOn: string | null }) {
    const byDoc = new Map(sent.map((x) => [x.documentId, x.revision]));
    const rows = await this.prisma.engineeringDeliverable.findMany({ where: { projectId, documentId: { in: [...byDoc.keys()] } }, select: { id: true, code: true, title: true, documentId: true, status: true } });
    for (const d of rows) {
      const approvedOn = r.code === 'A' || r.code === 'B' ? r.reviewedOn : null;
      const status = deliverableStatus({ submittedOn: r.submittedOn, approvalCode: r.code, approvedOn });
      await this.prisma.engineeringDeliverable.update({
        where: { id: d.id },
        data: { submittedOn: parseDate(r.submittedOn), revision: byDoc.get(d.documentId!) ?? null, approvalCode: r.code, approvedOn: approvedOn ? parseDate(approvedOn) : null, status },
      });
      await this.audit.log(user, 'ENGINEERING_DELIVERABLE', d.id, status === 'APPROVED' && d.status !== 'APPROVED' ? 'APPROVED' : 'UPDATED', `${d.code} ${d.title}, from a design submission`);
    }
    return rows.length;
  }

  async removeDeliverable(user: RequestUser, projectId: string, id: string) {
    if (!canManageDeliverables(user.roleKey)) throw new ForbiddenException('Your role cannot change engineering deliverables');
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.engineeringDeliverable.findFirst({ where: { id, projectId } });
    if (!row) throw new NotFoundException('Deliverable not found');
    const stage = await this.prisma.billingStage.findFirst({ where: { projectId, deliverableIds: { has: id } }, select: { name: true, component: { select: { code: true } } } });
    if (stage) throw new ConflictException(`Payment stage ${stage.component.code} ${stage.name} waits on its approval; take it off the stage first`);
    await this.prisma.engineeringDeliverable.delete({ where: { id } });
    await this.audit.log(user, 'ENGINEERING_DELIVERABLE', id, 'DELETED', `${row.code} ${row.title}`);
    return this.get(user, projectId);
  }

  // Packages

  async savePackage(user: RequestUser, projectId: string, dto: SavePackageDto) {
    if (!canManagePackages(user.roleKey)) throw new ForbiddenException('Your role cannot change equipment packages');
    await this.access.assertCanAccessProject(user, projectId);
    await this.assertElement(projectId, dto.workElementId);
    if (dto.vendorId && !(await this.prisma.vendor.count({ where: { id: dto.vendorId, organizationId: user.organizationId } }))) throw new BadRequestException('Choose a vendor from the vendor master');
    if (dto.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, projectId }, select: { vendorId: true } });
      if (!po) throw new BadRequestException('Choose a purchase order of this project');
      if (dto.vendorId && po.vendorId !== dto.vendorId) throw new BadRequestException('That purchase order is with another vendor');
    }
    if (dto.value && Number(dto.value) < 0) throw new BadRequestException('The value cannot be negative');
    const today = todayIn();
    const stages = (dto.stages ?? []).filter((s) => s.plannedOn || s.actualOn);
    if (new Set(stages.map((s) => s.stage)).size !== stages.length) throw new BadRequestException('Give each stage once');
    if (stages.some((s) => s.actualOn && s.actualOn > today)) throw new BadRequestException('A stage cannot have happened after today; put the date as planned');
    const existing = dto.id ? await this.prisma.procurementPackage.findFirst({ where: { id: dto.id, projectId } }) : null;
    if (dto.id && !existing) throw new NotFoundException('Package not found');
    const data = {
      code: dto.code,
      name: dto.name,
      discipline: dto.discipline,
      workElementId: dto.workElementId !== undefined ? dto.workElementId : undefined,
      vendorId: dto.vendorId !== undefined ? dto.vendorId : undefined,
      purchaseOrderId: dto.purchaseOrderId !== undefined ? dto.purchaseOrderId : undefined,
      scope: dto.scope !== undefined ? dto.scope : undefined,
      value: dto.value !== undefined ? (dto.value === null ? null : new Prisma.Decimal(dto.value)) : undefined,
      neededOn: optDate(dto.neededOn),
      vessel: dto.vessel !== undefined ? dto.vessel : undefined,
      billOfLading: dto.billOfLading !== undefined ? dto.billOfLading : undefined,
      eta: optDate(dto.eta),
      portToSiteDays: dto.portToSiteDays !== undefined ? dto.portToSiteDays : undefined,
      note: dto.note !== undefined ? dto.note : undefined,
    };
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const saved = existing
          ? await tx.procurementPackage.update({ where: { id: existing.id }, data })
          : await tx.procurementPackage.create({ data: { ...data, organizationId: user.organizationId, projectId, sortOrder: await tx.procurementPackage.count({ where: { projectId } }) } });
        if (dto.stages) {
          await tx.packageStageDate.deleteMany({ where: { packageId: saved.id } });
          await tx.packageStageDate.createMany({
            data: stages.map((s) => ({ organizationId: user.organizationId, packageId: saved.id, stage: s.stage, plannedOn: s.plannedOn ? parseDate(s.plannedOn) : null, actualOn: s.actualOn ? parseDate(s.actualOn) : null })),
          });
        }
        return saved;
      });
      await this.audit.log(user, 'PROCUREMENT_PACKAGE', row.id, existing ? 'UPDATED' : 'CREATED', `${row.code} ${row.name}`);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`There is already a package ${dto.code} on this project`);
      throw e;
    }
    return this.get(user, projectId);
  }

  async removePackage(user: RequestUser, projectId: string, id: string) {
    if (!canManagePackages(user.roleKey)) throw new ForbiddenException('Your role cannot change equipment packages');
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.procurementPackage.findFirst({ where: { id, projectId } });
    if (!row) throw new NotFoundException('Package not found');
    const stage = await this.prisma.billingStage.findFirst({ where: { projectId, packageIds: { has: id } }, select: { name: true, component: { select: { code: true } } } });
    if (stage) throw new ConflictException(`Payment stage ${stage.component.code} ${stage.name} is paid by its supply; take it off the stage first`);
    await this.prisma.procurementPackage.delete({ where: { id } });
    await this.audit.log(user, 'PROCUREMENT_PACKAGE', id, 'DELETED', `${row.code} ${row.name}`);
    return this.get(user, projectId);
  }

  // Client inputs

  async saveClientInput(user: RequestUser, projectId: string, dto: SaveClientInputDto) {
    await this.assertView(user, projectId);
    if (dto.achievedOn && dto.achievedOn > todayIn()) throw new BadRequestException('The day the client gave it cannot be after today');
    const existing = dto.id ? await this.prisma.milestone.findFirst({ where: { id: dto.id, projectId, byClient: true } }) : null;
    if (dto.id && !existing) throw new NotFoundException('Client input not found');
    const data = { name: dto.name, dueDate: parseDate(dto.dueDate), achievedOn: optDate(dto.achievedOn), note: dto.note !== undefined ? dto.note : undefined };
    const row = existing
      ? await this.prisma.milestone.update({ where: { id: existing.id }, data })
      : await this.prisma.milestone.create({ data: { ...data, organizationId: user.organizationId, projectId, byClient: true } });
    // Given at last: the delay it caused ends the day before.
    if (row.achievedOn && row.delayId) {
      const delay = await this.prisma.risk.findUnique({ where: { id: row.delayId }, select: { delayEnd: true, delayStart: true } });
      if (delay && !delay.delayEnd && delay.delayStart && row.achievedOn >= delay.delayStart) await this.prisma.risk.update({ where: { id: row.delayId }, data: { delayEnd: row.achievedOn } });
    }
    await this.audit.log(user, 'MILESTONE', row.id, existing ? (row.achievedOn && !existing.achievedOn ? 'ACHIEVED' : 'UPDATED') : 'CREATED', row.name);
    return this.get(user, projectId);
  }

  async removeClientInput(user: RequestUser, projectId: string, id: string) {
    await this.assertView(user, projectId);
    const row = await this.prisma.milestone.findFirst({ where: { id, projectId, byClient: true } });
    if (!row) throw new NotFoundException('Client input not found');
    await this.prisma.milestone.delete({ where: { id } });
    await this.audit.log(user, 'MILESTONE', id, 'DELETED', row.name);
    return this.get(user, projectId);
  }

  /**
   * A client input past due becomes a delay in the register: the client's, from the day after it was due to the day it
   * was given (open while it has not been), so the extension of time and the notice clock pick it up.
   */
  async recordDelay(user: RequestUser, projectId: string, id: string) {
    await this.assertView(user, projectId);
    const row = await this.prisma.milestone.findFirst({ where: { id, projectId, byClient: true } });
    if (!row) throw new NotFoundException('Client input not found');
    if (row.delayId) throw new ConflictException('A delay is already recorded for it');
    const today = todayIn();
    const due = dateOnly(row.dueDate);
    if (!clientInputOverdue({ dueDate: due, achievedOn: dateOnly(row.achievedOn) }, today) && !(row.achievedOn && dateOnly(row.achievedOn) > due)) {
      throw new BadRequestException('It was not late, so there is no delay to record');
    }
    const start = new Date(row.dueDate.getTime() + 86_400_000).toISOString().slice(0, 10);
    const delay = await this.risks.create(user, {
      projectId,
      kind: 'DELAY',
      category: 'CLIENT',
      title: `Client input late: ${row.name}`.slice(0, 200),
      description: `Due from the client on ${formatDay(due)}${row.achievedOn ? `, given on ${formatDay(dateOnly(row.achievedOn))}` : ', not given yet'}.${row.note ? ` ${row.note}` : ''}`,
      impact: 4,
      delayStart: start,
      delayEnd: row.achievedOn ? dateOnly(row.achievedOn) : null,
      responsibleParty: 'CLIENT',
    });
    await this.prisma.milestone.update({ where: { id }, data: { delayId: delay.id } });
    return this.get(user, projectId);
  }
}
