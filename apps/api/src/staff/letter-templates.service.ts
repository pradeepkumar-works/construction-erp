import { BadRequestException, Injectable } from '@nestjs/common';
import { HR_LETTER_KINDS, HR_LETTER_NAMES, STANDARD_HR_LETTERS, letterTemplateProblem, type HrLetterKind, type HrLetterTemplateDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { iso } from '../common/serialize';

/**
 * HR letter templates (ARCHITECTURE "HR records"): the company's own words for each letter over `STANDARD_HR_LETTERS`,
 * checked by `letterTemplateProblem`. Staff admins edit them; printing reads them through `ownFor`.
 */
@Injectable()
export class LetterTemplatesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private access: ProjectAccessService,
  ) {}

  /** The company's own words for the kinds asked, by kind; a kind with none is left out. */
  async ownFor(organizationId: string, kinds: readonly HrLetterKind[]): Promise<Partial<Record<HrLetterKind, string>>> {
    const rows = await this.prisma.hrLetterTemplate.findMany({ where: { organizationId, kind: { in: [...kinds] } }, select: { kind: true, body: true } });
    return Object.fromEntries(rows.map((r) => [r.kind, r.body]));
  }

  async list(user: RequestUser): Promise<HrLetterTemplateDto[]> {
    this.access.assertCanManageStaff(user);
    const rows = await this.prisma.hrLetterTemplate.findMany({ where: { organizationId: user.organizationId }, include: { updatedBy: { select: { fullName: true } } } });
    return HR_LETTER_KINDS.map((kind) => {
      const r = rows.find((x) => x.kind === kind);
      return {
        kind,
        title: HR_LETTER_NAMES[kind],
        body: r?.body ?? STANDARD_HR_LETTERS[kind],
        standard: STANDARD_HR_LETTERS[kind],
        isStandard: !r,
        updatedByName: r?.updatedBy.fullName ?? null,
        updatedAt: r ? iso(r.updatedAt) : null,
      };
    });
  }

  /** Save the company's words for one letter; the standard words (or none) put the standard back. */
  async save(user: RequestUser, kind: HrLetterKind, body: string | null): Promise<HrLetterTemplateDto[]> {
    this.access.assertCanManageStaff(user);
    const text = body?.replace(/\r\n/g, '\n').trim() ?? '';
    if (!text || text === STANDARD_HR_LETTERS[kind]) {
      await this.prisma.hrLetterTemplate.deleteMany({ where: { organizationId: user.organizationId, kind } });
      await this.audit.log(user, 'ORGANIZATION', user.organizationId, 'UPDATED', `${HR_LETTER_NAMES[kind]}: back to the standard words`);
      return this.list(user);
    }
    const problem = letterTemplateProblem(text);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.hrLetterTemplate.upsert({
      where: { organizationId_kind: { organizationId: user.organizationId, kind } },
      create: { organizationId: user.organizationId, kind, body: text, updatedById: user.id },
      update: { body: text, updatedById: user.id },
    });
    await this.audit.log(user, 'ORGANIZATION', user.organizationId, 'UPDATED', `${HR_LETTER_NAMES[kind]}: the company's own words saved`);
    return this.list(user);
  }
}
