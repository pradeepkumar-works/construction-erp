import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CompanyDeletionDto, CompanyExportFileDto, CompanyExportManifestDto, CompanyExportPageDto, CompanyLogEntryDto, SupportAccessDto } from '@erp/shared';
import { DELETION_GRACE_DAYS, PRODUCT_NAME, SUPPORT_ACCESS_DAYS, canManageCompanyData } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { AuditService } from '../common/audit.service';
import { StorageService } from '../common/storage.service';
import { RequestUser } from '../common/current-user';
import { EmailService, escapeHtml } from '../notifications/email.service';
import { emailButton, emailLayout } from '../notifications/email-layout';
import { MessagingService } from '../messaging/messaging.service';

type Model = Prisma.DMMF.Model;
type Field = Prisma.DMMF.Field;

/** Tables left out of the export: sign-in secrets and device push tokens. */
const NOT_EXPORTED = new Set(['PasswordToken', 'PushToken']);
/** Columns left out of the export (file bytes go in the photos folder instead). */
const HIDDEN_COLUMN = /password|tokenHash|secret/i;

/**
 * How a table's rows of one organisation are found: by its own organizationId, or through a parent that has one
 * (a bill's lines through the bill). Worked out once from the Prisma schema, so a new table is covered without a change.
 */
interface TableScope {
  model: Model;
  delegate: string;
  /** Prisma `where` for the organisation's rows */
  where: (orgId: string) => Record<string, unknown>;
  /** SQL condition for the organisation's rows ($1 = organisation id) */
  sql: string;
}

/** 2026-11-13 -> 13 Nov 2026 */
const formatDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const scalar = (f: Field) => f.kind === 'scalar' || f.kind === 'enum';

/**
 * Tables that belong to no company (`AuthAttempt`), or sit above the companies of a group (the group, its admins and
 * people's sign-ins): never exported. A sign-in or group left with no company is removed when the last one is erased.
 */
const PLATFORM_TABLES = new Set(['AuthAttempt', 'CompanyGroup', 'GroupAdmin', 'Login']);

function buildScopes(): TableScope[] {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m]));
  const hasOrg = (m: Model) => m.fields.some((f) => f.name === 'organizationId' && scalar(f));
  const table = (m: Model) => q(m.dbName ?? m.name);
  // Tables of the platform, not of any company: sign-in attempts are counted before anyone is known.
  return models.filter((m) => !PLATFORM_TABLES.has(m.name)).map((m): TableScope => {
    const delegate = lowerFirst(m.name);
    if (m.name === 'Organization') return { model: m, delegate, where: (id) => ({ id }), sql: `"id" = $1` };
    if (hasOrg(m)) return { model: m, delegate, where: (id) => ({ organizationId: id }), sql: `"organizationId" = $1` };
    const parent = m.fields.find((f) => f.kind === 'object' && f.relationFromFields?.length === 1 && byName.get(f.type) && hasOrg(byName.get(f.type)!));
    if (!parent) throw new Error(`Company data: no way to tell which organisation owns ${m.name}`);
    const parentModel = byName.get(parent.type)!;
    return {
      model: m,
      delegate,
      where: (id) => ({ [parent.name]: { organizationId: id } }),
      sql: `${q(parent.relationFromFields![0])} IN (SELECT "id" FROM ${table(parentModel)} WHERE "organizationId" = $1)`,
    };
  });
}

/** A value as it goes into a spreadsheet cell. */
function cell(f: Field, v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return f.nativeType?.[0] === 'Date' ? v.toISOString().slice(0, 10) : v.toISOString();
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
}

/**
 * Data export and company deletion (v3 item 33). An admin downloads everything the company has (the browser builds the
 * zip from these pages, so no single response gets large), or asks for the company to be erased after a grace period.
 */
