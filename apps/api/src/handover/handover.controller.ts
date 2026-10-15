import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { HandoverService } from './handover.service';
import { CreateCloseoutItemDto, CreateDefectDto, DefectNoteDto, FixDefectDto, ListDefectsQuery, SaveHandoverDto, UpdateCloseoutItemDto, UpdateDefectDto } from './handover.dto';

@ApiTags('handover')
@ApiBearerAuth()
@Controller()
export class HandoverController {
  constructor(private handover: HandoverService) {}

  @ApiOperation({
    summary: "A project's handover: completion and the defect liability period, snags and defects in numbers, retention held, the close-out checklist",
    description: 'Retention and deposit held are null for roles that do not see the contract.',
  })
  @Get('projects/:projectId/handover')
  summary(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.handover.summary(user, projectId);
  }

  @ApiOperation({
    summary: 'Record or correct the completion certificate',
    description: 'Starts the defect liability period, marks the project completed and, when it has none, adds the standard close-out checklist. Project managers, management and admins.',
  })
  @Put('projects/:projectId/handover')
  save(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: SaveHandoverDto) {
    return this.handover.saveHandover(user, projectId, dto);
  }

  @ApiOperation({ summary: 'Remove a completion recorded by mistake; the project goes back to active' })
  @Delete('projects/:projectId/handover')
  remove(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.handover.removeHandover(user, projectId);
  }

  @ApiOperation({ summary: 'Start the close-out checklist from the standard lines (while it is empty)' })
  @Post('projects/:projectId/closeout/defaults')
  defaults(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.handover.addDefaultChecklist(user, projectId);
  }

  @ApiOperation({ summary: 'Add a line to the close-out checklist' })
  @Post('projects/:projectId/closeout')
  addItem(@CurrentUser() user: RequestUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateCloseoutItemDto) {
    return this.handover.addChecklistItem(user, projectId, dto);
  }

  @ApiOperation({ summary: 'Tick, untick or edit a checklist line' })
  @Patch('closeout/:id')
  updateItem(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateCloseoutItemDto) {
    return this.handover.updateChecklistItem(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a checklist line' })
  @Delete('closeout/:id')
  removeItem(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.handover.removeChecklistItem(user, id);
  }

  @ApiOperation({ summary: 'Snags and defects, open first', description: 'Paged. Filter by project, phase (snag or DLP defect), status, overdue, or assigned to me.' })
  @Get('defects')
  list(@CurrentUser() user: RequestUser, @Query() q: ListDefectsQuery) {
    return this.handover.listDefects(user, q);
  }

  @ApiOperation({ summary: 'One snag or defect' })
  @Get('defects/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.handover.getDefect(user, id);
  }

  @ApiOperation({ summary: 'Its history (reported, changed, fixed, closed, reopened)' })
  @Get('defects/:id/history')
  history(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.handover.defectHistory(user, id);
  }

  @ApiOperation({
    summary: 'Report a snag or defect, with photos',
    description: 'A defect (DEF-) once completion is recorded, a snag (SNG-) before, unless `phase` says otherwise. Send `id` to retry an offline report safely.',
  })
  @Post('defects')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDefectDto) {
    return this.handover.createDefect(user, dto);
  }

  @ApiOperation({ summary: 'Correct or assign it; null clears a field' })
  @Patch('defects/:id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDefectDto) {
    return this.handover.updateDefect(user, id, dto);
  }

  @ApiOperation({ summary: 'Mark it fixed, with what was done, the cost and photos after; QA/QC is told to check it' })
  @Post('defects/:id/fix')
  fix(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: FixDefectDto) {
    return this.handover.fixDefect(user, id, dto);
  }

  @ApiOperation({ summary: 'Accept the repair and close it (QA/QC or an approver); closing one not fixed needs a note' })
  @Post('defects/:id/close')
  close(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DefectNoteDto) {
    return this.handover.closeDefect(user, id, dto);
  }

  @ApiOperation({ summary: 'Not put right: back to open, the assignee is told' })
  @Post('defects/:id/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DefectNoteDto) {
    return this.handover.reopenDefect(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete one entered by mistake (QA/QC or an approver)' })
  @Delete('defects/:id')
  removeDefect(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.handover.removeDefect(user, id);
  }
}
