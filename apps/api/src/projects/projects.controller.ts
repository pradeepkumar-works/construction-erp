import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

  /** The next code in the company's series, offered on the New project form. */
  @Get('next-code')
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  nextCode(@CurrentUser() user: RequestUser, @Query() q: NextProjectCodeQuery) {
    return this.projects.nextCode(user, q.type);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.get(user, id);
  }

  /** The new project's setup checklist and the BOQ against the contract value. */
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

  @Post(':id/members/copy')
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  copyTeam(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CopyTeamDto) {
    return this.projects.copyTeam(user, id, dto);
  }

  @Delete(':id/members/:userId')
  @Roles('ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER')
  removeMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(user, id, userId);
  }
}
