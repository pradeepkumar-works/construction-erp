import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_TYPES, type ProjectType } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TemplatesService } from './templates.service';
import { ApplyTemplateDto, SaveTemplateDto } from './templates.dto';

const typePipe = new ParseEnumPipe(Object.fromEntries(PROJECT_TYPES.map((t) => [t, t])));

@ApiTags('activity templates')
@ApiBearerAuth()
@Controller()
export class TemplatesController {
  constructor(private templates: TemplatesService) {}

  @ApiOperation({ summary: 'Activity templates for every project type', description: '`isDefault` means the organisation has not saved its own and the built-in list applies.' })
  @Get('activity-templates')
  list(@CurrentUser() user: RequestUser) {
    return this.templates.list(user);
  }

  @Get('activity-templates/:projectType')
  get(@CurrentUser() user: RequestUser, @Param('projectType', typePipe) projectType: ProjectType) {
    return this.templates.get(user, projectType);
  }

  @ApiOperation({ summary: 'Replace the template for a project type (admin, management)', description: 'Send the whole list in order. An empty list goes back to the built-in one.' })
  @Put('activity-templates/:projectType')
  save(@CurrentUser() user: RequestUser, @Param('projectType', typePipe) projectType: ProjectType, @Body() dto: SaveTemplateDto) {
    return this.templates.save(user, projectType, dto);
  }

  @ApiOperation({
    summary: 'Add the template activities to a project',
    description: 'Scheduled over the project dates (scaled to fit when both are set). Activities with the same name are skipped. Planned quantities start at 0.',
  })
  @Post('projects/:projectId/activities/from-template')
  apply(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: ApplyTemplateDto) {
    return this.templates.apply(user, projectId, dto.names);
  }
}
