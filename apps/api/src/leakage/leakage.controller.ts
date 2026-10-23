import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { LeakageService } from './leakage.service';
import { LeakageQuery } from './leakage.dto';

@ApiTags('leakage')
@ApiBearerAuth()
@Controller('leakage')
export class LeakageController {
  constructor(private leakage: LeakageService) {}

  @ApiOperation({
    summary: "The month's leakage checks",
    description:
      'Item 121. Material used over the allowance or above the company median for the item, purchase order rates above what another site paid in the 30 days before, fuel issued into a machine with no log that day or beyond its norm, and hired machines paid for idle time: each with the rupees at risk, its working and the records it rests on. Each section for the roles in `leakageSections`, over the projects the caller may see.',
  })
  @Get()
  get(@CurrentUser() user: RequestUser, @Query() q: LeakageQuery) {
    return this.leakage.get(user, q.month);
  }
}
