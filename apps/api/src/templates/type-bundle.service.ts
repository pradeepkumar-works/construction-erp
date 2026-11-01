import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  canManageTemplates,
  componentKindProblems,
  importAction,
  normaliseKindDef,
  normaliseTypeDef,
  projectTypeProblems,
  readBundle,
  sameDef,
  type BundleType,
  type ComponentKindDef,
  type ImportRowDto,
  type TypeBundle,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectTypesService } from './project-types.service';
import { DprFormsService } from './dpr-forms.service';

export interface ImportPreviewDto {
  from: string;
  exportedAt: string;
  rows: ImportRowDto[];
}

export interface ImportResultDto {
  imported: number;
  skipped: string[];
}

const rowKey = (r: Pick<ImportRowDto, 'what' | 'code'>) => `${r.what}:${r.code}`;

/**
 * Export and import of project types and component kinds (ARCHITECTURE "Project types", Export and
 * import): a file another company (or a child company, once group sharing comes) reads in. Everything it saves goes
 * through the editors' own checks and write paths, as new rows or new versions; nothing is deleted.
 */
@Injectable()
export class TypeBundleService {
  constructor(private prisma: PrismaService, private audit: AuditService, private types: ProjectTypesService, private forms: DprFormsService) {}

  private assertManage(user: RequestUser) {
    if (!canManageTemplates(user.roleKey)) throw new ForbiddenException('Only admin or management can export or import project types');
  }

