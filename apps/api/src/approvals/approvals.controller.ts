import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SUBMISSION_TYPES, type SubmissionType } from '@erp/shared';
import { BadRequestException } from '@nestjs/common';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ReviewDto } from './approvals.dto';

/** Fewest characters a reason to reject or send back may have (the web and the phone ask the same). */
const MIN_REASON_LENGTH = 5;

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

  /** What the current user reviewed since `since` (an ISO time, by default the last 24 hours), newest first. */
  @Get('reviewed')
  reviewed(@CurrentUser() user: RequestUser, @Query('since') since?: string) {
    const from = since ? new Date(since) : new Date(Date.now() - 24 * 3600_000);
    if (Number.isNaN(from.getTime())) throw new BadRequestException('since must be an ISO date-time');
    return this.lifecycle.reviewedBy(user, from);
  }

  /** Generic review endpoint for every submission type except INSPECTION, which is reviewed with its checklist. */
  @Post(':type/:id/review')
  async review(@CurrentUser() user: RequestUser, @Param('type') type: string, @Param('id') id: string, @Body() dto: ReviewDto) {
    const t = type.toUpperCase() as SubmissionType;
    if (!SUBMISSION_TYPES.includes(t)) throw new BadRequestException('Unknown submission type');
    if (t === 'INSPECTION') throw new BadRequestException('Record the checklist with the inspection: POST /inspections/:id/inspect');
    // Rejecting or sending back needs a reason of a few words, so the submitter knows what to fix (UX item 88).
    const note = dto.note?.trim() || null;
    if (dto.decision !== 'APPROVE' && (note?.length ?? 0) < MIN_REASON_LENGTH) {
      throw new BadRequestException(dto.decision === 'REJECT' ? 'Say why you are rejecting it' : 'Say what needs changing');
    }
    await this.lifecycle.review(user, t, id, dto.decision, note);
    return { ok: true };
  }

  @Get(':type/:id/audit')
  auditTrail(@CurrentUser() user: RequestUser, @Param('type') type: string, @Param('id') id: string) {
    const t = type.toUpperCase() as SubmissionType;
    if (!SUBMISSION_TYPES.includes(t)) throw new BadRequestException('Unknown submission type');
    return this.audit.forEntity(user.organizationId, t, id);
  }
}
