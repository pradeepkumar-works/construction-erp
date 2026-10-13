import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MachineryService } from './machinery.service';
import { CreateEquipmentDto, CreateMachineryLogDto, ListEquipmentQuery, ListMachineryLogsQuery, UpdateEquipmentDto, UpdateMachineryLogDto } from './machinery.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('machinery')
@ApiBearerAuth()
@Controller()
export class MachineryController {
  constructor(private machinery: MachineryService) {}

  /* ---------- equipment master ---------- */

  @ApiOperation({ summary: 'Equipment master', description: 'Active machines by default. `rate` is returned only to approvers.' })
  @Get('equipment')
  listEquipment(@CurrentUser() user: RequestUser, @Query() q: ListEquipmentQuery) {
    return this.machinery.listEquipment(user, q);
  }

  @Get('equipment/:id')
  getEquipment(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.machinery.getEquipment(user, id);
  }

  @ApiOperation({ summary: 'Add a machine (approvers)' })
  @Post('equipment')
  createEquipment(@CurrentUser() user: RequestUser, @Body() dto: CreateEquipmentDto) {
    return this.machinery.createEquipment(user, dto);
  }

  @ApiOperation({ summary: 'Edit a machine, move it to another project or mark it inactive (approvers)' })
  @Patch('equipment/:id')
  updateEquipment(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.machinery.updateEquipment(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a machine that was never logged (approvers)' })
  @Delete('equipment/:id')
  removeEquipment(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.machinery.removeEquipment(user, id);
  }

  /* ---------- daily logs ---------- */

  @Get('machinery-logs')
  list(@CurrentUser() user: RequestUser, @Query() q: ListMachineryLogsQuery) {
    return this.machinery.list(user, q);
  }

  @Get('machinery-logs/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.machinery.get(user, id);
  }

  @ApiOperation({
    summary: 'Log a machine’s day',
    description:
      'Hours worked, idle and breakdown (together at most 24), diesel and hour-meter readings. One log per machine per day ' +
      '(rejected logs do not count); a second one is refused with 409. Submitted for approval unless `submit: false`.',
  })
  @Post('machinery-logs')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMachineryLogDto) {
    return this.machinery.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a machinery log', description: 'Same rules as other submissions. `attachmentIds`, when sent, replaces the photos. `submit: true` resubmits.' })
  @Patch('machinery-logs/:id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateMachineryLogDto) {
    return this.machinery.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a machinery log for approval' })
  @Post('machinery-logs/:id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.machinery.submit(user, id);
  }

  @Delete('machinery-logs/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.machinery.remove(user, id);
  }
}
