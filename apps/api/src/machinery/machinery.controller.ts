import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MachineryService } from './machinery.service';
import { FleetService } from './fleet.service';
import {
  CreateEquipmentDto,
  CreateMachineryLogDto,
  FleetPeriodQuery,
  FuelIssuesQuery,
  FuelPositionQuery,
  ListEquipmentQuery,
  ListMachineryLogsQuery,
  SaveEquipmentPartDto,
  UpdateEquipmentDto,
  UpdateEquipmentPartDto,
  UpdateMachineryLogDto,
} from './machinery.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('machinery')
@ApiBearerAuth()
@Controller()
export class MachineryController {
  constructor(
    private machinery: MachineryService,
    private fleet: FleetService,
  ) {}

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

  /* ---------- tyres and batteries (v5 item 93) ---------- */

  @ApiOperation({ summary: "A machine's tyres and batteries", description: 'With each one\'s life in hours or km (to removal, or to the latest meter reading while still on). `cost` only for cost viewers.' })
  @Get('equipment/:id/parts')
  parts(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.fleet.parts(user, id);
  }

  @ApiOperation({ summary: 'Record a tyre or battery fitted (store manager or approver)' })
  @Post('equipment/:id/parts')
  addPart(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveEquipmentPartDto) {
    return this.fleet.addPart(user, id, dto);
  }

  @ApiOperation({ summary: 'Change a tyre or battery, or record it coming off with `removedOn`, `removedMeter` and `removalReason`' })
  @Patch('equipment/:id/parts/:partId')
  updatePart(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('partId', ParseUUIDPipe) partId: string, @Body() dto: UpdateEquipmentPartDto) {
    return this.fleet.updatePart(user, id, partId, dto);
  }

  @Delete('equipment/:id/parts/:partId')
  removePart(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('partId', ParseUUIDPipe) partId: string) {
    return this.fleet.removePart(user, id, partId);
  }

  /* ---------- fleet use (v5 item 93) ---------- */

  @ApiOperation({ summary: "Each site's fuel position on a day", description: 'Per fuel item and site: opening, received, issued into machines, other issues and closing; and the day\'s fuel issues into machines.' })
  @Get('fleet/fuel-position')
  fuelPosition(@CurrentUser() user: RequestUser, @Query() q: FuelPositionQuery) {
    return this.fleet.fuelPosition(user, q);
  }

  @ApiOperation({ summary: 'Fuel issued into machines over a period' })
  @Get('fleet/fuel-issues')
  fuelIssues(@CurrentUser() user: RequestUser, @Query() q: FuelIssuesQuery) {
    return this.fleet.fuelIssues(user, q);
  }

  @ApiOperation({
    summary: 'Utilisation and availability per machine and category',
    description: 'From approved logs: available = days on site (days with a log) × the 8-hour shift; utilisation = worked ÷ available; availability = (available − breakdown) ÷ available.',
  })
  @Get('fleet/utilisation')
  utilisation(@CurrentUser() user: RequestUser, @Query() q: FleetPeriodQuery) {
    return this.fleet.utilisation(user, q);
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
