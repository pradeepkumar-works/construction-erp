import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TemplatesService } from './templates.service';
import { ApplyTemplateDto, SaveTemplateDto } from './templates.dto';

@ApiTags('activity templates')
@ApiBearerAuth()
@Controller()
export class TemplatesController {
  constructor(private templates: TemplatesService) {}

  @ApiOperation({ summary: 'Loose activities of every project type', description: '`isDefault` means the company has not saved its own and the standard type\'s list applies. Also part of GET /project-types.' })
  @Get('activity-templates')
  list(@CurrentUser() user: RequestUser) {
    return this.templates.list(user);
  }

  @Get('activity-templates/:typeCode')
  get(@CurrentUser() user: RequestUser, @Param('typeCode') typeCode: string) {
    return this.templates.get(user, typeCode);
  }

  @ApiOperation({ summary: 'Replace the loose activities of a project type (admin, management)', description: 'Send the whole list in order. An empty list goes back to the built-in one.' })
  @Put('activity-templates/:typeCode')
  save(@CurrentUser() user: RequestUser, @Param('typeCode') typeCode: string, @Body() dto: SaveTemplateDto) {
    return this.templates.save(user, typeCode, dto);
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
