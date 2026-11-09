import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { todayIn } from '../notifications/time';
import { fileIdOfLink, fileLinkQuery } from './file-links';
import { jwtSecret } from './jwt-secret';

export type StorageMode = 'blob' | 'db' | 'disk';

export interface SavedFile {
  /** Value for Attachment.storagePath */
  storagePath: string;
  /** Bytes to persist in Attachment.data (db mode only) */
  data: Buffer | null;
}

/**
 * Where uploaded files live. Chosen automatically:
 *  - blob : BLOB_READ_WRITE_TOKEN set            -> Vercel Blob, storagePath is an absolute https URL
 *  - db   : STORAGE_MODE=db or running on Vercel -> bytes kept in Attachment.data
 *  - disk : otherwise                            -> UPLOAD_DIR on local disk
 * Whichever it is, a reader opens a file only through its signed link, `toUrl` (`file-links.ts`).
 */
@Injectable()
export class StorageService {
  get mode(): StorageMode {
    if (process.env.STORAGE_MODE === 'db') return 'db';
    if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
    if (process.env.VERCEL) return 'db';
    return 'disk';
  }

  async save(file: Express.Multer.File, organizationId: string): Promise<SavedFile> {
    const day = todayIn();
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    const key = `${organizationId}/${day}/${randomUUID()}${ext}`;

    switch (this.mode) {
      case 'blob': {
        const { put } = await import('@vercel/blob');
        const blob = await put(key, file.buffer, { access: 'public', contentType: file.mimetype, addRandomSuffix: false });
        return { storagePath: blob.url, data: null };
      }
      case 'db':
        return { storagePath: `db:${key}`, data: file.buffer };
      default: {
        const root = join(process.cwd(), process.env.UPLOAD_DIR || './uploads');
        const dir = join(root, organizationId, day);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(join(root, key), file.buffer);
        return { storagePath: key, data: null };
      }
    }
  }

  /** Remove stored files (company deletion). Files kept in the database go with their rows. */
  async remove(storagePaths: string[]): Promise<void> {
    const urls = storagePaths.filter((p) => /^https?:\/\//.test(p));
    if (urls.length && process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import('@vercel/blob');
      for (let i = 0; i < urls.length; i += 500) await del(urls.slice(i, i + 500));
    }
    const root = join(process.cwd(), process.env.UPLOAD_DIR || './uploads');
    for (const p of storagePaths.filter((x) => !x.startsWith('db:') && !/^https?:\/\//.test(x))) rmSync(join(root, p), { force: true });
  }

  /** A stored file's bytes: from the row (db), the blob store's URL, or the disk. */
  async read(storagePath: string, data: Uint8Array | null): Promise<Buffer> {
    if (data) return Buffer.from(data);
    if (/^https?:\/\//.test(storagePath)) {
      const res = await fetch(storagePath);
      if (!res.ok) throw new Error(`file ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (storagePath.startsWith('db:')) throw new Error('file has no bytes');
    return readFileSync(join(process.cwd(), process.env.UPLOAD_DIR || './uploads', storagePath));
  }

  /** The signed link that opens a file, served by GET /api/uploads/:id/content, for whoever was given its record. */
  toUrl(id: string): string {
    return `/api/uploads/${id}/content?${fileLinkQuery(id, Math.floor(Date.now() / 1000), jwtSecret())}`;
  }

  /** A file link kept in a saved copy (an issued report), signed afresh; any other URL as it was. */
  relink(url: string): string {
    const id = fileIdOfLink(url);
    return id ? this.toUrl(id) : url;
  }
}
