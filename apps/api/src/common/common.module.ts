import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { AuditService } from './audit.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';
import { ApprovalRightsService } from './approval-rights.service';
import { UndoService } from './undo.service';

@Global()
@Module({
  providers: [ProjectAccessService, AuditService, SubmissionLifecycleService, AttachmentsService, StorageService, ApprovalRightsService, UndoService],
  exports: [ProjectAccessService, AuditService, SubmissionLifecycleService, AttachmentsService, StorageService, ApprovalRightsService, UndoService],
})
export class CommonModule {}
