import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import {
  SAFETY_INCIDENT_TYPE_LABELS,
  PHOTO_CHECKS_PER_RUN,
  PHOTO_CHECK_MAX_BYTES,
  canManageSafety,
  canReportDefect,
  type AttachmentDto,
  type PhotoCheckDto,
  type PhotoCheckKind,
  type PhotoChecksDto,
  type SnagDraftDto,
} from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { StorageService } from '../common/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { DprService } from '../dpr/dpr.service';
import { ProgressService } from '../progress/progress.service';
import { SafetyService } from '../safety/safety.service';
import { HandoverService } from '../handover/handover.service';
import { PHOTO_CHECK_PROMPT, normalisePhotoReply, parsePhotoReply, photoContextText, shownFlags, storedFlags, type PhotoContext, type PhotoReading } from './photo-rules';

const MODEL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ModelType = (typeof MODEL_TYPES)[number];
/** A photo the model could not read is tried again after this long (ms). */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
/** Time spent checking photos in one request, at most (ms). */
const RUN_BUDGET_MS = 45_000;

interface PhotoRecord {
  projectId: string;
  projectName: string;
  entry: string | null;
  photos: AttachmentDto[];
}

const isPhoto = (a: Pick<AttachmentDto, 'mimeType'>) => a.mimeType.startsWith('image/');
const joined = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join('; ') || null;

/**
 * Site photo checks (AI item 76): each photo on a DPR, a progress entry, a safety incident or a snag is shown to the
 * model once, the first time someone who can use Ask Nirmaan opens the record, and what it saw is kept. Who sees the
 * checks is who sees the record (its own service loads it). Advisory only: nothing here changes the record or its
 * approval, and the project's safety officer can switch the flags off.
 */
@Injectable()
export class PhotoChecksService {
  private readonly log = new Logger(PhotoChecksService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private storage: StorageService,
    private audit: AuditService,
    private ai: AiService,
    private dpr: DprService,
    private progress: ProgressService,
    private safety: SafetyService,
    private handover: HandoverService,
  ) {}

  /** The record as its own page loads it (which applies who may see it), with the words a photo is compared with. */
  private async record(user: RequestUser, kind: PhotoCheckKind, id: string): Promise<PhotoRecord> {
    switch (kind) {
      case 'dpr': {
        const r = await this.dpr.get(user, id);
        return { projectId: r.projectId, projectName: r.projectName, entry: joined(`DPR of ${r.date}`, `work done: ${r.workExecuted}`, r.safetyObservations && `safety: ${r.safetyObservations}`), photos: r.attachments.filter(isPhoto) };
      }
      case 'progress': {
        const r = await this.progress.get(user, id);
        const place = joined(r.location, r.floor && `floor ${r.floor}`, r.village, r.chainageFrom != null ? `chainage ${r.chainageFrom} to ${r.chainageTo ?? r.chainageFrom}` : null);
        return { projectId: r.projectId, projectName: r.projectName, entry: joined(`${r.activityName}, ${r.quantity} ${r.unit} on ${r.date}`, place, r.remarks), photos: r.attachments.filter(isPhoto) };
      }
      case 'incident': {
        const r = await this.safety.getIncident(user, id);
        return { projectId: r.projectId, projectName: r.projectName, entry: joined(`${SAFETY_INCIDENT_TYPE_LABELS[r.type]} at ${r.location} on ${r.date}`, r.description), photos: r.attachments.filter(isPhoto) };
      }
      case 'defect': {
        const r = await this.handover.getDefect(user, id);
        return { projectId: r.projectId, projectName: r.projectName, entry: joined(r.title, r.location, r.description), photos: r.attachments.filter(isPhoto) };
      }
    }
  }

  async get(user: RequestUser, kind: PhotoCheckKind, id: string): Promise<PhotoChecksDto> {
    return this.build(user, kind, id, await this.record(user, kind, id));
  }

  private async build(user: RequestUser, kind: PhotoCheckKind, id: string, rec: PhotoRecord): Promise<PhotoChecksDto> {
    const [rows, project, status] = await Promise.all([
      this.prisma.photoCheck.findMany({ where: { organizationId: user.organizationId, attachmentId: { in: rec.photos.map((p) => p.id) } } }),
      this.prisma.project.findUnique({ where: { id: rec.projectId }, select: { photoFlagsOff: true } }),
      this.ai.status(user),
    ]);
    const flagsOff = !!project?.photoFlagsOff;
    const byPhoto = new Map(rows.map((r) => [r.attachmentId, r]));
    const checks: PhotoCheckDto[] = rec.photos.flatMap((p) => {
      const r = byPhoto.get(p.id);
      if (!r || this.due(r)) return [];
      return [{ attachmentId: p.id, fileName: p.fileName, status: r.status as PhotoCheckDto['status'], caption: r.caption, flags: shownFlags(storedFlags(r.flags), flagsOff), reason: r.reason }];
    });
    return {
      kind,
      recordId: id,
      projectId: rec.projectId,
      available: status.enabled,
      flagsOff,
      canSwitch: canManageSafety(user.roleKey) && !user.support,
      checks,
      pending: rec.photos.length - checks.length,
    };
  }

  /** A failed reading is tried again a day later. */
  private due(r: { status: string; createdAt: Date }) {
    return r.status === 'FAILED' && r.createdAt.getTime() < Date.now() - RETRY_AFTER_MS;
  }

