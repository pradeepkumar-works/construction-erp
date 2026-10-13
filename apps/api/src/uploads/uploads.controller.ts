import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../common/attachments.service';
import { StorageService } from '../common/storage.service';
import { CurrentUser, RequestUser } from '../common/current-user';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private prisma: PrismaService, private attachments: AttachmentsService, private storage: StorageService) {}

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
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
    }),
  )
  async upload(@CurrentUser() user: RequestUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded or file type not allowed (jpeg, png, webp, heic, pdf)');
    const storagePath = await this.storage.save(file, user.organizationId);
    const row = await this.prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
        uploadedById: user.id,
      },
    });
    return this.attachments.toDto(row);
  }
}
