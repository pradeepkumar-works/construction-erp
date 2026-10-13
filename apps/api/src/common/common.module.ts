import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { AuditService } from './audit.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';
import { ApprovalRightsService } from './approval-rights.service';

@Global()
@Module({
  providers: [ProjectAccessService, AuditService, SubmissionLifecycleService, AttachmentsService, StorageService, ApprovalRightsService],
  exports: [ProjectAccessService, AuditService, SubmissionLifecycleService, AttachmentsService, StorageService, ApprovalRightsService],
})
export class CommonModule {}
