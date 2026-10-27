import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlanningService } from './planning.service';
import { BulkBoqDto, CreateActivityDto, CreateBoqItemDto, UpdateActivityDto, UpdateBoqItemDto } from './planning.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';

const EDITORS = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'] as const;

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects/:projectId')
export class PlanningController {
  constructor(private planning: PlanningService) {}

  @Get('boq')
  listBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.planning.listBoq(user, projectId);
  }

  @Post('boq')
  @Roles(...EDITORS)
  createBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateBoqItemDto) {
    return this.planning.createBoq(user, projectId, dto);
  }

  @Post('boq/bulk')
  @Roles(...EDITORS)
  bulkBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: BulkBoqDto) {
    return this.planning.bulkBoq(user, projectId, dto);
  }

  @Patch('boq/:id')
  @Roles(...EDITORS)
  updateBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateBoqItemDto) {
    return this.planning.updateBoq(user, projectId, id, dto);
  }

  @Delete('boq/:id')
  @Roles(...EDITORS)
  deleteBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planning.deleteBoq(user, projectId, id);
  }

  @Get('activities')
  listActivities(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.planning.listActivities(user, projectId);
  }

  @Post('activities')
  @Roles(...EDITORS)
  createActivity(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateActivityDto) {
    return this.planning.createActivity(user, projectId, dto);
  }

  @Patch('activities/:id')
  @Roles(...EDITORS)
  updateActivity(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.planning.updateActivity(user, projectId, id, dto);
  }

  @Delete('activities/:id')
  @Roles(...EDITORS)
  deleteActivity(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planning.deleteActivity(user, projectId, id);
  }
}
