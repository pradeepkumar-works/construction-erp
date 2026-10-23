import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { HindranceService } from './hindrance.service';
import { HindranceQuery, RecordHindranceDto } from './hindrance.dto';

@ApiTags('risks')
@ApiBearerAuth()
@Controller('hindrances')
export class HindranceController {
  constructor(private hindrances: HindranceService) {}

  @ApiOperation({ summary: 'DPR remarks read as hindrances, to record or dismiss (AI item 123)' })
  @Get('suggestions')
  suggestions(@CurrentUser() user: RequestUser, @Query() q: HindranceQuery) {
    return this.hindrances.suggestions(user, q.projectId);
  }

  @ApiOperation({ summary: 'The hindrance a DPR remark reads as, if any' })
  @Get('dpr/:dprId')
  forReport(@CurrentUser() user: RequestUser, @Param('dprId', ParseUUIDPipe) dprId: string) {
    return this.hindrances.forReport(user, dprId);
  }

  @ApiOperation({ summary: 'Record a DPR hindrance as a delay, or into an open delay' })
  @Post(':id/record')
  record(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordHindranceDto) {
    return this.hindrances.record(user, id, dto);
  }

  @ApiOperation({ summary: 'Dismiss a DPR hindrance: nothing to record' })
  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.hindrances.dismiss(user, id);
  }

  @ApiOperation({ summary: 'A project’s hindrance notice period, and the clause in its filed contract' })
  @Get('notice-period/:projectId')
  noticePeriod(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.hindrances.noticePeriod(user, projectId);
  }

  @ApiOperation({ summary: 'A delay’s notice clock' })
  @Get('notice/:riskId')
  notice(@CurrentUser() user: RequestUser, @Param('riskId', ParseUUIDPipe) riskId: string) {
    return this.hindrances.notice(user, riskId);
  }

  @ApiOperation({ summary: 'The notice letter for a delay, for the letter form (nothing is saved)' })
  @Get('notice/:riskId/draft')
  draftNotice(@CurrentUser() user: RequestUser, @Param('riskId', ParseUUIDPipe) riskId: string) {
    return this.hindrances.draftNotice(user, riskId);
  }

  @ApiOperation({ summary: 'The delay register for an extension-of-time claim: delays, notices, letters and DPR entries' })
  @Get('register/:projectId')
  register(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.hindrances.register(user, projectId);
  }
}
