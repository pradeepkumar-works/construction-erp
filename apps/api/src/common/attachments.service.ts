import { Injectable } from '@nestjs/common';
import type { AttachmentDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { RequestUser } from './current-user';

type Parent = 'progressEntryId' | 'dailyReportId' | 'materialRequestId' | 'stockEntryId' | 'machineryLogId' | 'expenseId' | 'measurementId' | 'riskId' | 'raBillId' | 'purchaseOrderId' | 'vendorBillId' | 'workOrderId' | 'subcontractBillId' | 'inspectionId' | 'qualityTestId' | 'ncrId' | 'revisionId' | 'letterId' | 'variationId' | 'safetyIncidentId' | 'toolboxTalkId' | 'workPermitId' | 'maintenanceJobId' | 'equipmentDocId' | 'complianceDocId';

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  toDto(a: { id: string; fileName: string; mimeType: string; size: number; storagePath: string; createdAt: Date }): AttachmentDto {
    return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, url: this.storage.toUrl(a.id, a.storagePath), createdAt: a.createdAt.toISOString() };
  }

  /** Link previously uploaded (orphan) attachments to a parent entity. Only the uploader's own files within the org. */
  async link(user: RequestUser, parent: Parent, parentId: string, attachmentIds: string[] | undefined) {
    if (!attachmentIds || attachmentIds.length === 0) return;
    await this.prisma.attachment.updateMany({
      where: { id: { in: attachmentIds }, organizationId: user.organizationId, progressEntryId: null, dailyReportId: null, materialRequestId: null, stockEntryId: null, machineryLogId: null, expenseId: null, measurementId: null, riskId: null, raBillId: null, purchaseOrderId: null, vendorBillId: null, workOrderId: null, subcontractBillId: null, inspectionId: null, qualityTestId: null, ncrId: null, revisionId: null, letterId: null, variationId: null, safetyIncidentId: null, toolboxTalkId: null, workPermitId: null, maintenanceJobId: null, equipmentDocId: null, complianceDocId: null },
      data: { [parent]: parentId },
    });
  }

  /**
   * Make `attachmentIds` the complete set of attachments on a parent (used by edit / resubmit).
   * Files no longer listed are detached (they stay in storage as orphans); newly listed uploads are linked.
   * `undefined` leaves the attachments untouched.
   */
  async sync(user: RequestUser, parent: Parent, parentId: string, attachmentIds: string[] | undefined) {
    if (attachmentIds === undefined) return;
    await this.prisma.attachment.updateMany({
      where: { [parent]: parentId, organizationId: user.organizationId, id: { notIn: attachmentIds } },
      data: { [parent]: null },
    });
    await this.link(user, parent, parentId, attachmentIds);
  }
}
