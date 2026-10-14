import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SUBMISSION_TYPES, type SubmissionType } from '@erp/shared';
import { BadRequestException } from '@nestjs/common';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ReviewDto } from './approvals.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private lifecycle: SubmissionLifecycleService, private audit: AuditService) {}

  /** Everything waiting for the current user's decision. */
  @Get('pending')
  pending(@CurrentUser() user: RequestUser) {
    return this.lifecycle.pending(user);
  }

  /** Generic review endpoint: type is PROGRESS | DPR | MATERIAL_REQUEST | MACHINERY | EXPENSE | MEASUREMENT | BILL. */
  @Post(':type/:id/review')
  async review(@CurrentUser() user: RequestUser, @Param('type') type: string, @Param('id') id: string, @Body() dto: ReviewDto) {
    const t = type.toUpperCase() as SubmissionType;
    if (!SUBMISSION_TYPES.includes(t)) throw new BadRequestException('Unknown submission type');
    await this.lifecycle.review(user, t, id, dto.decision, dto.note);
    return { ok: true };
  }

  @Get(':type/:id/audit')
  auditTrail(@CurrentUser() user: RequestUser, @Param('type') type: string, @Param('id') id: string) {
    const t = type.toUpperCase() as SubmissionType;
    if (!SUBMISSION_TYPES.includes(t)) throw new BadRequestException('Unknown submission type');
    return this.audit.forEntity(user.organizationId, t, id);
  }
}
