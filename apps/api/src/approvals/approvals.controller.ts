import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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

  @ApiOperation({ summary: 'My entries waiting for approval', description: 'v5 item 94, Waiting with others: each one\'s level, the roles whose queue it is in and since when, longest waiting first.' })
  @Get('waiting')
  waiting(@CurrentUser() user: RequestUser) {
    return this.lifecycle.waiting(user);
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
    // Rejecting or sending back needs a reason of a few words, so the submitter knows what to fix.
    const note = dto.note?.trim() || null;
    if (dto.decision !== 'APPROVE' && (note?.length ?? 0) < MIN_REASON_LENGTH) {
      throw new BadRequestException(dto.decision === 'REJECT' ? 'Say why you are rejecting it' : 'Say what needs changing');
    }
    // The status it now has, and the level decided: below the last level it stays SUBMITTED for the next.
    return { ok: true, ...(await this.lifecycle.review(user, t, id, dto.decision, note)) };
  }

  @ApiOperation({ summary: "An entry's approval levels", description: 'v5 item 94: the level it waits at of the levels its amount needs, the steps so far, whose queue it is in, and whether the caller may decide it now (with the reason when not).' })
  @Get(':type/:id/stage')
  stage(@CurrentUser() user: RequestUser, @Param('type') type: string, @Param('id') id: string) {
    const t = type.toUpperCase() as SubmissionType;
    if (!SUBMISSION_TYPES.includes(t)) throw new BadRequestException('Unknown submission type');
    return this.lifecycle.stage(user, t, id);
  }

  @Get(':type/:id/audit')
  auditTrail(@CurrentUser() user: RequestUser, @Param('type') type: string, @Param('id') id: string) {
    const t = type.toUpperCase() as SubmissionType;
    if (!SUBMISSION_TYPES.includes(t)) throw new BadRequestException('Unknown submission type');
    return this.audit.forEntity(user.organizationId, t, id);
  }
}
