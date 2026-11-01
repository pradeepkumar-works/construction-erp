import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PROJECT_EDITOR_ROLES } from '@erp/shared';
import { PlanningService } from './planning.service';
import { BulkBoqDto, CreateActivityDto, CreateBoqItemDto, LinkBoqDto, UpdateActivityDto, UpdateBoqItemDto } from './planning.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';

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
  @Roles(...PROJECT_EDITOR_ROLES)
  createBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateBoqItemDto) {
    return this.planning.createBoq(user, projectId, dto);
  }

  @Post('boq/bulk')
  @Roles(...PROJECT_EDITOR_ROLES)
  bulkBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: BulkBoqDto) {
    return this.planning.bulkBoq(user, projectId, dto);
  }

  @Patch('boq/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  updateBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateBoqItemDto) {
    return this.planning.updateBoq(user, projectId, id, dto);
  }

  @Delete('boq/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  deleteBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planning.deleteBoq(user, projectId, id);
  }

  @Get('activities/boq-links')
  boqLinkSuggestions(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.planning.boqLinkSuggestions(user, projectId);
  }

  @Post('activities/boq-links')
  @Roles(...PROJECT_EDITOR_ROLES)
  linkBoq(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: LinkBoqDto) {
    return this.planning.linkBoq(user, projectId, dto);
  }

  @Get('activities')
  listActivities(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.planning.listActivities(user, projectId);
  }

  @Post('activities')
  @Roles(...PROJECT_EDITOR_ROLES)
  createActivity(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateActivityDto) {
    return this.planning.createActivity(user, projectId, dto);
  }

  @Patch('activities/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  updateActivity(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.planning.updateActivity(user, projectId, id, dto);
  }

  @Delete('activities/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  deleteActivity(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planning.deleteActivity(user, projectId, id);
  }
}
