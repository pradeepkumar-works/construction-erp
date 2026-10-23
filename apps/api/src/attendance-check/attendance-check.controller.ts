import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { AttendanceCheckService } from './attendance-check.service';
import { AttendanceCheckQuery } from './attendance-check.dto';

@ApiTags('attendance-check')
@ApiBearerAuth()
@Controller('attendance-check')
export class AttendanceCheckController {
  constructor(private check: AttendanceCheckService) {}

  @ApiOperation({
    summary: "The month's attendance cross-check",
    description:
      "Item 124. Labour contractors' man-day bills against the head-count sheet, the named roll call and the biometric punches over each bill's days; workers on the roll call with no punch on a day the site's device worked; a crew's head count above its roll call; a site's head count above its DPR. Each flag with its working and, for HR and the project manager only, the workers it names. With `projectId`, also each day's figures. For `canSeeAttendanceCheck`.",
  })
  @Get()
  get(@CurrentUser() user: RequestUser, @Query() q: AttendanceCheckQuery) {
    return this.check.get(user, q.month, q.projectId);
  }
}