  /** Checks the record's next few unchecked photos (as many as fit in the time), then returns the checks. */
  async run(user: RequestUser, kind: PhotoCheckKind, id: string): Promise<PhotoChecksDto> {
    const rec = await this.record(user, kind, id);
    await this.ai.assertCanUse(user);
    const rows = await this.prisma.photoCheck.findMany({ where: { organizationId: user.organizationId, attachmentId: { in: rec.photos.map((p) => p.id) } }, select: { attachmentId: true, status: true, createdAt: true } });
    const done = new Set(rows.filter((r) => !this.due(r)).map((r) => r.attachmentId));
    const started = Date.now();
    for (const photo of rec.photos.filter((p) => !done.has(p.id)).slice(0, PHOTO_CHECKS_PER_RUN)) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      await this.check(user, rec.projectId, photo.id, { kind, projectName: rec.projectName, entry: rec.entry, fileName: photo.fileName });
    }
    return this.build(user, kind, id, rec);
  }

  /**
   * One photo to the model and its reading kept. A photo in a format or size the model does not take is kept as
   * skipped with the reason; a failed call is kept as failed (tried again a day later). The allowance running out or
   * the company switching Ask Nirmaan off stops the run with the usual message.
   */
  private async check(user: RequestUser, projectId: string, attachmentId: string, c: PhotoContext): Promise<PhotoReading | null> {
    const file = await this.prisma.attachment.findFirst({ where: { id: attachmentId, organizationId: user.organizationId }, select: { mimeType: true, size: true, storagePath: true, data: true } });
    if (!file) throw new NotFoundException('Photo not found');
    const keep = (data: Omit<Prisma.PhotoCheckUncheckedCreateInput, 'organizationId' | 'projectId' | 'attachmentId'>) =>
      this.prisma.photoCheck.upsert({
        where: { attachmentId },
        create: { organizationId: user.organizationId, projectId, attachmentId, ...data },
        update: { ...data, createdAt: new Date() },
      });
    if (!(MODEL_TYPES as readonly string[]).includes(file.mimeType)) {
      await keep({ status: 'SKIPPED', reason: 'Only JPEG, PNG and WebP photos are checked' });
      return null;
    }
    if (file.size > PHOTO_CHECK_MAX_BYTES) {
      await keep({ status: 'SKIPPED', reason: 'Too large to check; photos taken in the site app are sent smaller' });
      return null;
    }
    const started = Date.now();
    let reply: { text: string; model: string; costPaise: number };
    try {
      const bytes = await this.storage.read(file.storagePath, file.data);
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        { type: 'image', source: { type: 'base64', media_type: file.mimeType as ModelType, data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: photoContextText(c) },
      ];
      reply = await this.ai.singleTurn(user, PHOTO_CHECK_PROMPT, content, 40_000);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.warn(`photo ${attachmentId}: ${(e as Error).message}`);
      await keep({ status: 'FAILED', reason: 'The photo could not be checked just now', ms: Date.now() - started });
      return null;
    }
    const raw = parsePhotoReply(reply.text);
    const reading = raw ? normalisePhotoReply(raw, c) : null;
    await keep({
      status: reading ? 'DONE' : 'FAILED',
      caption: reading?.caption ?? null,
      flags: (reading?.flags ?? []) as unknown as Prisma.InputJsonValue,
      draft: reading?.draft ? (reading.draft as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      reason: reading ? null : 'The reply could not be read',
      model: reply.model,
      costPaise: reply.costPaise,
      ms: Date.now() - started,
    });
    return reading;
  }

  /**
   * A new snag's title, description, place and trade from its photo, for the form (nothing is saved but the photo's
   * check). The photo must be one this user uploaded, or one already on a snag of the project.
   */
  async snagDraft(user: RequestUser, attachmentId: string, projectId: string): Promise<SnagDraftDto> {
    if (!canReportDefect(user.roleKey)) throw new ForbiddenException('Your role does not report snags');
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ...this.access.projectWhere(user) }, select: { id: true, name: true, photoFlagsOff: true } });
    if (!project) throw new NotFoundException('Project not found or not accessible');
    const photo = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, organizationId: user.organizationId, mimeType: { startsWith: 'image/' }, OR: [{ uploadedById: user.id }, { defect: { projectId } }] },
      select: { id: true, fileName: true, photoCheck: { select: { draft: true, caption: true, flags: true } } },
    });
    if (!photo) throw new NotFoundException('Photo not found');
    const kept = photo.photoCheck?.draft as PhotoReading['draft'] | null | undefined;
    if (kept?.title) return { ...kept, caption: photo.photoCheck?.caption ?? null, flags: shownFlags(storedFlags(photo.photoCheck?.flags), project.photoFlagsOff) };
    await this.ai.assertCanUse(user);
    const reading = await this.check(user, project.id, photo.id, { kind: 'snag-draft', projectName: project.name, entry: null, fileName: photo.fileName });
    if (!reading?.draft) throw new HttpException('That photo could not be described. Write the snag by hand.', HttpStatus.UNPROCESSABLE_ENTITY);
    return { ...reading.draft, caption: reading.caption, flags: shownFlags(reading.flags, project.photoFlagsOff) };
  }

  /** The project's safety officer (or a safety manager role on it) switches the photo flags off or back on. */
  async setFlagsOff(user: RequestUser, projectId: string, off: boolean): Promise<{ projectId: string; flagsOff: boolean }> {
    if (!canManageSafety(user.roleKey) || user.support) throw new ForbiddenException('Only the safety officer or a project approver can switch photo flags');
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ...this.access.projectWhere(user) }, select: { id: true, photoFlagsOff: true } });
    if (!project) throw new NotFoundException('Project not found or not accessible');
    if (project.photoFlagsOff !== off) {
      await this.prisma.project.update({ where: { id: projectId }, data: { photoFlagsOff: off } });
      await this.audit.log(user, 'Project', projectId, off ? 'PHOTO_FLAGS_OFF' : 'PHOTO_FLAGS_ON');
    }
    return { projectId, flagsOff: off };
  }
}
