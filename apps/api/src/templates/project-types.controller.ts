import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ProjectTypesService } from './project-types.service';
import { NewComponentKindDto, NewProjectTypeDto, SaveComponentKindDto, SaveProjectTypeDto } from './project-types.dto';

@ApiTags('project types')
@ApiBearerAuth()
@Controller()
export class ProjectTypesController {
  constructor(private types: ProjectTypesService) {}

  @ApiOperation({ summary: "The company's project types (item 134)", description: 'The standard types (or the company’s copies of them) and its own, each with its starting breakdown, loose activities and how many projects use it.' })
  @Get('project-types')
  list(@CurrentUser() user: RequestUser) {
    return this.types.list(user);
  }

  @Get('project-types/:code')
  get(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.types.get(user, code);
  }

  @ApiOperation({ summary: 'A new project type of the company’s own (admin, management)' })
  @Post('project-types')
  create(@CurrentUser() user: RequestUser, @Body() dto: NewProjectTypeDto) {
    return this.types.create(user, dto);
  }

  @ApiOperation({ summary: 'Save a project type: details, starting breakdown and loose activities (admin, management)', description: 'A standard type gets the company’s own copy. Projects keep the version they were made with.' })
  @Put('project-types/:code')
  save(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: SaveProjectTypeDto) {
    return this.types.save(user, code, dto);
  }

  @ApiOperation({ summary: 'Reset a standard type, or delete a type no project uses (admin, management)' })
  @Delete('project-types/:code')
  remove(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.types.remove(user, code);
  }

  @ApiOperation({ summary: "The company's component kinds (item 134)", description: 'The built-in kinds (or the company’s copies) and its own, with how many components were laid out from each.' })
  @Get('component-kinds')
  kinds(@CurrentUser() user: RequestUser) {
    return this.types.listKinds(user);
  }

  @Post('component-kinds')
  createKind(@CurrentUser() user: RequestUser, @Body() dto: NewComponentKindDto) {
    return this.types.createKind(user, dto);
  }

  @ApiOperation({ summary: 'Save a component kind: specs and steps (admin, management)', description: 'Components already laid out keep their activities.' })
  @Put('component-kinds/:code')
  saveKind(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: SaveComponentKindDto) {
    return this.types.saveKind(user, code, dto);
  }

  @ApiOperation({ summary: 'Reset a built-in kind, or delete a kind nothing uses (admin, management)' })
  @Delete('component-kinds/:code')
  removeKind(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.types.removeKind(user, code);
  }
}
