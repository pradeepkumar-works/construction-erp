import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TypeUpdatesService } from './type-updates.service';
import { ApplyUpdatesDto } from './type-updates.dto';

@ApiTags('project types')
@ApiBearerAuth()
@Controller()
export class TypeUpdatesController {
  constructor(private updates: TypeUpdatesService) {}

  @ApiOperation({ summary: 'What projects of a type would gain from it now (admin, management)', description: 'Per project: the components, activities and loose activities it lacks, by name, and its progress now and after. Nothing is changed.' })
  @Get('project-types/:code/updates')
  typePreview(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.updates.preview(user, 'type', code);
  }

  @ApiOperation({ summary: 'Add to the chosen projects what their type now has (admin, management)', description: 'Only adds; what a project has stays as it is. The project is marked as on the type’s current version.' })
  @Post('project-types/:code/updates')
  typeApply(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: ApplyUpdatesDto) {
    return this.updates.apply(user, 'type', code, dto);
  }

  @ApiOperation({ summary: 'What components laid out from a kind would gain from its steps now (admin, management)' })
  @Get('component-kinds/:code/updates')
  kindPreview(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.updates.preview(user, 'kind', code);
  }

  @ApiOperation({ summary: 'Add a kind’s new steps to the components laid out from it, in the chosen projects (admin, management)' })
  @Post('component-kinds/:code/updates')
  kindApply(@CurrentUser() user: RequestUser, @Param('code') code: string, @Body() dto: ApplyUpdatesDto) {
    return this.updates.apply(user, 'kind', code, dto);
  }
}
