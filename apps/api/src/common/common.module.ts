import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { AuditService } from './audit.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [ProjectAccessService, AuditService, SubmissionLifecycleService, AttachmentsService, StorageService],
  exports: [ProjectAccessService, AuditService, SubmissionLifecycleService, AttachmentsService, StorageService],
})
export class CommonModule {}
