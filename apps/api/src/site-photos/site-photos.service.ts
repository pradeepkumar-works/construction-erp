import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { photoPlace, placeCounts, type PhotoFix, type SitePhotoDto, type SitePhotosDto, type SitePhotoSource } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { StorageService } from '../common/storage.service';
import { RequestUser } from '../common/current-user';
import { dateOnly } from '../common/serialize';
import { JOB_TIMEZONE, atWallClock, todayIn } from '../notifications/time';

/** The most photos one timeline shows; a longer range is cut to its latest. */
export const TIMELINE_LIMIT = 300;
/** Days a timeline covers when it is not told. */
export const TIMELINE_DAYS = 30;

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The day and "HH:mm" an instant reads in the company's time zone. */
function wallDay(d: Date, timeZone = JOB_TIMEZONE): { day: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/**
 * A project's photo timeline (ARCHITECTURE "Site photos", Photo timeline): every photo on its progress entries, DPRs
 * and inspections that are past draft, read with the same project rule as those lists, by the day it was taken and
 * where it stands against the site's pin.
 */
@Injectable()
export class SitePhotosService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private storage: StorageService) {}

  async timeline(user: RequestUser, projectId: string, q: { from?: string; to?: string }): Promise<SitePhotosDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findFirstOrThrow({ where: { id: projectId, organizationId: user.organizationId }, select: { siteLat: true, siteLng: true } });
    const to = q.to ?? todayIn();
    const from = q.from ?? addDays(to, -(TIMELINE_DAYS - 1));
    const days = { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) };
    const filed = { projectId, status: { not: 'DRAFT' as const }, ...this.access.submissionWhere(user) };
    const taken = { gte: atWallClock(from, '00:00'), lt: atWallClock(addDays(to, 1), '00:00') };
    const where: Prisma.AttachmentWhereInput = {
      organizationId: user.organizationId,
      mimeType: { startsWith: 'image/' },
      OR: [{ progressEntry: filed }, { dailyReport: filed }, { inspection: filed }],
      AND: [
        {
          OR: [
            { takenAt: taken },
            { takenAt: null, OR: [{ progressEntry: { date: days } }, { dailyReport: { date: days } }, { inspection: { date: days } }] },
          ],
        },
      ],
    };
    const record = { select: { id: true, date: true, status: true } } as const;
    const [rows, total] = await Promise.all([
      this.prisma.attachment.findMany({
        where,
        select: {
          id: true,
          fileName: true,
          takenAt: true,
          lat: true,
          lng: true,
          accuracyM: true,
          createdAt: true,
          uploadedBy: { select: { fullName: true } },
          progressEntry: { select: { ...record.select, activity: { select: { name: true } } } },
          dailyReport: record,
          inspection: { select: { ...record.select, checklistName: true, activity: { select: { name: true } } } },
        },
        orderBy: [{ takenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
        take: TIMELINE_LIMIT,
      }),
      this.prisma.attachment.count({ where }),
    ]);
    const site = project.siteLat !== null && project.siteLng !== null ? { lat: Number(project.siteLat), lng: Number(project.siteLng) } : null;
    const photos: SitePhotoDto[] = [];
    for (const r of rows) {
      const src: { kind: SitePhotoSource; row: { id: string; date: Date; status: string }; title: string } | null = r.progressEntry
        ? { kind: 'PROGRESS', row: r.progressEntry, title: r.progressEntry.activity.name }
        : r.dailyReport
          ? { kind: 'DPR', row: r.dailyReport, title: 'Daily progress report' }
          : r.inspection
            ? { kind: 'INSPECTION', row: r.inspection, title: r.inspection.checklistName || `Inspection: ${r.inspection.activity.name}` }
            : null;
      if (!src) continue;
      const at = r.takenAt ? wallDay(r.takenAt) : null;
      const fix: PhotoFix | null = r.lat !== null && r.lng !== null ? { lat: num(r.lat)!, lng: num(r.lng)!, accuracyM: r.accuracyM } : null;
      photos.push({
        id: r.id,
        url: this.storage.toUrl(r.id),
        fileName: r.fileName,
        day: at?.day ?? dateOnly(src.row.date),
        time: at?.time ?? null,
        place: photoPlace(fix, site),
        fix,
        uploadedBy: r.uploadedBy.fullName,
        record: { kind: src.kind, id: src.row.id, title: src.title, date: dateOnly(src.row.date), status: src.row.status },
      });
    }
    return { projectId, from, to, sitePinned: !!site, photos, total, counts: placeCounts(photos.map((p) => p.place)) };
  }
}
