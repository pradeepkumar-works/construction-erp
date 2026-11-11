/**
 * Site photos with where and when they were taken (ARCHITECTURE "Site photos"), for the photo timeline. Invented throughout.
 *
 * - On each pinned site, two photos on each of its latest progress entries and daily reports past draft, taken through
 *   the working day on the record's day, within a few hundred metres of the pin.
 * - Two on BL-2026-02 stand out: one taken 2.3 km away, at the contractor's yard, and one with no location (the phone
 *   had no fix indoors).
 *
 * Generated placeholder pictures (sky, ground and a block of work) stored in the database, so they show on every host.
 * Skipped for a project that already has seeded site photos.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { deflateSync } from 'zlib';

const D = (v: number) => new Prisma.Decimal(v.toFixed(6));
const RECORDS_PER_KIND = 5;

/** A small PNG of a site: sky, ground and a grey block whose size and place vary with `n`. */
function sitePicture(n: number): Buffer {
  const w = 160, h = 120;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const horizon = 48 + (n * 7) % 18;
  const bx = 20 + (n * 29) % 70, bw = 40 + (n * 13) % 40, bt = horizon - 20 - (n * 11) % 22;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const block = x >= bx && x < bx + bw && y >= bt && y < horizon + 18;
      const bar = block && (y - bt) % 14 < 2;
      const [r, g, b] = bar ? [120, 113, 108] : block ? [168, 162, 158] : y < horizon ? [186 - y, 214 - y / 2, 240] : [150 - (y - horizon) / 3, 122 - (y - horizon) / 4, 92];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The instant a record's day reads `hh:mm` in India. */
const atIst = (day: Date, hh: number, mm: number) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm) - 330 * 60_000);

export async function seedSitePhotos(prisma: PrismaClient, organizationId: string) {
  const projects = await prisma.project.findMany({ where: { organizationId, siteLat: { not: null }, siteLng: { not: null } }, select: { id: true, code: true, siteLat: true, siteLng: true }, orderBy: { code: 'asc' } });
  let n = 0;
  for (const p of projects) {
    const seeded = await prisma.attachment.count({ where: { organizationId, storagePath: { startsWith: 'db:seed/site-photo-' }, OR: [{ progressEntry: { projectId: p.id } }, { dailyReport: { projectId: p.id } }] } });
    if (seeded) continue;
    const filed = { projectId: p.id, status: { not: 'DRAFT' as const } };
    const [entries, reports] = await Promise.all([
      prisma.progressEntry.findMany({ where: filed, select: { id: true, date: true, submittedById: true }, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: RECORDS_PER_KIND }),
      prisma.dailyReport.findMany({ where: filed, select: { id: true, date: true, submittedById: true }, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: RECORDS_PER_KIND }),
    ]);
    const lat = Number(p.siteLat), lng = Number(p.siteLng);
    const records = [...entries.map((r) => ({ ...r, kind: 'progressEntryId' as const })), ...reports.map((r) => ({ ...r, kind: 'dailyReportId' as const }))];
    for (const [i, r] of records.entries()) {
      for (const shot of [0, 1]) {
        n += 1;
        const file = sitePicture(n);
        // Within about 300 m of the pin, a different spot each time; on BL-2026-02 one at the yard and one with no fix.
        const away = p.code === 'BL-2026-02' && i === 1 && shot === 1;
        const noFix = p.code === 'BL-2026-02' && i === 2 && shot === 0;
        const dLat = away ? 0.0205 : (((n * 37) % 50) - 25) / 10_000;
        const dLng = away ? 0.0062 : (((n * 53) % 50) - 25) / 10_000;
        await prisma.attachment.create({
          data: {
            organizationId,
            fileName: `site-photo-${n}.png`,
            mimeType: 'image/png',
            size: file.length,
            storagePath: `db:seed/site-photo-${n}.png`,
            data: new Uint8Array(file),
            uploadedById: r.submittedById,
            [r.kind]: r.id,
            takenAt: atIst(r.date, 9 + ((i * 2 + shot * 3) % 8), (n * 17) % 60),
            lat: noFix ? null : D(lat + dLat),
            lng: noFix ? null : D(lng + dLng),
            accuracyM: noFix ? null : 6 + (n * 7) % 30,
            createdAt: atIst(r.date, 18, 30),
          },
        });
      }
    }
  }
}
