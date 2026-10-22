import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BASELINE_ROLES, PROJECT_EDITOR_ROLES } from '@erp/shared';
import { ScheduleService } from './schedule.service';
import { CreateLinkDto, CreateMilestoneDto, ExportScheduleQuery, FreezeBaselineDto, ImportScheduleDto, UpdateLinkDto, UpdateMilestoneDto } from './schedule.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects/:projectId')
export class ScheduleController {
  constructor(private schedule: ScheduleService) {}

  @Get('gantt')
  gantt(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.schedule.gantt(user, projectId);
  }

  @Post('baseline')
  @Roles(...BASELINE_ROLES)
  freeze(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: FreezeBaselineDto) {
    return this.schedule.freezeBaseline(user, projectId, dto);
  }

  @Get('milestones')
  listMilestones(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.schedule.listMilestones(user, projectId);
  }

  @Post('milestones')
  @Roles(...PROJECT_EDITOR_ROLES)
  createMilestone(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateMilestoneDto) {
    return this.schedule.createMilestone(user, projectId, dto);
  }

  @Patch('milestones/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  updateMilestone(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateMilestoneDto) {
    return this.schedule.updateMilestone(user, projectId, id, dto);
  }

  @Delete('milestones/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  deleteMilestone(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.schedule.deleteMilestone(user, projectId, id);
  }

  @ApiOperation({ summary: 'Link two activities: the successor waits on the predecessor (FS, SS, FF or SF, with a lag in days)' })
  @Post('links')
  @Roles(...PROJECT_EDITOR_ROLES)
  createLink(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateLinkDto) {
    return this.schedule.createLink(user, projectId, dto);
  }

  @ApiOperation({ summary: 'Change a link’s kind or lag' })
  @Patch('links/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  updateLink(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLinkDto) {
    return this.schedule.updateLink(user, projectId, id, dto);
  }

  @ApiOperation({ summary: 'Remove a link' })
  @Delete('links/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  deleteLink(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.deleteLink(user, projectId, id);
  }

  @ApiOperation({ summary: 'Move activities planned earlier than their links allow to the first day they do, keeping their length' })
  @Post('schedule/apply-links')
  @Roles(...PROJECT_EDITOR_ROLES)
  applyLinks(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.schedule.applyLinks(user, projectId);
  }

  @ApiOperation({ summary: 'Three weeks from this Monday: what is planned, what can start and what waits, and what is overdue' })
  @Get('lookahead')
  lookahead(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.schedule.lookahead(user, projectId);
  }

  @ApiOperation({ summary: 'The schedule as an MS Project XML or Primavera P6 XER file' })
  @Get('schedule/export')
  exportFile(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Query() q: ExportScheduleQuery) {
    return this.schedule.exportFile(user, projectId, q.format ?? 'MSP_XML');
  }

  @ApiOperation({ summary: 'Read an MS Project XML or P6 XER file into the project (dryRun to preview)' })
  @Post('schedule/import')
  @Roles(...PROJECT_EDITOR_ROLES)
  importFile(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: ImportScheduleDto) {
    return this.schedule.importFile(user, projectId, dto);
  }
}
