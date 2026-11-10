import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  DOC_SERIES_KINDS,
  DOC_SERIES_KIND_KEYS,
  canManageCompanyData,
  docPatternOf,
  docSeriesProblem,
  docSeriesRestarts,
  formatDocNo,
  logoProblem,
  readDocSeries,
  standardDocPattern,
  type CompanyProfileDto,
  type CompanySettingsDto,
} from '@erp/shared';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { todayIn } from '../notifications/time';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly, parseDate } from '../common/serialize';
import { UpdateCompanyLogoDto, UpdateCompanyProfileDto, UpdateDocSeriesDto } from './company-settings.dto';

const PROFILE_SELECT = { name: true, legalName: true, billingAddress: true, gstin: true, pan: true, cin: true, tan: true, logo: true, docSeries: true, gstSac: true, einvoiceFrom: true } as const;

/** Settings › Company and Numbering (ARCHITECTURE "Company settings"): the letterhead's details, the logo and the number series. */
@Injectable()
export class CompanySettingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertAdmin(user: RequestUser) {
    if (!canManageCompanyData(user.roleKey)) throw new ForbiddenException('Only an admin can change the company settings');
  }

  async get(user: RequestUser): Promise<CompanySettingsDto> {
    this.assertAdmin(user);
    const o = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: PROFILE_SELECT });
    return this.toDto(o);
  }

  private toDto(o: { name: string; legalName: string | null; billingAddress: string | null; gstin: string | null; pan: string | null; cin: string | null; tan: string | null; logo: string | null; docSeries: unknown; gstSac: string | null; einvoiceFrom: Date | null }): CompanySettingsDto {
    const profile: CompanyProfileDto = { name: o.name, legalName: o.legalName, address: o.billingAddress, gstin: o.gstin, pan: o.pan, cin: o.cin, tan: o.tan, logo: o.logo, gstSac: o.gstSac, einvoiceFrom: dateOnly(o.einvoiceFrom) };
    const own = readDocSeries(o.docSeries);
    const today = todayIn();
    const numbering = DOC_SERIES_KIND_KEYS.map((kind) => {
      const pattern = docPatternOf(own, kind);
      return { kind, label: DOC_SERIES_KINDS[kind], pattern, standard: !own[kind], example: formatDocNo(pattern, today, 1), restarts: docSeriesRestarts(pattern) };
    });
    return { profile, numbering };
  }

  async updateProfile(user: RequestUser, dto: UpdateCompanyProfileDto): Promise<CompanySettingsDto> {
    this.assertAdmin(user);
    const o = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        legalName: dto.legalName,
        billingAddress: dto.address,
        gstin: dto.gstin,
        pan: dto.pan,
        cin: dto.cin,
        tan: dto.tan,
        gstSac: dto.gstSac,
        einvoiceFrom: dto.einvoiceFrom === undefined ? undefined : dto.einvoiceFrom && parseDate(dto.einvoiceFrom),
      },
      select: PROFILE_SELECT,
    });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'DETAILS_CHANGED', 'Changed the details on the letterhead');
    return this.toDto(o);
  }

  async updateLogo(user: RequestUser, dto: UpdateCompanyLogoDto): Promise<CompanySettingsDto> {
    this.assertAdmin(user);
    if (dto.logo !== null) {
      const problem = logoProblem(dto.logo);
      if (problem) throw new BadRequestException(problem);
    }
    const o = await this.prisma.organization.update({ where: { id: user.organizationId }, data: { logo: dto.logo }, select: PROFILE_SELECT });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'LOGO_CHANGED', dto.logo ? 'Put up a new logo' : 'Took the logo off');
    return this.toDto(o);
  }

  /** Saves the patterns; one equal to its kind's standard pattern is left out, so the kind follows the standard. */
  async updateNumbering(user: RequestUser, dto: UpdateDocSeriesDto): Promise<CompanySettingsDto> {
    this.assertAdmin(user);
    const series: Record<string, string> = {};
    for (const [kind, raw] of Object.entries(dto.series ?? {})) {
      if (typeof raw !== 'string') throw new BadRequestException(`Give ${kind} its pattern as text`);
      const pattern = raw.trim();
      if (pattern && pattern !== standardDocPattern(kind)) series[kind] = pattern;
    }
    const problem = docSeriesProblem(Object.fromEntries(DOC_SERIES_KIND_KEYS.map((k) => [k, series[k] ?? standardDocPattern(k)])));
    if (problem) throw new BadRequestException(problem);
    const o = await this.prisma.organization.update({ where: { id: user.organizationId }, data: { docSeries: series }, select: PROFILE_SELECT });
    const changed = Object.keys(series).map((k) => `${k} ${series[k]}`).join(', ');
    await this.audit.log(user, 'COMPANY', user.organizationId, 'NUMBERING_CHANGED', changed ? `Numbering: ${changed}` : 'Numbering back to the standard patterns');
    return this.toDto(o);
  }
}
