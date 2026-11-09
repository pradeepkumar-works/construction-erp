import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { todayIn } from '../notifications/time';
import { redateDemos, type RedateResult } from './redate';

/** The demo clock's daily run (ARCHITECTURE "Demo clock"): demo companies dated on an earlier day are moved up to today. */
@Injectable()
export class DemoClockService {
  private readonly log = new Logger(DemoClockService.name);

  constructor(private prisma: PrismaService) {}

  async redate(today = todayIn()): Promise<RedateResult[]> {
    const moved = await withoutTenant(async () => await redateDemos(this.prisma, today));
    for (const m of moved) this.log.log(`Demo company ${m.organizationId} moved ${m.days} days forward`);
    return moved;
  }
}
