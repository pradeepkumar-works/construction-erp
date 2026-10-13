import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../common/attachments.service';
import { CurrentUser, RequestUser } from '../common/current-user';

const UPLOAD_ROOT = () => join(process.cwd(), process.env.UPLOAD_DIR || './uploads');
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private prisma: PrismaService, private attachments: AttachmentsService) {}

  /**
   * Upload a photo / document first, then pass the returned id in `attachmentIds` when creating
   * a progress entry, DPR or material request. Unlinked uploads are harmless orphans.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const day = new Date().toISOString().slice(0, 10);
          const dir = join(UPLOAD_ROOT(), day);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname || '').toLowerCase() || '.jpg'}`),
      }),
      fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
    }),
  )
  async upload(@CurrentUser() user: RequestUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded or file type not allowed (jpeg, png, webp, heic, pdf)');
    const day = new Date().toISOString().slice(0, 10);
    const row = await this.prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: `${day}/${file.filename}`,
        uploadedById: user.id,
      },
    });
    return this.attachments.toDto(row);
  }
}
