import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { RequestUser } from './current-user';

/** How long after a delete its Undo still works. The web offers it for ten seconds; the rest is for a slow network. */
const UNDO_WINDOW_MS = 60_000;

type Row = Record<string, unknown>;

/** A deleted record as it was: its own row first, then rows deleted with it (lines), and links the delete cleared. */
export interface UndoSnapshot {
  /** Prisma model names (`holiday`, `quotationLine`), each with the full row as it was. The first is the record itself. */
  rows: { model: string; data: Row }[];
  /** Rows whose link to the record the delete set to null (`worker.vendorId`), put back on restore. */
  relink?: { model: string; field: string; ids: string[] }[];
}

/** What a kind needs to come back: its audit entity type, and the same access rule its delete checked. */
export interface UndoKind {
  entityType: string;
  /** Throws (403, 404) when this user may not delete, and so not restore, this record now. */
  check: (user: RequestUser, row: Row) => Promise<unknown> | unknown;
}

interface Payload {
  v: 1;
  k: string;
  o: string;
  u: string;
  x: number;
  s: UndoSnapshot;
}

const scalarFields = new Map(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name.charAt(0).toLowerCase() + m.name.slice(1),
    new Map(m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => [f.name, f.type])),
  ]),
);

/**
 * Undo for deletes that can be reversed. Deletes stay hard deletes: the delete hands back a sealed copy
 * of what it removed (`undo`), and `POST /undo` with it puts the same rows back, with the same ids, within a minute.
 * The copy is encrypted with the server's secret (AES-GCM, so it can be neither read, which keeps columns the user may
 * not see hidden, nor edited) and names the organisation and the user, so no one else can use it; restoring runs the
 * kind's own access rule again and writes `RESTORED` to the audit log. Nothing new is stored.
 */
@Injectable()
export class UndoService {
  private kinds = new Map<string, UndoKind>();
  private key = createHash('sha256').update(`undo:${process.env.JWT_SECRET || 'dev-secret'}`).digest();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Called once by the service that owns a kind, next to its delete. */
  register(kind: string, def: UndoKind) {
    this.kinds.set(kind, def);
  }

  /** The `undo` token a delete returns, made from the rows read just before deleting them. */
  offer(user: RequestUser, kind: string, snapshot: UndoSnapshot): string {
    if (!this.kinds.has(kind)) throw new Error(`Undo kind ${kind} is not registered`);
    const s: UndoSnapshot = {
      rows: snapshot.rows.map((r) => ({ model: r.model, data: this.plain(r.model, r.data) })),
      relink: snapshot.relink?.filter((l) => l.ids.length),
    };
    const payload: Payload = { v: 1, k: kind, o: user.organizationId, u: user.id, x: Date.now() + UNDO_WINDOW_MS, s };
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url');
  }

  async restore(user: RequestUser, token: string): Promise<{ ok: true; kind: string; id: string }> {
    const payload = this.read(token);
    if (payload.o !== user.organizationId || payload.u !== user.id) throw new ForbiddenException('Only the person who deleted this can undo it');
    if (Date.now() > payload.x) throw new GoneException('It is too late to undo this; add it again instead');
    const def = this.kinds.get(payload.k);
    const [first, ...rest] = payload.s.rows;
    if (!def || !first) throw new BadRequestException('This undo is not valid');
    for (const r of payload.s.rows) {
      if ('organizationId' in r.data && r.data.organizationId !== user.organizationId) throw new ForbiddenException('This undo is not valid');
    }
    const row = this.revive(first.model, first.data);
    await def.check(user, row);
    const id = String(row.id);
    try {
      await this.prisma.$transaction(async (tx) => {
        const db = tx as unknown as Record<string, { create: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
        await db[first.model].create({ data: row });
        for (const r of rest) await db[r.model].create({ data: this.revive(r.model, r.data) });
        for (const l of payload.s.relink ?? []) await db[l.model].updateMany({ where: { id: { in: l.ids }, [l.field]: null }, data: { [l.field]: id } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('It cannot come back: one with the same name or number was added since, or it is already back');
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new ConflictException('It cannot come back: what it belonged to was deleted since');
      throw e;
    }
    await this.audit.log(user, def.entityType, id, 'RESTORED', 'Undo after delete');
    return { ok: true, kind: payload.k, id };
  }

  private read(token: string): Payload {
    try {
      const raw = Buffer.from(String(token ?? ''), 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const p = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as Payload;
      if (p.v !== 1 || !Array.isArray(p.s?.rows)) throw new Error('shape');
      return p;
    } catch {
      throw new BadRequestException('This undo is not valid');
    }
  }

  /** The row's own columns only (no counts or relations read with it), as JSON. */
  private plain(model: string, data: Row): Row {
    const fields = scalarFields.get(model);
    if (!fields) throw new Error(`Unknown model ${model}`);
    const out: Row = {};
    for (const [name, type] of fields) {
      if (!(name in data)) continue;
      const v = data[name];
      if (type === 'Bytes') throw new Error(`Undo cannot keep ${model}.${name}`);
      out[name] = v instanceof Date ? v.toISOString() : v instanceof Prisma.Decimal ? v.toString() : v;
    }
    return out;
  }

  /** Back to what Prisma takes on create: dates as dates, an empty JSON column as the database's null. */
  private revive(model: string, data: Row): Row {
    const fields = scalarFields.get(model);
    if (!fields) throw new BadRequestException('This undo is not valid');
    const out: Row = {};
    for (const [name, type] of fields) {
      if (!(name in data)) continue;
      const v = data[name];
      if (type === 'DateTime' && typeof v === 'string') out[name] = new Date(v);
      else if (type === 'Json' && v === null) out[name] = Prisma.DbNull;
      else out[name] = v;
    }
    return out;
  }
}
