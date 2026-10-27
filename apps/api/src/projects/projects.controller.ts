import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { AddMemberDto, CreateProjectDto, ListProjectsQuery, UpdateProjectDto } from './projects.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListProjectsQuery) {
    return this.projects.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.get(user, id);
  }

  @Get(':id/audit')
  audit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.audits(user, id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, id, dto);
  }

  @Post(':id/members')
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  addMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.projects.addMember(user, id, dto);
  }

  @Delete(':id/members/:userId')
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  removeMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(user, id, userId);
  }
}
