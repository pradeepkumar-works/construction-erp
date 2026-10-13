import { Injectable } from '@nestjs/common';
import type { AttachmentDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';

type Parent = 'progressEntryId' | 'dailyReportId' | 'materialRequestId';

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService) {}

  toDto(a: { id: string; fileName: string; mimeType: string; size: number; storagePath: string; createdAt: Date }): AttachmentDto {
    return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, url: `/uploads/${a.storagePath}`, createdAt: a.createdAt.toISOString() };
  }

  /** Link previously uploaded (orphan) attachments to a parent entity. Only the uploader's own files within the org. */
  async link(user: RequestUser, parent: Parent, parentId: string, attachmentIds: string[] | undefined) {
    if (!attachmentIds || attachmentIds.length === 0) return;
    await this.prisma.attachment.updateMany({
      where: { id: { in: attachmentIds }, organizationId: user.organizationId, progressEntryId: null, dailyReportId: null, materialRequestId: null },
      data: { [parent]: parentId },
    });
  }
}