  private async companyName(organizationId: string) {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })).name;
  }

  /** A type as the file holds it: its loose activities, and its DPR form when the company changed it. */
  private async bundleType(organizationId: string, code: string): Promise<BundleType | null> {
    const type = await this.types.type(organizationId, code);
    if (!type) return null;
    const form = await this.forms.latest(organizationId, code, type.baseType);
    return normaliseTypeDef({ ...type, dprForm: form.standard ? null : form.def });
  }

  /** One type and the kinds it uses that the company made or changed (the built-in ones are the same everywhere). */
  async exportType(user: RequestUser, code: string): Promise<TypeBundle> {
    this.assertManage(user);
    const type = await this.bundleType(user.organizationId, code);
    if (!type) throw new NotFoundException('Project type not found');
    const used = new Set([...type.kinds, ...type.breakdown.map((b) => b.kind)]);
    const kinds = (await this.types.kinds(user.organizationId)).filter((k) => used.has(k.code) && k.edited);
    await this.audit.log(user, 'PROJECT_TYPE', code, 'EXPORTED', `${type.name}, with ${kinds.length} component kinds`);
    return this.bundle(user, [type], kinds.map(({ row: _r, standard: _s, edited: _e, ...k }) => normaliseKindDef(k)));
  }

  /** The kinds the company made or changed, or those named. */
  async exportKinds(user: RequestUser, codes?: string[]): Promise<TypeBundle> {
    this.assertManage(user);
    const wanted = codes?.length ? new Set(codes) : null;
    const kinds = (await this.types.kinds(user.organizationId)).filter((k) => (wanted ? wanted.has(k.code) : k.edited));
    if (!kinds.length) throw new BadRequestException(wanted ? 'None of those component kinds is in the library' : 'Every kind is the built-in one; change or make a kind to export it');
    await this.audit.log(user, 'COMPONENT_KIND', 'ALL', 'EXPORTED', `${kinds.length} component kinds`);
    return this.bundle(user, [], kinds.map(({ row: _r, standard: _s, edited: _e, ...k }) => normaliseKindDef(k)));
  }

  private async bundle(user: RequestUser, types: BundleType[], kinds: ComponentKindDef[]): Promise<TypeBundle> {
    return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), from: await this.companyName(user.organizationId), types, kinds };
  }

  /** What importing the file would do, item by item; nothing is saved. */
  async preview(user: RequestUser, file: unknown): Promise<ImportPreviewDto & { bundle: TypeBundle }> {
    this.assertManage(user);
    const { bundle, problem } = readBundle(file);
    if (!bundle) throw new BadRequestException(problem);
    const org = user.organizationId;
    const [types, kinds] = await Promise.all([this.types.list(user), this.types.listKinds(user)]);
    const rows: ImportRowDto[] = [];
    for (const k of bundle.kinds) {
      const have = kinds.find((x) => x.code === k.code);
      const current = have ? { code: have.code, base: have.elementType, used: have.components, def: normaliseKindDef(have) } : undefined;
      const { action, note } = importAction({ code: k.code, base: k.elementType }, current, k, 'kind');
      rows.push({ what: 'KIND', code: k.code, name: k.name, action, note, problems: action === 'CREATE' || action === 'REPLACE' ? componentKindProblems(k) : [] });
    }
    // A type is checked against the kinds the company will have once the file's kinds are in.
    const incoming = rows.filter((r) => r.what === 'KIND' && r.action !== 'REFUSED' && !r.problems.length).map((r) => r.code);
    const known = [...new Set([...kinds.filter((k) => k.active).map((k) => k.code), ...incoming])].map((code) => ({ code }));
    for (const t of bundle.types) {
      const have = types.find((x) => x.code === t.code);
      const mine = have ? await this.bundleType(org, have.code) : null;
      const current = have && mine ? { code: have.code, base: have.baseType, used: have.projects, def: mine } : undefined;
      const { action, note } = importAction({ code: t.code, base: t.baseType }, current, t, 'type');
      const problems: string[] = [];
      if (action === 'CREATE' || action === 'REPLACE') {
        const { dprForm, ...def } = t;
        problems.push(...projectTypeProblems(def, known));
        if (dprForm && !sameDef(dprForm, mine?.dprForm ?? null) && def.baseType) problems.push(...(await this.forms.check(org, t.code, def.baseType, dprForm)).problems.map((p) => `DPR form: ${p}`));
      }
      const formNote = action === 'REPLACE' && t.dprForm && !sameDef(t.dprForm, mine?.dprForm ?? null) ? 'Its DPR form is saved as a new version' : null;
      rows.push({ what: 'TYPE', code: t.code, name: t.name, action, note: [note, formNote].filter(Boolean).join('. ') || null, problems });
    }
    return { from: bundle.from, exportedAt: bundle.exportedAt, rows, bundle };
  }

  /** Import the items picked (`TYPE:CODE`, `KIND:CODE`) that the preview allows: kinds first, then types and their forms. */
  async import(user: RequestUser, file: unknown, picks: string[]): Promise<ImportResultDto> {
    const { rows, bundle } = await this.preview(user, file);
    const wanted = new Set(picks);
    const go = (r: ImportRowDto) => wanted.has(rowKey(r)) && (r.action === 'CREATE' || r.action === 'REPLACE') && !r.problems.length;
    const skipped = rows.filter((r) => wanted.has(rowKey(r)) && !go(r)).map((r) => `${r.name || r.code}: ${r.problems[0] ?? r.note ?? 'nothing to change'}`);
    let imported = 0;
    for (const k of bundle.kinds) {
      const r = rows.find((x) => x.what === 'KIND' && x.code === k.code)!;
      if (!go(r)) continue;
      await this.types.putKind(user, k);
      imported++;
    }
    const kinds = await this.types.kinds(user.organizationId);
    for (const t of bundle.types) {
      const r = rows.find((x) => x.what === 'TYPE' && x.code === t.code)!;
      if (!go(r)) continue;
      const { dprForm, ...def } = t;
      await this.types.putType(user, def, kinds.filter((k) => k.active || def.kinds.includes(k.code) || def.breakdown.some((b) => b.kind === k.code)));
      if (dprForm) {
        const now = await this.forms.latest(user.organizationId, t.code, t.baseType);
        if (now.standard || !sameDef(now.def, dprForm)) await this.forms.save(user, t.code, dprForm, 'IMPORTED');
      }
      imported++;
    }
    if (!imported && !skipped.length) throw new BadRequestException('Choose what to import');
    return { imported, skipped };
  }
}
