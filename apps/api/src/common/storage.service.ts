import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

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
 *  - db   : STORAGE_MODE=db or running on Vercel -> bytes kept in Attachment.data, served by GET /api/uploads/:id/content
 *  - disk : otherwise                            -> UPLOAD_DIR on local disk, served under /uploads/<path>
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
    const day = new Date().toISOString().slice(0, 10);
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

  /** Absolute URLs pass through; db-stored files are served by the API; disk files under /uploads. */
  toUrl(id: string, storagePath: string): string {
    if (/^https?:\/\//.test(storagePath)) return storagePath;
    if (storagePath.startsWith('db:')) return `/api/uploads/${id}/content`;
    return `/uploads/${storagePath}`;
  }
}
