import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PROJECT_ADMIN_ROLES } from '@erp/shared';
import { ProjectsService } from './projects.service';
import { AddMemberDto, CopyTeamDto, CreateProjectDto, ListProjectsQuery, NextProjectCodeQuery, ProjectSetupHiddenDto, UpdateProjectDto } from './projects.dto';
import { ProjectSetupService } from './project-setup.service';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private projects: ProjectsService,
    private setup: ProjectSetupService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListProjectsQuery) {
    return this.projects.list(user, q);
  }

  /** The next code in the company's series, offered on the New project form (finding 17 of the October review). */
  @Get('next-code')
  @Roles(...PROJECT_ADMIN_ROLES)
  nextCode(@CurrentUser() user: RequestUser, @Query() q: NextProjectCodeQuery) {
    return this.projects.nextCode(user, q.type);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.get(user, id);
  }

  /** The new project's setup checklist and the BOQ against the contract value (finding 6 of the October review). */
  @Get(':id/setup')
  setupOf(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.setup.get(user, id);
  }

  @Put(':id/setup')
  hideSetup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ProjectSetupHiddenDto) {
    return this.setup.setHidden(user, id, dto.hidden);
  }

  @Get(':id/audit')
  audit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.audits(user, id);
  }

  @Post()
  @Roles(...PROJECT_ADMIN_ROLES)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Patch(':id')
  @Roles(...PROJECT_ADMIN_ROLES)
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, id, dto);
  }

  @Post(':id/members')
  @Roles(...PROJECT_ADMIN_ROLES)
  addMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.projects.addMember(user, id, dto);
  }

  @Post(':id/members/copy')
  @Roles(...PROJECT_ADMIN_ROLES)
  copyTeam(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CopyTeamDto) {
    return this.projects.copyTeam(user, id, dto);
  }

  @Delete(':id/members/:userId')
  @Roles(...PROJECT_ADMIN_ROLES)
  removeMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(user, id, userId);
  }
}
