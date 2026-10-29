import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  @ApiOperation({
    summary: 'Headlines of the checks that have pages of their own',
    description:
      'Intelligence quick win Q0, for the watch list. Leakage this month, the cash forecast\'s first short week, work measured and not billed, man-days billed above the records, and whether Ask Nirmaan is off (for admins). Each check only for the roles its page lets in (`insightKeysFor`), read through its own service.',
  })
  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.insights.get(user);
  }
}
