import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Where uploaded files live.
 *  - BLOB_READ_WRITE_TOKEN set  -> Vercel Blob (returns an absolute https URL)
 *  - otherwise                  -> local disk under UPLOAD_DIR, served at /uploads/<path>
 * The returned string is stored in Attachment.storagePath; AttachmentsService turns it into a URL.
 */
@Injectable()
export class StorageService {
  private get useBlob() {
    return !!process.env.BLOB_READ_WRITE_TOKEN;
  }

  async save(file: Express.Multer.File, organizationId: string): Promise<string> {
    const day = new Date().toISOString().slice(0, 10);
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    const key = `${organizationId}/${day}/${randomUUID()}${ext}`;

    if (this.useBlob) {
      const { put } = await import('@vercel/blob');
      const blob = await put(key, file.buffer, { access: 'public', contentType: file.mimetype, addRandomSuffix: false });
      return blob.url;
    }

    const root = join(process.cwd(), process.env.UPLOAD_DIR || './uploads');
    const dir = join(root, organizationId, day);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, key), file.buffer);
    return key;
  }

  /** Absolute URLs (object storage) pass through; relative keys are served by the API itself. */
  toUrl(storagePath: string): string {
    return /^https?:\/\//.test(storagePath) ? storagePath : `/uploads/${storagePath}`;
  }
}
