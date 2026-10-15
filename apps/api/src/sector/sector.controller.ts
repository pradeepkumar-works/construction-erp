import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SectorProgressDto } from '@erp/shared';
import { CurrentUser, type RequestUser } from '../common/current-user';
import { SectorService } from './sector.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class SectorController {
  constructor(private sector: SectorService) {}

  @Get(':id/sector-progress')
  @ApiOperation({
    summary: 'Sector progress',
    description:
      'Road: a chainage strip per activity from approved (and waiting) progress. Building: floor by activity. Water supply: village by activity, ' +
      'and pipe ordered (approved POs for items named pipe, in metres), supplied (received), laid and tested (activities in metres; "test" in the name means tested).',
  })
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<SectorProgressDto> {
    return this.sector.get(user, id);
  }
}
