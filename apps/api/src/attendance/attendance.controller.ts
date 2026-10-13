import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { AttendanceService } from './attendance.service';
import { AttendanceDayQuery, AttendanceSuggestionsQuery, CreateAttendanceDto, ListAttendanceQuery, UpdateAttendanceDto } from './attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @ApiOperation({ summary: 'List attendance sheets', description: 'Paged; `q` matches project, recorder, remarks, contractor and trade.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListAttendanceQuery) {
    return this.attendance.list(user, q);
  }

  @ApiOperation({ summary: 'Attendance of one project on one day', description: 'Returns `sheet: null` when nothing was recorded. Used by the DPR forms to fill manpower.' })
  @Get('day')
  day(@CurrentUser() user: RequestUser, @Query() q: AttendanceDayQuery) {
    return this.attendance.day(user, q);
  }

  @ApiOperation({ summary: 'Contractor and trade names used before, for pickers' })
  @Get('suggestions')
  suggestions(@CurrentUser() user: RequestUser, @Query() q: AttendanceSuggestionsQuery) {
    return this.attendance.suggestions(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.attendance.get(user, id);
  }

  @ApiOperation({
    summary: 'Record attendance for a project and day',
    description:
      'Site supervisors, site engineers and approvers. One sheet per project per day (409 if the day is already recorded, or if its DPR is approved). ' +
      'Send a client-generated `id` to make retries safe.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAttendanceDto) {
    return this.attendance.create(user, dto);
  }

  @ApiOperation({ summary: 'Correct an attendance sheet', description: '`lines`, when sent, replaces every row. Refused once the DPR of that day is approved.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendance.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.attendance.remove(user, id);
  }
}
