import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { WorkersService } from './workers.service';
import { CreateWorkerDto, ListWorkersQuery, MusterQuery, OutputQuery, RollCallQuery, SaveRollCallDto, UpdateWorkerDto } from './workers.dto';

@ApiTags('workers')
@ApiBearerAuth()
@Controller('workers')
export class WorkersController {
  constructor(private workers: WorkersService) {}

  @ApiOperation({ summary: 'List named workers', description: 'Paged; active workers unless `active=false`. `q` matches number, name, phone, contractor and trade.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListWorkersQuery) {
    return this.workers.list(user, q);
  }

  @ApiOperation({ summary: 'Roll call of a project on a day', description: 'Workers posted there that day (or already marked there), with their marks and the head count it gives.' })
  @Get('roll-call')
  rollCall(@CurrentUser() user: RequestUser, @Query() q: RollCallQuery) {
    return this.workers.rollCall(user, q);
  }

  @ApiOperation({
    summary: 'Mark the roll call',
    description:
      'Attendance recorders. Each entry sets a mark (a null status clears it); workers not listed keep theirs. The day\'s head-count sheet takes the counts ' +
      'for the contractor and trade pairs on the roll call. 409 once the DPR of that day is approved.',
  })
  @Put('roll-call')
  saveRollCall(@CurrentUser() user: RequestUser, @Body() dto: SaveRollCallDto) {
    return this.workers.saveRollCall(user, dto);
  }

  @ApiOperation({ summary: 'Monthly muster roll', description: 'Marks by day, man-days, overtime and wages per worker and per contractor, at current wage rates.' })
  @Get('muster')
  muster(@CurrentUser() user: RequestUser, @Query() q: MusterQuery) {
    return this.workers.muster(user, q);
  }

  @ApiOperation({ summary: 'Output per man-day', description: 'Man-days the roll call put on each activity against approved progress in the same period.' })
  @Get('output')
  output(@CurrentUser() user: RequestUser, @Query() q: OutputQuery) {
    return this.workers.output(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.workers.get(user, id);
  }

  @ApiOperation({ summary: 'Add a worker', description: 'The number (W-0001) is given by the server. The daily wage defaults to the labour rate of the trade.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkerDto) {
    return this.workers.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a worker, move them to another project or mark them as left' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateWorkerDto) {
    return this.workers.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a worker with no attendance', description: '409 once they have attendance; mark them as left instead.' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.workers.remove(user, id);
  }
}
