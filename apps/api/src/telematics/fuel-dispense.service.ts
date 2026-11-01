import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canIssueFuel, canKeepStock, type FuelDispenserConfig, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { StockService } from '../stock/stock.service';
import { JOB_TIMEZONE } from '../notifications/time';
import { dayOf, type DispenseIn } from './telematics-rules';

type Dispense = Prisma.FuelDispenseGetPayload<{
  include: { connection: { select: { projectId: true; config: true; name: true; createdBy: { select: { id: true; organizationId: true; email: true; fullName: true; role: { select: { key: true } } } } } }; deviceLink: { select: { equipmentId: true } } };
}>;
const dispenseInclude = {
  connection: { select: { projectId: true, config: true, name: true, createdBy: { select: { id: true, organizationId: true, email: true, fullName: true, role: { select: { key: true } } } } } },
  deviceLink: { select: { equipmentId: true } },
} as const;

/** The fuel item a dispenser's connection pours, from its settings. */
export const dispenserItemOf = (config: unknown) => {
  const id = config && typeof config === 'object' ? (config as Partial<FuelDispenserConfig>).itemId : undefined;
  return typeof id === 'string' && id ? id : null;
};

/**
 * A site's fuel dispenser (ARCHITECTURE "Fuel sensors and dispensers"): each fill is kept once, by the
 * dispenser's own id, and becomes a fuel issue slip through `StockService.fuelIssue` as soon as its tag is matched to a
 * machine, so the stock, the fuel position and the leakage checks see it as any slip. A slip refused (no stock booked,
 * the machine inactive) keeps its reason until someone tries it again.
 */
@Injectable()
export class FuelDispenseService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private stock: StockService,
  ) {}

  /** A dispenser connection's settings, checked before they are saved: the site its fuel comes from and a fuel item. */
  async checkConfig(user: RequestUser, projectId: string | null | undefined, config: unknown): Promise<Record<string, unknown>> {
    if (!projectId) throw new BadRequestException('Choose the site whose store the dispenser pours from');
    if (!canKeepStock(user.roleKey)) throw new ForbiddenException('Fills are issued in the name of whoever sets up the dispenser, and your role cannot issue stock');
    const itemId = dispenserItemOf(config);
    if (!itemId) throw new BadRequestException('Choose the fuel the dispenser pours');
    const item = await this.prisma.item.findFirst({ where: { id: itemId, organizationId: user.organizationId }, select: { name: true, isFuel: true } });
    if (!item) throw new BadRequestException('Choose a fuel item of this company');
    if (!item.isFuel) throw new BadRequestException(`${item.name} is not marked as fuel in the item master`);
    return { itemId };
  }

  /** One fill from a dispenser's message, kept once; issued now when its tag is matched to a machine. */
  async take(organizationId: string, connectionId: string, link: { id: string; equipmentId: string | null }, d: DispenseIn): Promise<{ duplicate: boolean; entryNo: string | null; problem: string | null }> {
    let row: { id: string };
    try {
      row = await this.prisma.fuelDispense.create({
        data: { organizationId, connectionId, externalId: d.externalId, deviceLinkId: link.id, at: d.at, litres: d.litres, meter: d.meter },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { duplicate: true, entryNo: null, problem: null };
      throw e;
    }
    if (!link.equipmentId) return { duplicate: false, entryNo: null, problem: null };
    return { duplicate: false, ...(await this.issue(row.id)) };
  }

  /** The fill as a fuel slip, in the name of whoever set the dispenser up; a refusal is kept as its problem. */
  private async issue(id: string): Promise<{ entryNo: string | null; problem: string | null }> {
    const d: Dispense | null = await this.prisma.fuelDispense.findUnique({ where: { id }, include: dispenseInclude });
    if (!d) return { entryNo: null, problem: null };
    if (d.stockEntryId) return { entryNo: (await this.prisma.stockEntry.findUnique({ where: { id: d.stockEntryId }, select: { entryNo: true } }))?.entryNo ?? null, problem: null };
    const fail = async (problem: string) => {
      await this.prisma.fuelDispense.update({ where: { id }, data: { problem: problem.slice(0, 300) } });
      return { entryNo: null, problem };
    };
    const c = d.connection;
    const itemId = dispenserItemOf(c.config);
    if (!d.deviceLink.equipmentId) return fail('The tag is not matched to a machine');
    if (!c.projectId || !itemId) return fail("The dispenser's site or fuel is not set; edit it in Admin, Connections");
    const by: RequestUser = { id: c.createdBy.id, organizationId: c.createdBy.organizationId, roleKey: c.createdBy.role.key as RoleKey, email: c.createdBy.email, fullName: c.createdBy.fullName };
    try {
      const entry = await this.stock.fuelIssue(by, {
        // The fill's own id is the slip's, so a retry after a failure part way returns the same slip.
        id: d.id,
        projectId: c.projectId,
        date: dayOf(d.at, JOB_TIMEZONE),
        equipmentId: d.deviceLink.equipmentId,
        itemId,
        quantity: d.litres.toString(),
        meterReading: d.meter?.toString() ?? null,
        remarks: `From ${c.name}, ${d.at.toISOString().slice(11, 16)} UTC`,
      });
      await this.prisma.fuelDispense.update({ where: { id }, data: { stockEntryId: entry.id, problem: null } });
      return { entryNo: entry.entryNo, problem: null };
    } catch (e) {
      return fail((e as Error).message || 'The slip could not be made');
    }
  }

  /** A tag just matched to a machine: its fills not on a slip yet are issued, oldest first. */
  async issuePending(deviceLinkId: string): Promise<number> {
    const rows = await this.prisma.fuelDispense.findMany({ where: { deviceLinkId, stockEntryId: null }, select: { id: true }, orderBy: { at: 'asc' } });
    let issued = 0;
    for (const r of rows) if ((await this.issue(r.id)).entryNo) issued++;
    return issued;
  }

  /** POST /telematics/dispenses/:id/retry: whoever issues fuel at the site tries a refused fill again. */
  async retry(user: RequestUser, id: string): Promise<{ entryNo: string | null; problem: string | null }> {
    const d = await this.prisma.fuelDispense.findFirst({ where: { id, organizationId: user.organizationId }, select: { connection: { select: { projectId: true } } } });
    if (!d) throw new NotFoundException('That fill is not in this company');
    if (!canIssueFuel(user.roleKey)) throw new ForbiddenException('Your role cannot issue fuel');
    if (d.connection.projectId) await this.access.assertCanAccessProject(user, d.connection.projectId);
    return this.issue(id);
  }
}
