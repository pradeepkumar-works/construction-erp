import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { WarningsService } from './warnings.service';
import { DismissWarningDto, WarningKeyDto, WarningKindDto } from './warnings.dto';

@ApiTags('warnings')
@ApiBearerAuth()
@Controller('warnings')
export class WarningsController {
  constructor(private warnings: WarningsService) {}

  @ApiOperation({
    summary: 'The watch list: early warnings for the caller',
    description:
      'Finishes slipping past the baseline at the current rate, a cash gap in the next eight weeks, materials used over their norms, fuel off its norm and machine loan EMIs overdue, vendors late or rejected more often, stock running out before an order could arrive, machines idle or breaking down more than the month before, and sites with no DPR three days running. Each kind for the roles that can act on it, over the projects the caller may see. Each warning leads with what to do and what it costs, carries its working and how sure it is (Checked, Likely, Check this), and each kind its track record.',
  })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.warnings.list(user);
  }

  @ApiOperation({
    summary: 'Dismiss a warning, saying what became of it',
    description: 'For the whole company, until its figures move on. The outcome counts in the kind\'s track record; a kind marked Wrong on more than half of at least 4 outcomes in 30 days pauses. Audited.',
  })
  @Post('dismiss')
  dismiss(@CurrentUser() user: RequestUser, @Body() dto: DismissWarningDto) {
    return this.warnings.dismiss(user, dto.key, dto.outcome, dto.reason);
  }

  @ApiOperation({ summary: 'Resume a paused kind of warning (admin and management)', description: 'Outcomes from before now stop counting towards a pause. Audited.' })
  @Post('resume')
  resume(@CurrentUser() user: RequestUser, @Body() dto: WarningKindDto) {
    return this.warnings.resume(user, dto.kind);
  }

  @ApiOperation({ summary: 'Bring back a dismissed warning', description: 'Audited.' })
  @Post('restore')
  restore(@CurrentUser() user: RequestUser, @Body() dto: WarningKeyDto) {
    return this.warnings.restore(user, dto.key);
  }
}
