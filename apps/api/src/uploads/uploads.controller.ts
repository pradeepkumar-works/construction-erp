import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import type { Response } from 'express';
import { Public, SupplierAllowed } from '../common/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../common/attachments.service';
import { StorageService } from '../common/storage.service';
import { CurrentUser, RequestUser } from '../common/current-user';
import { CAD_MIME_TYPES } from '@erp/shared';
import { CompleteDirectUploadDto, StartDirectUploadDto } from './uploads.dto';
import { todayIn } from '../notifications/time';
import { ACTIVE_FILE, SANDBOXED_FILE_CSP } from '../common/security-headers';
import { fileLinkProblem } from '../common/file-links';
import { jwtSecret } from '../common/jwt-secret';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', ...Object.values(CAD_MIME_TYPES)];
const ALLOWED_WORDS = 'jpeg, png, webp, heic, pdf, dxf, dwg';
/** The type a file is kept as: CAD drawings by their extension, since browsers send them as octet-stream or nothing. */
const typeOf = (fileName: string, sent: string) => CAD_MIME_TYPES[extname(fileName).toLowerCase()] ?? sent;
/** A file sent straight to Blob storage may be this large (a drawing set, a long invoice PDF). */
const DIRECT_MAX_BYTES = 100 * 1024 * 1024;

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private prisma: PrismaService, private attachments: AttachmentsService, private storage: StorageService) {}

  /**
   * Upload a photo / document first, then pass the returned id in `attachmentIds` when creating
   * a progress entry, DPR or material request. Unlinked uploads are harmless orphans.
   */
  @SupplierAllowed()
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        file.mimetype = typeOf(file.originalname, file.mimetype);
        cb(null, ALLOWED.includes(file.mimetype));
      },
    }),
  )
  async upload(@CurrentUser() user: RequestUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException(`No file uploaded or file type not allowed (${ALLOWED_WORDS})`);
    const saved = await this.storage.save(file, user.organizationId);
    const row = await this.prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: saved.storagePath,
        data: saved.data ? new Uint8Array(saved.data) : null,
        uploadedById: user.id,
      },
    });
    return this.attachments.toDto(row);
  }

  @ApiOperation({
    summary: 'Start sending a large file straight to Blob storage',
    description: 'For files over the 4.5 MB a hosted request takes. Returns a short-lived token for that one path; send the file with `@vercel/blob/client` `put`, then call `/uploads/direct/complete`. 409 when the server keeps files in its database.',
  })
  @SupplierAllowed()
  @Post('direct')
  async startDirect(@CurrentUser() user: RequestUser, @Body() dto: StartDirectUploadDto) {
    if (this.storage.mode !== 'blob') throw new ConflictException('Files over 4 MB need Blob storage, which this server does not use. Attach a smaller copy.');
    const mimeType = typeOf(dto.fileName, dto.mimeType);
    if (!ALLOWED.includes(mimeType)) throw new BadRequestException(`File type not allowed (${ALLOWED_WORDS})`);
    if (dto.size > DIRECT_MAX_BYTES) throw new BadRequestException('Files up to 100 MB');
    const ext = extname(dto.fileName).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.pdf';
    const pathname = `${user.organizationId}/${todayIn()}/${randomUUID()}${ext}`;
    const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      allowedContentTypes: [mimeType],
      maximumSizeInBytes: DIRECT_MAX_BYTES,
      validUntil: Date.now() + 15 * 60_000,
      addRandomSuffix: false,
    });
    return { pathname, clientToken, mimeType };
  }

  @ApiOperation({ summary: 'Record a file sent straight to Blob storage', description: 'Returns the attachment, to pass in `attachmentIds` like any upload.' })
  @SupplierAllowed()
  @Post('direct/complete')
  async completeDirect(@CurrentUser() user: RequestUser, @Body() dto: CompleteDirectUploadDto) {
    if (this.storage.mode !== 'blob') throw new ConflictException('This server does not use Blob storage');
    const url = new URL(dto.url);
    if (!url.hostname.endsWith('.blob.vercel-storage.com') || url.pathname !== `/${dto.pathname}` || !dto.pathname.startsWith(`${user.organizationId}/`)) throw new BadRequestException('Not a file this company sent');
    const { head } = await import('@vercel/blob');
    const blob = await head(dto.url).catch(() => null);
    if (!blob) throw new BadRequestException('The file did not arrive; send it again');
    const row = await this.prisma.attachment.create({
      data: { organizationId: user.organizationId, fileName: dto.fileName.slice(0, 200), mimeType: blob.contentType, size: blob.size, storagePath: blob.url, uploadedById: user.id },
    });
    return this.attachments.toDto(row);
  }

  /**
   * Opens a stored file. An `<img>` or a new tab sends no Authorization header, so the signed link handed out in a
   * record's attachments is the proof of sign-in and access (`file-links.ts`); a bare id opens nothing.
   */
  @ApiOperation({ summary: "Open a stored file through the signed link in its record's attachments", description: '403 without a valid, unexpired `e` and `s`.' })
  @Public()
  @Get(':id/content')
  async content(@Param('id') id: string, @Query('e') e: unknown, @Query('s') s: unknown, @Res() res: Response) {
    const now = Math.floor(Date.now() / 1000);
    const problem = fileLinkProblem(id, e, s, now, jwtSecret());
    if (problem === 'expired') throw new ForbiddenException('This file link has expired. Open the file again from its page.');
    if (problem) throw new ForbiddenException('This file link is not valid. Open the file from its page, signed in.');
    const row = await this.prisma.attachment.findUnique({ where: { id }, select: { data: true, storagePath: true, mimeType: true, fileName: true } });
    if (!row) throw new NotFoundException('File not found');
    res.setHeader('Cache-Control', `private, max-age=${Number(e) - now}`);
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!row.data && /^https?:\/\//.test(row.storagePath)) return res.redirect(302, row.storagePath);
    const bytes = await this.storage.read(row.storagePath, row.data).catch(() => null);
    if (!bytes) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.fileName)}"`);
    if (ACTIVE_FILE.test(row.mimeType)) res.setHeader('Content-Security-Policy', SANDBOXED_FILE_CSP);
    res.send(bytes);
  }
}
