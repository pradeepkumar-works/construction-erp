import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CONTRACT_PERCENT_FIELDS, MAX_GST_RATE, canEditContract, canViewContract, delayDays, revisedCompletion, type ProjectContractDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { ClientsService } from '../clients/clients.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { UpdateContractDto } from './contracts.dto';

const include = {
  client: { include: { _count: { select: { projects: true } } } },
  risks: { where: { kind: 'DELAY' as const, OR: [{ eotClaimed: true }, { eotGrantedDays: { not: null } }] }, orderBy: { delayStart: 'asc' as const } },
  variations: { where: { status: 'APPROVED' as const }, select: { approvedAmount: true } },
} satisfies Prisma.ProjectInclude;
type Row = Prisma.ProjectGetPayload<{ include: typeof include }>;

const pctStr = (d: Prisma.Decimal) => d.toFixed(2).replace(/\.?0+$/, '') || '0';

/**
 * A project's contract with its client (v3 item 17): agreement, value, dates with the extensions of time granted in the
 * delay register, and the retention, advance, tax and cess percentages RA bills are built with.
 */
@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  toDto(p: Row): ProjectContractDto {
    const today = new Date().toISOString().slice(0, 10);
    const extensions = p.risks.map((r) => ({
      riskId: r.id,
      riskNo: r.riskNo,
      title: r.title,
      delayStart: dateOnly(r.delayStart),
      delayEnd: dateOnly(r.delayEnd),
      daysLost: r.daysLost ?? delayDays(dateOnly(r.delayStart), dateOnly(r.delayEnd), today),
      responsibleParty: r.responsibleParty,
      eotClaimed: r.eotClaimed,
      eotGrantedDays: r.eotGrantedDays,
    }));
    const extensionDays = extensions.reduce((s, e) => s + (e.eotGrantedDays ?? 0), 0);
    const endDate = dateOnly(p.endDate);
    const approvedVariations = p.variations.reduce((s, v) => s.add(v.approvedAmount ?? 0), new Prisma.Decimal(0));
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      client: p.client ? ClientsService.toDto(p.client) : null,
      clientName: p.clientName,
      workOrderNo: p.workOrderNo,
      agreementNo: p.agreementNo,
      agreementDate: dateOnly(p.agreementDate),
      contractValue: money(p.contractValue),
      approvedVariations: money(approvedVariations)!,
      revisedContractValue: p.contractValue ? money(p.contractValue.add(approvedVariations)) : null,
      startDate: dateOnly(p.startDate),
      endDate,
      extensionDays,
      revisedEndDate: revisedCompletion(endDate, extensionDays),
      extensions,
      retentionPct: pctStr(p.retentionPct),
      securityDepositPct: pctStr(p.securityDepositPct),
      mobilisationAdvance: money(p.mobilisationAdvance)!,
      advanceRecoveryPct: pctStr(p.advanceRecoveryPct),
      defectLiabilityMonths: p.defectLiabilityMonths,
      clientPaymentDays: p.clientPaymentDays,
      priceVariation: p.priceVariation,
      gstRate: pctStr(p.gstRate),
      tdsPct: pctStr(p.tdsPct),
      gstTdsPct: pctStr(p.gstTdsPct),
      labourCessPct: pctStr(p.labourCessPct),
      updatedAt: iso(p.updatedAt)!,
    };
  }

  async get(user: RequestUser, projectId: string): Promise<ProjectContractDto> {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see contract terms');
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Project not found');
    return this.toDto(row);
  }

  async update(user: RequestUser, projectId: string, dto: UpdateContractDto): Promise<ProjectContractDto> {
    if (!canEditContract(user.roleKey)) throw new ForbiddenException('Your role cannot change contract terms');
    await this.access.assertCanAccessProject(user, projectId);
    const data: Prisma.ProjectUncheckedUpdateInput = {};
    if (dto.clientId !== undefined) {
      if (dto.clientId) {
        const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId }, select: { name: true } });
        if (!client) throw new NotFoundException('Client not found');
        data.clientName = client.name;
      }
      data.clientId = dto.clientId;
    }
    if (dto.workOrderNo !== undefined) data.workOrderNo = dto.workOrderNo;
    if (dto.agreementNo !== undefined) data.agreementNo = dto.agreementNo;
    if (dto.agreementDate !== undefined) data.agreementDate = dto.agreementDate ? parseDate(dto.agreementDate) : null;
    if (dto.contractValue !== undefined) data.contractValue = dto.contractValue === null ? null : new Prisma.Decimal(dto.contractValue);
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? parseDate(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? parseDate(dto.endDate) : null;
    for (const k of CONTRACT_PERCENT_FIELDS) {
      const v = dto[k];
      if (v === undefined) continue;
      const n = new Prisma.Decimal(v);
      const max = k === 'gstRate' ? MAX_GST_RATE : 100;
      if (n.lt(0) || n.gt(max)) throw new BadRequestException(`${k} must be between 0 and ${max}`);
      data[k] = n;
    }
    if (dto.mobilisationAdvance !== undefined) {
      if (Number(dto.mobilisationAdvance) < 0) throw new BadRequestException('The mobilisation advance cannot be negative');
      data.mobilisationAdvance = new Prisma.Decimal(dto.mobilisationAdvance);
    }
    if (dto.defectLiabilityMonths !== undefined) data.defectLiabilityMonths = dto.defectLiabilityMonths;
    if (dto.clientPaymentDays !== undefined) data.clientPaymentDays = dto.clientPaymentDays;
    if (dto.priceVariation !== undefined) data.priceVariation = dto.priceVariation;
    const start = dto.startDate !== undefined ? dto.startDate : undefined;
    const end = dto.endDate !== undefined ? dto.endDate : undefined;
    if (start !== undefined || end !== undefined) {
      const cur = await this.prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true, endDate: true } });
      const s = start !== undefined ? start : dateOnly(cur?.startDate);
      const e = end !== undefined ? end : dateOnly(cur?.endDate);
      if (s && e && e < s) throw new BadRequestException('The completion date cannot be before the start date');
    }
    await this.prisma.project.update({ where: { id: projectId }, data });
    await this.audit.log(user, 'PROJECT', projectId, 'CONTRACT_UPDATED');
    return this.get(user, projectId);
  }
}
