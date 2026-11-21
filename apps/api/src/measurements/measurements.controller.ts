import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { canViewWorkOrders } from '@erp/shared';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MeasurementsService } from './measurements.service';
import { CreateMeasurementDto, ListMeasurementsQuery, ToMeasureQuery, UnderOrderQuery, UpdateMeasurementDto } from './measurements.dto';
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

  @ApiOperation({
    summary: 'What is still to measure on a project',
    description:
      'Each BOQ item with work approved on site that no measurement sheet holds yet: the approved quantity, what the ' +
      'sheets hold, the remainder and the days that make it up, oldest first. Only activities recording the item’s own unit count.',
  })
  @Get('to-measure')
  toMeasure(@CurrentUser() user: RequestUser, @Query() q: ToMeasureQuery) {
    return this.measurements.toMeasure(user, q.projectId, q.workOrderId);
  }

  @ApiOperation({
    summary: 'A work order against the daily reports',
    description:
      'Per BOQ line of the order: the approved quantity on days that name the order (DPR lines), what the sheets tagged to it hold, ' +
      'what its bills took and what is reported and still to measure. The subcontractor’s bill pays only the measured quantity.',
  })
  @Get('under-order')
  underOrder(@CurrentUser() user: RequestUser, @Query() q: UnderOrderQuery) {
    if (!canViewWorkOrders(user.roleKey)) throw new ForbiddenException('Your role cannot see work orders');
    return this.measurements.underOrder(user, q.workOrderId, q.upTo);
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
