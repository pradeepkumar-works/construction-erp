import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BASELINE_ROLES, PROJECT_EDITOR_ROLES } from '@erp/shared';
import { ScheduleService } from './schedule.service';
import { CreateMilestoneDto, FreezeBaselineDto, UpdateMilestoneDto } from './schedule.dto';
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
}
