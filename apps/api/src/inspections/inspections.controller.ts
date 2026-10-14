import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CHECKLIST_ADMIN_ROLES } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { InspectionsService } from './inspections.service';
import { ChecklistTemplateInputDto, CreateInspectionDto, InspectDto, ListInspectionsQuery, UpdateChecklistTemplateDto, UpdateInspectionDto } from './inspections.dto';

@ApiTags('inspections')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(private inspections: InspectionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListInspectionsQuery) {
    return this.inspections.list(user, q);
  }

  @ApiOperation({ summary: "The organisation's inspection checklists" })
  @Get('checklists')
  checklists(@CurrentUser() user: RequestUser) {
    return this.inspections.checklists(user);
  }

  @Post('checklists')
  @Roles(...CHECKLIST_ADMIN_ROLES)
  createChecklist(@CurrentUser() user: RequestUser, @Body() dto: ChecklistTemplateInputDto) {
    return this.inspections.createChecklist(user, dto);
  }

  @ApiOperation({ summary: 'Add the standard checklists not there yet (matched by name)' })
  @Post('checklists/standard')
  @Roles(...CHECKLIST_ADMIN_ROLES)
  addStandard(@CurrentUser() user: RequestUser) {
    return this.inspections.addStandardChecklists(user);
  }

  @Patch('checklists/:id')
  @Roles(...CHECKLIST_ADMIN_ROLES)
  updateChecklist(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateChecklistTemplateDto) {
    return this.inspections.updateChecklist(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a checklist', description: 'Inspections already requested keep their copy of the points.' })
  @Delete('checklists/:id')
  @Roles(...CHECKLIST_ADMIN_ROLES)
  deleteChecklist(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inspections.deleteChecklist(user, id);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inspections.get(user, id);
  }

  @ApiOperation({
    summary: 'Request an inspection',
    description:
      'An activity at a location, ready on `date`. The checklist points are copied from `checklistTemplateId` (default: the activity’s checklist) or given as `items`. ' +
      'Numbered INS-<year>-0001. Sent to QA/QC unless `submit: false`.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateInspectionDto) {
    return this.inspections.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit an inspection request', description: 'Changing the activity, checklist or points starts the checklist afresh. `submit: true` requests it again.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateInspectionDto) {
    return this.inspections.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Request (or request again) an inspection' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inspections.submit(user, id);
  }

  @ApiOperation({
    summary: 'Inspect: record each point and pass, fail or ask for re-inspection',
    description: 'For whoever approves inspections (QA/QC by default). APPROVE needs no point Not OK; REJECT and REQUEST_CHANGES need a point Not OK or a note.',
  })
  @Post(':id/inspect')
  inspect(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: InspectDto) {
    return this.inspections.inspect(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inspections.remove(user, id);
  }
}
