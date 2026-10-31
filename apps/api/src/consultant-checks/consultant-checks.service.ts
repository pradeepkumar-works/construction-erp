import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CHECK_LEVEL_LABELS,
  billLabel,
  certifyCheckProblem,
  checkCoverage,
  checkOutcome,
  sheetsToReach,
  type BillMeasureChecksDto,
  type MeasurementCheckDto,
  type PortalMeasurementDto,
  type PortalMeasurementsDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, dec, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { checkLevelOf } from './check-level';

const checkInclude = { checkedBy: { select: { fullName: true } } } satisfies Prisma.MeasurementCheckInclude;
type CheckRow = Prisma.MeasurementCheckGetPayload<{ include: typeof checkInclude }>;

const sheetInclude = {
  boqItem: { select: { itemNo: true, description: true, unit: true, rate: true } },
  lines: { orderBy: { sortOrder: 'asc' } },
  attachments: { select: ATTACHMENT_FIELDS },
  raBill: { select: { billNo: true, isFinal: true, omYear: true } },
  checks: { include: checkInclude, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MeasurementSheetInclude;
type SheetRow = Prisma.MeasurementSheetGetPayload<{ include: typeof sheetInclude }>;

const amountOf = (s: { totalQty: Prisma.Decimal; boqItem: { rate: Prisma.Decimal } }) => s.totalQty.mul(s.boqItem.rate).toNumber();

/**
 * Consultant checks (item 172, ARCHITECTURE "Consultant checks"): the client's engineer and the consultant's engineers check
 * the contractor's approved measurement sheets from the portal, each at their level on the project, and a bill is
 * certified only once the certifier has checked their share of its sheets. Coverage and the rules are pure in
 * `@erp/shared/consultant-checks.ts`; hidden work is signed off on its inspection (`InspectionsService.signHidden`).
 */
@Injectable()
export class ConsultantChecksService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
  ) {}

  private checkDto(c: CheckRow): MeasurementCheckDto {
    return {
      id: c.id,
      sheetId: c.sheetId,
      level: c.level,
      checkedById: c.checkedById,
      checkedByName: c.checkedBy.fullName,
      checkedOn: dateOnly(c.checkedOn),
      recordedQty: dec(c.recordedQty)!,
      checkedQty: dec(c.checkedQty)!,
      outcome: checkOutcome(c.recordedQty.toNumber(), c.checkedQty.toNumber()),
      note: c.note,
    };
  }

  private sheetDto(s: SheetRow): PortalMeasurementDto {
    return {
      id: s.id,
      mbNo: s.mbNo,
      date: dateOnly(s.date),
      location: s.location,
      boqItemNo: s.boqItem.itemNo,
      boqItemDescription: s.boqItem.description,
      unit: s.boqItem.unit,
      totalQty: dec(s.totalQty)!,
      rate: money(s.boqItem.rate)!,
      amount: money(s.totalQty.mul(s.boqItem.rate))!,
      billLabel: s.raBill ? billLabel(s.raBill.billNo, s.raBill.isFinal, s.raBill.omYear !== null) : null,
      lines: s.lines.map((l) => ({ description: l.description, nos: dec(l.nos), length: dec(l.length), breadth: dec(l.breadth), depth: dec(l.depth), deduct: l.deduct, quantity: dec(l.quantity)! })),
      attachments: s.attachments.map((a) => this.attachments.toDto(a)),
      checks: s.checks.map((c) => this.checkDto(c)),
    };
  }

  /** The approved sheets of a project, newest first, with their checks and how far each level has got. */
  async forPortal(user: RequestUser, projectId: string): Promise<PortalMeasurementsDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.measurementSheet.findMany({
      where: { projectId, organizationId: user.organizationId, status: 'APPROVED' },
      include: sheetInclude,
      orderBy: [{ date: 'desc' }, { mbNo: 'desc' }],
      take: 500,
    });
    const level = await checkLevelOf(this.prisma, projectId, user.id);
    const sheets = rows.map((r) => ({ id: r.id, amount: amountOf(r) }));
    const checks = rows.flatMap((r) => r.checks.map((c) => ({ sheetId: r.id, level: c.level })));
    return { level, sheets: rows.map((r) => this.sheetDto(r)), coverage: checkCoverage(sheets, checks), toCheck: level ? sheetsToReach(level, sheets, checks) : [] };
  }

  /**
   * The client's engineer or a consultant records their check of an approved sheet: their own quantity against the sheet's,
   * at their level on the project. Checking again replaces their earlier check. A check that finds less than recorded
   * tells the QS and whoever recorded the sheet.
   */
  async check(user: RequestUser, sheetId: string, dto: { checkedQty: string; checkedOn?: string; note?: string | null }): Promise<PortalMeasurementDto> {
    const sheet = await this.prisma.measurementSheet.findFirst({ where: { id: sheetId, organizationId: user.organizationId, status: 'APPROVED' }, include: { ...sheetInclude, project: { select: { name: true } } } });
    if (!sheet) throw new NotFoundException('Measurement not found, or not approved by the contractor yet');
    await this.access.assertCanActAsClient(user, sheet.projectId);
    const level = await checkLevelOf(this.prisma, sheet.projectId, user.id);
    if (!level) throw new BadRequestException("You have no check level on this project yet. The contractor's project manager sets it on the project's team");
    const on = dto.checkedOn ?? todayIn();
    if (on > todayIn()) throw new BadRequestException('The check date cannot be after today');
    if (on < dateOnly(sheet.date)) throw new BadRequestException('The check date cannot be before the measurement');
    const checkedQty = new Prisma.Decimal(dto.checkedQty);
    const note = dto.note?.trim() || null;
    const data = { level, checkedOn: parseDate(on), recordedQty: sheet.totalQty, checkedQty, note };
    await this.prisma.measurementCheck.upsert({
      where: { sheetId_checkedById: { sheetId, checkedById: user.id } },
      create: { organizationId: user.organizationId, projectId: sheet.projectId, sheetId, checkedById: user.id, ...data },
      update: data,
    });
    const outcome = checkOutcome(sheet.totalQty.toNumber(), checkedQty.toNumber());
    const words = outcome === 'AGREED' ? 'agrees' : `found ${dec(checkedQty)} ${sheet.boqItem.unit} against ${dec(sheet.totalQty)} recorded`;
    await this.audit.log(user, 'MEASUREMENT', sheetId, 'CHECKED', `Checked by the ${CHECK_LEVEL_LABELS[level].toLowerCase()}: ${words}${note ? `. ${note}` : ''}`);
    if (outcome !== 'AGREED') {
      const qs = await this.access.usersWithRoles(user.organizationId, sheet.projectId, ['QUANTITY_SURVEYOR', 'PROJECT_MANAGER']);
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: [...new Set([sheet.submittedById, ...qs.map((u) => u.id)])],
        type: 'PORTAL',
        title: `${sheet.mbNo}: the ${CHECK_LEVEL_LABELS[level].toLowerCase()}'s check differs`,
        body: `${user.fullName} checked ${sheet.boqItem.itemNo} at ${sheet.location}, ${sheet.project.name}, and ${words}.${note ? ` Note: ${note}` : ''}`,
        projectId: sheet.projectId,
        entityType: 'MEASUREMENT',
        entityId: sheetId,
      });
    }
    const fresh = await this.prisma.measurementSheet.findUniqueOrThrow({ where: { id: sheetId }, include: sheetInclude });
    return this.sheetDto(fresh);
  }

  /** A bill's sheets as checked: the coverage by level, the certifier's next sheets and why they may not certify yet. */
  async forBill(user: RequestUser, billId: string, projectId: string): Promise<BillMeasureChecksDto> {
    const rows = await this.prisma.measurementSheet.findMany({ where: { raBillId: billId, organizationId: user.organizationId }, select: { id: true, totalQty: true, boqItem: { select: { rate: true } }, checks: { select: { level: true } } } });
    const level = await checkLevelOf(this.prisma, projectId, user.id);
    const sheets = rows.map((r) => ({ id: r.id, amount: amountOf(r) }));
    const checks = rows.flatMap((r) => r.checks.map((c) => ({ sheetId: r.id, level: c.level })));
    const coverage = checkCoverage(sheets, checks);
    return { level, coverage, toCheck: level ? sheetsToReach(level, sheets, checks) : [], problem: certifyCheckProblem(level, coverage) };
  }

  /** The portal's bill checks: for a guest on the bill's project. */
  async billChecksForClient(user: RequestUser, billId: string): Promise<BillMeasureChecksDto> {
    const bill = await this.prisma.raBill.findFirst({ where: { id: billId, organizationId: user.organizationId, status: 'APPROVED', stage: { not: 'NOT_SENT' } }, select: { projectId: true } });
    if (!bill) throw new NotFoundException('RA bill not found');
    await this.access.assertCanAccessProject(user, bill.projectId);
    return this.forBill(user, billId, bill.projectId);
  }

  /** Refuses the certificate of a consultant who has not checked their share of the bill's sheets (RaBillsService.certifyAsClient). */
  async assertMayCertify(user: RequestUser, billId: string, projectId: string) {
    const { problem } = await this.forBill(user, billId, projectId);
    if (problem) throw new BadRequestException(problem);
  }

  /** The checks on one sheet, for staff: the measurement's own page. */
  async forSheet(user: RequestUser, sheetId: string): Promise<MeasurementCheckDto[]> {
    const sheet = await this.prisma.measurementSheet.findFirst({ where: { id: sheetId, ...this.access.submissionWhere(user) }, select: { id: true } });
    if (!sheet) throw new NotFoundException('Measurement not found');
    const rows = await this.prisma.measurementCheck.findMany({ where: { sheetId }, include: checkInclude, orderBy: { createdAt: 'asc' } });
    return rows.map((c) => this.checkDto(c));
  }
}
