import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_EDITOR_ROLES } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { StructureService } from './structure.service';
import { CreateWorkElementDto, ImportWorkElementsDto, ReorderWorkElementsDto, UpdateWorkElementDto } from './structure.dto';

@ApiTags('work breakdown')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects/:projectId/structure')
export class StructureController {
  constructor(private structure: StructureService) {}

  @ApiOperation({ summary: 'The work breakdown: components, sub-components and activities with rolled-up progress' })
  @Get()
  get(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.structure.get(user, projectId);
  }

  @ApiOperation({ summary: 'Add a component or sub-component, with the activities its template lays out' })
  @Post('elements')
  @Roles(...PROJECT_EDITOR_ROLES)
  create(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: CreateWorkElementDto) {
    return this.structure.createElement(user, projectId, dto);
  }

  @ApiOperation({ summary: 'Import components from Excel rows (outline number, name, kind, weight)' })
  @Post('elements/import')
  @Roles(...PROJECT_EDITOR_ROLES)
  import(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: ImportWorkElementsDto) {
    return this.structure.importElements(user, projectId, dto);
  }

  @Post('elements/reorder')
  @Roles(...PROJECT_EDITOR_ROLES)
  reorder(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: ReorderWorkElementsDto) {
    return this.structure.reorder(user, projectId, dto);
  }

  @Patch('elements/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  update(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateWorkElementDto) {
    return this.structure.updateElement(user, projectId, id, dto);
  }

  @Delete('elements/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  remove(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.structure.deleteElement(user, projectId, id);
  }
}
