import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ProjectTypesService } from './project-types.service';
import { DprFormsService } from './dpr-forms.service';
import { NewComponentKindDto, NewProjectTypeDto, SaveComponentKindDto, SaveDprFormDto, SaveProjectTypeDto } from './project-types.dto';

@ApiTags('project types')
@ApiBearerAuth()
@Controller()
export class ProjectTypesController {
  constructor(private types: ProjectTypesService, private forms: DprFormsService) {}

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
  async create(@CurrentUser() user: RequestUser, @Body() dto: NewProjectTypeDto) {
    const made = await this.types.create(user, dto);
    if (dto.copyFrom) await this.forms.copy(user, dto.copyFrom, made.code);
    return made;
  }

  @ApiOperation({ summary: 'Save a project type: details, starting breakdown and loose activities (admin, management)', description: 'A standard type gets the company’s own copy. Projects keep the version they were made with.' })
  @Put('project-types/:code')
  save(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: SaveProjectTypeDto) {
    return this.types.save(user, code, dto);
  }

  @ApiOperation({ summary: 'Reset a standard type, or delete a type no project uses (admin, management)' })
  @Delete('project-types/:code')
  async remove(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    const done = await this.types.remove(user, code);
    // A standard type keeps its DPR form (it has its own reset); a deleted type of the company's own takes its versions with it.
    if (!done.reset) await this.forms.removeAll(user.organizationId, code);
    return done;
  }

  @ApiOperation({ summary: "A project type's DPR form (item 134 part 2)", description: 'The form new reports are made on (its latest saved version, else the standard form of the type), every saved version with how many reports it holds, and whether the company records progress only through DPRs.' })
  @Get('project-types/:code/dpr-form')
  dprForm(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.forms.versions(user, code);
  }

  @ApiOperation({ summary: "Save a type's DPR form as a new version (admin, management)", description: 'It applies from the next report on every project of the type; reports made already keep their version. A field of the company\'s own keeps its kind and where it is once saved.' })
  @Put('project-types/:code/dpr-form')
  saveDprForm(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: SaveDprFormDto) {
    return this.forms.save(user, code, dto.definition);
  }

  @ApiOperation({ summary: "Put a type's DPR form back to its standard form, as a new version (admin, management)" })
  @Delete('project-types/:code/dpr-form')
  resetDprForm(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.forms.reset(user, code);
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
