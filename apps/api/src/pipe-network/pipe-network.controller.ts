import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_EDITOR_ROLES } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { PipeNetworkService } from './pipe-network.service';
import { PipeNetworkImportDto, UpdatePipeSegmentDto } from './pipe-network.dto';

@ApiTags('pipe network')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects/:projectId/pipe-network')
export class PipeNetworkController {
  constructor(private network: PipeNetworkService) {}

  @ApiOperation({ summary: 'Pipe zones and mains with their junctions and segments, stage progress per segment, zone tables and working fronts' })
  @Get()
  get(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string) {
    return this.network.get(user, projectId);
  }

  @ApiOperation({ summary: "Load or refresh a zone's network (nodes and pipes read from an EPANET or Excel file), matched by code; dryRun previews" })
  @Post('import')
  @Roles(...PROJECT_EDITOR_ROLES)
  import(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Body() dto: PipeNetworkImportDto) {
    return this.network.import(user, projectId, dto);
  }

  @ApiOperation({ summary: 'Correct a segment: length (not below the work on it), diameter, material, class, scope' })
  @Patch('segments/:id')
  @Roles(...PROJECT_EDITOR_ROLES)
  updateSegment(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdatePipeSegmentDto) {
    return this.network.updateSegment(user, projectId, id, dto);
  }
}
