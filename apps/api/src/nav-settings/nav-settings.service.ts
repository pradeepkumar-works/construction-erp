import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { NAV_LAYOUT_LABELS, NAV_LOOK_LABELS, NAV_MODULE_SET_LABELS, canManageModules, cleanNavNames, navNamesProblem, navSettingsFrom, type NavLook, type NavSettingsDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { SaveNavSettingsDto } from './nav-settings.dto';

const NAV_SELECT = { navLayout: true, navLook: true, navModuleSet: true, navNames: true, navPersonalLook: true } as const;

/** What changed, for the audit log ("Top bar, Light frame; 2 module names"). */
function changeNote(before: NavSettingsDto, after: NavSettingsDto): string {
  const parts: string[] = [];
  if (before.layout !== after.layout) parts.push(`menu ${NAV_LAYOUT_LABELS[after.layout].toLowerCase()}`);
  if (before.look !== after.look) parts.push(`look ${NAV_LOOK_LABELS[after.look]}`);
  if (before.moduleSet !== after.moduleSet) parts.push(`modules ${NAV_MODULE_SET_LABELS[after.moduleSet].toLowerCase()}`);
  if (JSON.stringify(before.names) !== JSON.stringify(after.names)) parts.push(`${Object.keys(after.names).length} module names of the company's own`);
  if (before.personalLook !== after.personalLook) parts.push(after.personalLook ? 'people choose their own look' : 'one look for everyone');
  return `Menu and names: ${parts.join('; ') || 'no change'}`;
}

/** Menu and names: an admin sets the company's menu; anyone may keep a look of their own when the company allows it. */
@Injectable()
export class NavSettingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async get(user: RequestUser): Promise<NavSettingsDto> {
    return navSettingsFrom(await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: NAV_SELECT }));
  }

  async save(user: RequestUser, dto: SaveNavSettingsDto): Promise<NavSettingsDto> {
    if (!canManageModules(user.roleKey)) throw new ForbiddenException('Only admins change the menu and its names');
    const problem = navNamesProblem(dto.names);
    if (problem) throw new BadRequestException(problem);
    const before = await this.get(user);
    const after: NavSettingsDto = { layout: dto.layout, look: dto.look, moduleSet: dto.moduleSet, names: cleanNavNames(dto.names), personalLook: dto.personalLook };
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { navLayout: after.layout, navLook: after.look, navModuleSet: after.moduleSet, navNames: after.names, navPersonalLook: after.personalLook },
    });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'MENU', changeNote(before, after));
    return after;
  }

  async saveOwnLook(user: RequestUser, look: NavLook | null): Promise<{ look: NavLook | null }> {
    await this.prisma.user.update({ where: { id: user.id }, data: { navLook: look } });
    return { look };
  }
}
