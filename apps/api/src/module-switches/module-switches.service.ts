import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canManageModules, isSwitchableModule, type ModuleSwitchesDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { nextModulesOff, switchesOf, switchNote, switchProblem } from './module-switch-rules';

/** Module switches: an admin turns the company's optional modules on and off. Audited. */
@Injectable()
export class ModuleSwitchesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private org(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { modulesOff: true, moduleTier: true } });
  }

  private guard(user: RequestUser) {
    if (!canManageModules(user.roleKey)) throw new ForbiddenException('Only admins turn modules on and off');
  }

  async list(user: RequestUser): Promise<ModuleSwitchesDto> {
    this.guard(user);
    return switchesOf(await this.org(user.organizationId));
  }

  async set(user: RequestUser, key: string, on: boolean): Promise<ModuleSwitchesDto> {
    this.guard(user);
    if (!isSwitchableModule(key)) throw new NotFoundException('No such module');
    const org = await this.org(user.organizationId);
    const problem = switchProblem(org, key, on);
    if (problem) throw new BadRequestException(problem);
    const modulesOff = nextModulesOff(org.modulesOff, key, on);
    if (modulesOff.join() === org.modulesOff.join()) return switchesOf(org);
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { modulesOff } });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'MODULES', switchNote(key, on));
    return switchesOf({ ...org, modulesOff });
  }
}
