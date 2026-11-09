import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  STANDARD_IS_CODES,
  canManageQaPlan,
  editionState,
  financialYearOf,
  isCompliance,
  isGuest,
  isStandardCode,
  isStandardProblem,
  isStandardsOf,
  type IsClauseDef,
  type IsComplianceDto,
  type IsStandardDef,
  type IsStandardDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { QaService } from '../qa/qa.service';
import { IsComplianceQuery, SaveIsStandardDto } from './is-standards.dto';

type Row = Prisma.IsStandardGetPayload<{ include: { checkedBy: { select: { fullName: true } } } }>;

const shipped = (code: string) => STANDARD_IS_CODES.find((s) => s.code === code);

/**
 * The company's library of Indian Standards (ARCHITECTURE "Indian Standards"): the catalogue with its copies over it, and
 * compliance read from the tests by standard and discipline. The rules are pure in `@erp/shared/is-standards.ts`; a
 * clause names a test type, so the test types come from `QaService`.
 */
@Injectable()
export class IsStandardsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private qa: QaService,
  ) {}

  private toDef(r: Row): IsStandardDef {
    return {
      code: r.code,
      number: r.number,
      year: r.year,
      reaffirmed: r.reaffirmed,
      title: r.title,
      discipline: r.discipline,
      subject: r.subject,
      clauses: (r.clauses as unknown as IsClauseDef[]) ?? [],
      active: r.isActive,
      checkedOn: r.checkedOn ? dateOnly(r.checkedOn) : null,
    };
  }

  private async rows(organizationId: string): Promise<Row[]> {
    return this.prisma.isStandard.findMany({ where: { organizationId }, include: { checkedBy: { select: { fullName: true } } }, orderBy: { code: 'asc' } });
  }

  /** The company's standards (catalogue ones with its changes, then its own), switched-off ones included. */
  async defs(organizationId: string): Promise<IsStandardDef[]> {
    return isStandardsOf((await this.rows(organizationId)).map((r) => this.toDef(r)));
  }

  async list(user: RequestUser): Promise<IsStandardDto[]> {
    const rows = await this.rows(user.organizationId);
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const today = todayIn();
    return isStandardsOf(rows.map((r) => this.toDef(r))).map((d) => {
      const standard = !!shipped(d.code);
      return { ...d, standard, changed: standard && byCode.has(d.code), edition: editionState(d.checkedOn, today), checkedByName: byCode.get(d.code)?.checkedBy?.fullName ?? null };
    });
  }

  async get(user: RequestUser, code: string): Promise<IsStandardDto> {
    const found = (await this.list(user)).find((s) => s.code === code.toUpperCase());
    if (!found) throw new NotFoundException('No such standard in the library');
    return found;
  }

  private assertManage(user: RequestUser) {
    if (!canManageQaPlan(user.roleKey)) throw new ForbiddenException('Only QA/QC or a project manager changes the standards library');
  }

  /** Save a catalogue standard's copy or one of the company's own, by code; the code is the number's and never changes. */
  async save(user: RequestUser, code: string, dto: SaveIsStandardDto): Promise<IsStandardDto> {
    this.assertManage(user);
    const key = code.trim().toUpperCase();
    const base = shipped(key);
    if (base ? dto.number.trim() !== base.number : key !== isStandardCode(dto.number)) {
      throw new BadRequestException(base ? `Keep the number ${base.number}; add a standard of your own for another` : 'The code must be the number’s, such as IS_456 for IS 456');
    }
    const clauses: IsClauseDef[] = dto.clauses.map((c) => ({
      ref: c.ref ?? null,
      title: c.title,
      requirement: c.requirement,
      check: c.check.by === 'TEST' ? { by: 'TEST', testTypeCode: c.check.testTypeCode!.toUpperCase() } : { by: c.check.by },
      sampling: c.sampling ?? null,
      tolerance: c.tolerance ?? null,
    }));
    const def = { number: dto.number.trim(), year: dto.year, reaffirmed: dto.reaffirmed ?? null, title: dto.title, discipline: dto.discipline, subject: dto.subject, clauses };
    const types = (await this.qa.typeDefs(user.organizationId)).map((t) => t.code);
    const problem = isStandardProblem(def, types, Number(todayIn().slice(0, 4)));
    if (problem) throw new BadRequestException(problem);
    const data = { ...def, clauses: clauses as unknown as Prisma.InputJsonValue, isActive: dto.active ?? true };
    await this.prisma.isStandard.upsert({
      where: { organizationId_code: { organizationId: user.organizationId, code: key } },
      create: { organizationId: user.organizationId, code: key, ...data },
      update: data,
    });
    await this.audit.log(user, 'IS_STANDARD', key, 'UPDATED');
    return this.get(user, key);
  }

  /** Record that someone checked the edition against BIS today; a catalogue standard gets its copy. */
  async markChecked(user: RequestUser, code: string): Promise<IsStandardDto> {
    this.assertManage(user);
    const cur = (await this.defs(user.organizationId)).find((s) => s.code === code.toUpperCase());
    if (!cur) throw new NotFoundException('No such standard in the library');
    const checked = { checkedOn: parseDate(todayIn()), checkedById: user.id };
    await this.prisma.isStandard.upsert({
      where: { organizationId_code: { organizationId: user.organizationId, code: cur.code } },
      create: {
        organizationId: user.organizationId,
        code: cur.code,
        number: cur.number,
        year: cur.year,
        reaffirmed: cur.reaffirmed,
        title: cur.title,
        discipline: cur.discipline,
        subject: cur.subject,
        clauses: cur.clauses as unknown as Prisma.InputJsonValue,
        isActive: cur.active,
        ...checked,
      },
      update: checked,
    });
    await this.audit.log(user, 'IS_STANDARD', cur.code, 'CHECKED');
    return this.get(user, cur.code);
  }

  /** A catalogue standard goes back to as shipped (its check day with it); one of the company's own is deleted. */
  async remove(user: RequestUser, code: string) {
    this.assertManage(user);
    const { count } = await this.prisma.isStandard.deleteMany({ where: { organizationId: user.organizationId, code: code.toUpperCase() } });
    if (!count) throw new NotFoundException(shipped(code.toUpperCase()) ? 'It is already as shipped' : 'No such standard in the library');
    await this.audit.log(user, 'IS_STANDARD', code.toUpperCase(), 'DELETED');
    return { ok: true };
  }

  /** Tests sampled in the period on the projects the reader sees, by standard and by discipline. */
  async compliance(user: RequestUser, q: IsComplianceQuery): Promise<IsComplianceDto> {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Compliance is for the company’s own staff');
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const from = q.from ?? financialYearOf(today).from;
    const to = q.to ?? today;
    if (from > to) throw new BadRequestException('The period starts after it ends');
    const [tests, standards] = await Promise.all([
      this.prisma.qualityTest.findMany({
        where: { ...this.access.submissionWhere(user), ...(q.projectId ? { projectId: q.projectId } : {}), sampledOn: { gte: parseDate(from), lte: parseDate(to) } },
        select: { testTypeCode: true, result: true },
      }),
      this.defs(user.organizationId),
    ]);
    return { ...isCompliance(tests, standards), from, to, projectId: q.projectId ?? null };
  }
}
