import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DrawingScheduleService } from './drawing-schedule.service';
import { AddDrawingNeedsDto, AsBuiltQuery, DrawingScheduleQuery, NextDrawingNoQuery, SaveDrawingNeedDto } from './drawing-schedule.dto';

/** Design and drawings part 1 (item 138): the drawing schedule, chasing late drawings, drawing numbers and the as-built check. */
@ApiTags('design')
@ApiBearerAuth()
@Controller('design')
export class DrawingScheduleController {
  constructor(private schedule: DrawingScheduleService) {}

  @ApiOperation({ summary: 'The drawings each project needs, from whom and by when, matched to the register by number; late ones first' })
  @Get('schedule')
  list(@CurrentUser() user: RequestUser, @Query() q: DrawingScheduleQuery) {
    return this.schedule.list(user, q);
  }

  @ApiOperation({ summary: "The next drawing number in the company's scheme (project, discipline, serial)" })
  @Get('next-no')
  nextNo(@CurrentUser() user: RequestUser, @Query() q: NextDrawingNoQuery) {
    return this.schedule.nextNo(user, q);
  }

  @ApiOperation({ summary: 'Drawings site builds from that have no as-built revision yet' })
  @Get('as-built-due')
  asBuilt(@CurrentUser() user: RequestUser, @Query() q: AsBuiltQuery) {
    return this.schedule.asBuiltDue(user, q);
  }

  @Get('schedule/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.get(user, id);
  }

  @ApiOperation({ summary: 'Add a drawing to the schedule' })
  @Post('schedule')
  create(@CurrentUser() user: RequestUser, @Body() dto: SaveDrawingNeedDto) {
    return this.schedule.create(user, dto);
  }

  @ApiOperation({ summary: 'Add many drawings at once' })
  @Post('schedule/lines')
  addMany(@CurrentUser() user: RequestUser, @Body() dto: AddDrawingNeedsDto) {
    return this.schedule.addMany(user, dto);
  }

  @Put('schedule/:id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDrawingNeedDto) {
    return this.schedule.update(user, id, dto);
  }

  @Delete('schedule/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.remove(user, id);
  }

  @ApiOperation({ summary: 'Draft a reminder letter for the drawings the same party owes on the project (late or due within a week)' })
  @Post('schedule/:id/remind')
  remind(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.remind(user, id);
  }

  @ApiOperation({ summary: "Record a late drawing from the client's side as a delay in the risk register" })
  @Post('schedule/:id/delay')
  delay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.recordDelay(user, id);
  }
}
