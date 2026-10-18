import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { WarningsService } from './warnings.service';
import { DismissWarningDto, WarningKeyDto } from './warnings.dto';

@ApiTags('warnings')
@ApiBearerAuth()
@Controller('warnings')
export class WarningsController {
  constructor(private warnings: WarningsService) {}

  @ApiOperation({
    summary: 'The watch list: early warnings for the caller',
    description:
      'Finishes slipping past the baseline at the current rate, a cash gap in the next eight weeks, vendors late or rejected more often, stock running out before an order could arrive, machines idle or breaking down more than the month before, and sites with no DPR three days running. Each kind for the roles that can act on it, over the projects the caller may see.',
  })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.warnings.list(user);
  }

  @ApiOperation({ summary: 'Dismiss a warning with a reason', description: 'For the whole company, until its figures move on. Audited.' })
  @Post('dismiss')
  dismiss(@CurrentUser() user: RequestUser, @Body() dto: DismissWarningDto) {
    return this.warnings.dismiss(user, dto.key, dto.reason);
  }

  @ApiOperation({ summary: 'Bring back a dismissed warning', description: 'Audited.' })
  @Post('restore')
  restore(@CurrentUser() user: RequestUser, @Body() dto: WarningKeyDto) {
    return this.warnings.restore(user, dto.key);
  }
}
