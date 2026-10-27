import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MeasurementsService } from './measurements.service';
import { CreateMeasurementDto, ListMeasurementsQuery, UpdateMeasurementDto } from './measurements.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('measurements')
@ApiBearerAuth()
@Controller('measurements')
export class MeasurementsController {
  constructor(private measurements: MeasurementsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListMeasurementsQuery) {
    return this.measurements.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.measurements.get(user, id);
  }

  @ApiOperation({
    summary: 'Record a measurement book entry',
    description:
      'One BOQ item at one location, as lines of nos × length × breadth × depth (blank = 1; `deduct` lines count negative). ' +
      'Numbered MB-<year>-0001. Approved entries add up to the BOQ item’s `measuredQty`. Submitted for approval unless `submit: false`.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMeasurementDto) {
    return this.measurements.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a measurement', description: '`lines`, when sent, replaces all lines. `submit: true` resubmits.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateMeasurementDto) {
    return this.measurements.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a measurement for approval' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.measurements.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.measurements.remove(user, id);
  }
}