@Injectable()
export class CompanyDataService {
  private readonly log = new Logger(CompanyDataService.name);
  private readonly scopes = buildScopes();
  private readonly exported = this.scopes.filter((s) => !NOT_EXPORTED.has(s.model.name));

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private email: EmailService,
    private messaging: MessagingService,
  ) {}

  private assertAdmin(user: RequestUser) {
    if (!canManageCompanyData(user.roleKey)) throw new ForbiddenException('Only an admin can export or delete company data');
  }

  private delegate(s: TableScope) {
    return (this.prisma as unknown as Record<string, { count: (a: unknown) => Promise<number>; findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[s.delegate];
  }

  /** Attachment link columns, each named after the kind of record a file belongs to (progressEntryId -> progressEntry). */
  private readonly fileLinks = Prisma.dmmf.datamodel.models
    .find((m) => m.name === 'Attachment')!
    .fields.filter((f) => f.kind === 'object' && f.type !== 'Organization' && f.type !== 'User' && f.relationFromFields?.length === 1)
    .map((f) => ({ column: f.relationFromFields![0], folder: f.name }));

  async manifest(user: RequestUser): Promise<CompanyExportManifestDto> {
    this.assertAdmin(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true } });
    const tables = await Promise.all(this.exported.map(async (s) => ({ name: s.model.name, rows: await this.delegate(s).count({ where: s.where(user.organizationId) }) })));
    const files = await this.prisma.attachment.aggregate({ where: { organizationId: user.organizationId }, _count: true, _sum: { size: true } });
    return { organizationName: org.name, tables: tables.filter((t) => t.rows > 0), files: files._count, fileBytes: files._sum.size ?? 0 };
  }

  /** Called when an admin starts a download, so the audit log shows who took the data. */
  async logExport(user: RequestUser) {
    this.assertAdmin(user);
    await this.audit.log(user, 'COMPANY', user.organizationId, 'EXPORTED', 'Downloaded all company data');
    return { ok: true };
  }

  async table(user: RequestUser, name: string, page: number, pageSize: number): Promise<CompanyExportPageDto> {
    this.assertAdmin(user);
    const s = this.exported.find((x) => x.model.name === name);
    if (!s) throw new NotFoundException(`No table called ${name}`);
    const fields = s.model.fields.filter((f) => scalar(f) && f.type !== 'Bytes' && !HIDDEN_COLUMN.test(f.name));
    const ids = s.model.primaryKey?.fields ?? s.model.fields.filter((f) => f.isId).map((f) => f.name);
    const where = s.where(user.organizationId);
    const [total, rows] = await Promise.all([
      this.delegate(s).count({ where }),
      this.delegate(s).findMany({
        where,
        select: Object.fromEntries(fields.map((f) => [f.name, true])),
        orderBy: ids.map((id) => ({ [id]: 'asc' })),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { name, columns: fields.map((f) => f.name), rows: rows.map((r) => fields.map((f) => cell(f, r[f.name]))), total };
  }

  async files(user: RequestUser, page: number, pageSize: number): Promise<{ total: number; items: CompanyExportFileDto[] }> {
    this.assertAdmin(user);
    const where = { organizationId: user.organizationId };
    const [total, rows] = await Promise.all([
      this.prisma.attachment.count({ where }),
      this.prisma.attachment.findMany({
        where,
        omit: { data: true },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      items: rows.map((r) => {
        const link = this.fileLinks.find((l) => (r as Record<string, unknown>)[l.column]);
        return { id: r.id, fileName: r.fileName, mimeType: r.mimeType, size: r.size, url: this.storage.toUrl(r.id, r.storagePath), folder: link?.folder ?? 'unlinked', createdAt: r.createdAt.toISOString() };
      }),
    };
  }

  /** What happened to the company as a whole, newest first. Actors can be platform staff from another organisation. */
  async companyLog(user: RequestUser): Promise<CompanyLogEntryDto[]> {
    this.assertAdmin(user);
    const rows = await this.prisma.auditLog.findMany({ where: { organizationId: user.organizationId, entityType: 'COMPANY', entityId: user.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const ids = [...new Set(rows.map((r) => r.actorId))];
    const actors = await withoutTenant(async () => await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, organizationId: true } }));
    const name = new Map(actors.map((a) => [a.id, a.organizationId === user.organizationId ? a.fullName : `${a.fullName} (${PRODUCT_NAME})`]));
    return rows.map((r) => ({ id: r.id, action: r.action, actorName: name.get(r.actorId) ?? '-', note: r.note, createdAt: r.createdAt.toISOString() }));
  }

  /* ---------- support access (consent for the platform admin) ---------- */

  async supportAccess(user: RequestUser): Promise<SupportAccessDto> {
    this.assertAdmin(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { supportAccessUntil: true, supportAccessGrantedByName: true } });
    const live = org.supportAccessUntil && org.supportAccessUntil > new Date();
    return { until: live ? org.supportAccessUntil!.toISOString() : null, grantedByName: live ? org.supportAccessGrantedByName : null };
  }

  /** Let support open the company read-only for SUPPORT_ACCESS_DAYS; asking again restarts the period. */
  async grantSupportAccess(user: RequestUser): Promise<SupportAccessDto> {
    this.assertAdmin(user);
    const until = new Date(Date.now() + SUPPORT_ACCESS_DAYS * 24 * 3600_000);
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { supportAccessUntil: until, supportAccessGrantedByName: user.fullName } });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'SUPPORT_ACCESS_GRANTED', `${PRODUCT_NAME} support may view the company read-only for ${SUPPORT_ACCESS_DAYS} days`);
    return this.supportAccess(user);
  }

  async revokeSupportAccess(user: RequestUser): Promise<SupportAccessDto> {
    this.assertAdmin(user);
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { supportAccessUntil: null, supportAccessGrantedByName: null } });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'SUPPORT_ACCESS_REVOKED', `${PRODUCT_NAME} support access withdrawn`);
    return this.supportAccess(user);
  }

  /* ---------- deletion ---------- */

  private protectedCodes() {
    return (process.env.PROTECTED_ORG_CODES ?? 'DEMO')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
  }

  async deletion(user: RequestUser): Promise<CompanyDeletionDto> {
    this.assertAdmin(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    return {
      requestedAt: org.deletionRequestedAt?.toISOString() ?? null,
      requestedByName: org.deletionRequestedByName,
      scheduledFor: org.deletionScheduledFor?.toISOString().slice(0, 10) ?? null,
      protected: this.protectedCodes().includes(org.code.toUpperCase()),
    };
  }

  async requestDeletion(user: RequestUser, companyName: string): Promise<CompanyDeletionDto> {
    this.assertAdmin(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    if (this.protectedCodes().includes(org.code.toUpperCase())) throw new BadRequestException('The demo company cannot be deleted');
    if (companyName.trim().replace(/\s+/g, ' ').toLowerCase() !== org.name.trim().replace(/\s+/g, ' ').toLowerCase()) {
      throw new BadRequestException('Type the company name exactly as shown to confirm');
    }
    if (org.deletionScheduledFor) return this.deletion(user);
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + DELETION_GRACE_DAYS);
    await this.prisma.organization.update({ where: { id: org.id }, data: { deletionRequestedAt: new Date(), deletionRequestedByName: user.fullName, deletionScheduledFor: day } });
    const on = formatDate(day.toISOString().slice(0, 10));
    await this.audit.log(user, 'COMPANY', org.id, 'DELETION_REQUESTED', `All company data will be erased on ${on}`);
    await this.tellAdmins(org.id, org.name, `${org.name} is set to be deleted on ${on}`, `${user.fullName} asked for ${org.name} and all its data to be deleted. Everything (projects, reports, bills, photos and user accounts) will be erased on <b>${on}</b>. Until then nothing changes and any admin can cancel it.`);
    return this.deletion(user);
  }

  async cancelDeletion(user: RequestUser): Promise<CompanyDeletionDto> {
    this.assertAdmin(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    if (org.deletionScheduledFor) {
      await this.prisma.organization.update({ where: { id: org.id }, data: { deletionRequestedAt: null, deletionRequestedByName: null, deletionScheduledFor: null } });
      await this.audit.log(user, 'COMPANY', org.id, 'DELETION_CANCELLED', 'Deletion of company data cancelled');
      await this.tellAdmins(org.id, org.name, `Deletion of ${org.name} cancelled`, `${user.fullName} cancelled the deletion of ${org.name}. Nothing will be erased.`);
    }
    return this.deletion(user);
  }

  private async tellAdmins(orgId: string, orgName: string, subject: string, html: string) {
    const admins = await this.prisma.user.findMany({ where: { organizationId: orgId, isActive: true, role: { key: 'ADMIN' } }, select: { email: true } });
    const link = this.messaging.webUrl('/company-data');
    const body = `<p>${html}</p>${link !== '-' ? emailButton(link, 'Data and privacy') : ''}`;
    const text = `${html.replace(/<[^>]+>/g, '')}${link !== '-' ? `\n\n${link}` : ''}`;
    for (const a of admins) {
      await this.email.send({ to: a.email, subject, html: emailLayout({ preheader: subject, body, orgName: escapeHtml(orgName) }), text }).catch((e) => this.log.warn(`deletion email to ${a.email}: ${e}`));
    }
  }

  /**
   * Erase every company whose deletion date has come (run daily with the digest job). One transaction per company:
   * links between its own rows are cleared first, then tables are emptied until none is left (a table still referenced
   * waits for the next pass). Stored files are removed after the rows are gone.
   */
  async purgeDue(today = new Date().toISOString().slice(0, 10)): Promise<{ purged: string[] }> {
    return withoutTenant(async () => {
      const due = await this.prisma.organization.findMany({ where: { deletionScheduledFor: { lte: new Date(`${today}T00:00:00Z`) } }, select: { id: true, code: true, name: true } });
      const purged: string[] = [];
      for (const org of due) {
        if (this.protectedCodes().includes(org.code.toUpperCase())) continue;
        const files = await this.prisma.attachment.findMany({ where: { organizationId: org.id }, select: { storagePath: true } });
        await this.purge(org.id);
        await this.storage.remove(files.map((f) => f.storagePath)).catch((e) => this.log.warn(`files of ${org.code}: ${e}`));
        this.log.log(`Erased company ${org.code} (${org.name})`);
        purged.push(org.code);
      }
      return { purged };
    });
  }

  private async purge(orgId: string) {
    const table = (m: Model) => q(m.dbName ?? m.name);
    await this.prisma.$transaction(
      async (tx) => {
        // Clear optional links first so rows that point at each other (a user's manager, a revision's superseded one) can go.
        for (const s of this.scopes) {
          const optional = s.model.fields.filter((f) => f.kind === 'object' && f.relationFromFields?.length && f.relationFromFields.every((c) => !s.model.fields.find((x) => x.name === c)?.isRequired));
          const cols = optional.flatMap((f) => f.relationFromFields!);
          if (cols.length && s.model.name !== 'Organization') await tx.$executeRawUnsafe(`UPDATE ${table(s.model)} SET ${cols.map((c) => `${q(c)} = NULL`).join(', ')} WHERE ${s.sql}`, orgId);
        }
        let left = this.scopes.filter((s) => s.model.name !== 'Organization');
        while (left.length) {
          const blocked: TableScope[] = [];
          for (const s of left) {
            await tx.$executeRawUnsafe('SAVEPOINT purge_step');
            try {
              await tx.$executeRawUnsafe(`DELETE FROM ${table(s.model)} WHERE ${s.sql}`, orgId);
              await tx.$executeRawUnsafe('RELEASE SAVEPOINT purge_step');
            } catch {
              await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT purge_step');
              blocked.push(s);
            }
          }
          if (blocked.length === left.length) throw new Error(`Company data: cannot erase ${blocked.map((b) => b.model.name).join(', ')}`);
          left = blocked;
        }
        await tx.$executeRawUnsafe(`DELETE FROM "Organization" WHERE "id" = $1`, orgId);
        // Sign-ins left with no company (group companies), and a group left with none, go with it.
        await tx.$executeRawUnsafe(`DELETE FROM "Login" l WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."loginId" = l."id")`);
        await tx.$executeRawUnsafe(`DELETE FROM "CompanyGroup" g WHERE NOT EXISTS (SELECT 1 FROM "Organization" o WHERE o."groupId" = g."id")`);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}

